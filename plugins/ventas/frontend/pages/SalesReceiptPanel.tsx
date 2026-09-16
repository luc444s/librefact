import { useMutation, useQuery, useQueryClient } from "../../../../apps/web/src/lib/react-query";
import { FormEvent, forwardRef, useImperativeHandle, useState } from "react";

import { Button } from "@systutor/shell/ui/button";
import { Dialog } from "@systutor/shell/ui/dialog";
import { DataTable } from "@systutor/shell/ui/data-table";
import { Input } from "@systutor/shell/ui/input";
import { Combobox } from "@systutor/shell/ui/combobox";
import { Badge } from "@systutor/shell/ui/badge";

import { createSalesReceipt, confirmSalesReceipt, getSalesDispatch } from "../api";
import type { SalesDispatch } from "../types";
import type { ProductListItem } from "../../../productos/frontend/types";
import { listWarehouses, getRealWarehouses } from "../../../logistics/frontend/api/warehouses";
import { SalesReceiptAdditionalCostsDialog } from "./SalesReceiptAdditionalCostsDialog";
import type { SalesReceiptCostLine } from "../types";

function clampQuantity(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

type ReceiveItemDraft = {
  product_id: string | null;
  source_quantity: number;
  cylinder_ids: string[];
  serials: string[];
  quantity: number;
  qty_accepted?: number;
  qty_rejected?: number;
};

type ReceiptPanelProps = {
  setError: (value: string | null) => void;
  products: ProductListItem[];
};

export type SalesReceiptPanelHandle = {
  openReceiveDialog: (dispatchId: string) => void;
};

function groupDispatchItems(dispatch: SalesDispatch): ReceiveItemDraft[] {
  const groups = new Map<string, ReceiveItemDraft>();
  for (const item of dispatch.items) {
    const key = item.product_id ?? item.cylinder_id;
    const current = groups.get(key) ?? {
      product_id: item.product_id,
      source_quantity: 0,
      cylinder_ids: [],
      serials: [],
      quantity: 0,
      qty_accepted: 0,
      qty_rejected: 0,
    };
    const quantity = Math.max(1, Number(item.outgoing_qty) || 0);
    current.source_quantity += quantity;
    current.cylinder_ids.push(item.cylinder_id);
    current.serials.push(item.serial ?? item.cylinder_id);
    groups.set(key, current);
  }
  return [...groups.values()];
}

export const SalesReceiptPanel = forwardRef<SalesReceiptPanelHandle, ReceiptPanelProps>(function SalesReceiptPanel({ setError, products }, ref) {
  const queryClient = useQueryClient();
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isCostLinesOpen, setIsCostLinesOpen] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<SalesDispatch | null>(null);
  const [serialPickerProductId, setSerialPickerProductId] = useState<string | null>(null);
  const [serialPickerValue, setSerialPickerValue] = useState("");

  const [receiveForm, setReceiveForm] = useState<{
    warehouse_id: string;
    items: ReceiveItemDraft[];
    notes: string;
    dispatch_id: string;
    cost_lines: SalesReceiptCostLine[];
  }>({ warehouse_id: "", items: [], notes: "", dispatch_id: "", cost_lines: [] });

  const selectedDispatchItems = selectedDispatch?.items ?? [];

  const warehousesQuery = useQuery({
    queryKey: ["logistics", "warehouses"],
    queryFn: listWarehouses,
    enabled: isReceiveOpen,
  });

  const warehouseOptions = getRealWarehouses(warehousesQuery.data ?? []).map((warehouse) => ({
    value: warehouse.id,
    label: `${warehouse.code} · ${warehouse.name}`,
  }));

  const serialOptions = serialPickerProductId
    ? selectedDispatchItems
        .filter((item) => item.product_id === serialPickerProductId)
        .filter((item) => {
          const selectedRow = receiveForm.items.find((row) => row.product_id === serialPickerProductId) ?? null;
          if (!selectedRow) return true;
          const usedElsewhere = receiveForm.items.some(
            (row) => row.product_id !== serialPickerProductId && row.cylinder_ids.includes(item.cylinder_id),
          );
          return selectedRow.cylinder_ids.includes(item.cylinder_id) || !usedElsewhere;
        })
        .map((item) => ({
          value: item.cylinder_id,
          label: `${item.serial ?? item.cylinder_id}${item.product_id ? ` · ${item.product_id}` : ""}`,
        }))
    : [];

  const receiveMut = useMutation({
    mutationFn: async () => {
      if (!selectedDispatch) throw new Error("No dispatch");
      if (!selectedDispatch.customer?.id) throw new Error("El despacho no tiene cliente");

      const receiptItems = receiveForm.items.filter((item) => item.quantity > 0);
      if (!receiptItems.length) throw new Error("No hay items para recepcionar");

      const cylinders = receiptItems.flatMap((item) => item.cylinder_ids.map((cylinder_id) => ({ cylinder_id, incoming_qty: 1 })));

      const receipt = await createSalesReceipt({
        customer_id: selectedDispatch.customer.id,
        receipt_date: new Date().toISOString().slice(0, 10),
        notes: receiveForm.notes || undefined,
        dispatch_id: selectedDispatch.id,
        warehouse_id: receiveForm.warehouse_id || undefined,
        cost_lines: receiveForm.cost_lines.length ? receiveForm.cost_lines : undefined,
        cylinders,
      });

      await confirmSalesReceipt(receipt.id);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["ventas", "ingresos-desde-cliente"] });
      queryClient.invalidateQueries({ queryKey: ["ventas", "salidas-a-cliente"] });
      setIsReceiveOpen(false);
      setError(null);
      setSelectedDispatch(null);
      setSerialPickerProductId(null);
      setSerialPickerValue("");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al recepcionar"),
  });

  const receiveRows = receiveForm.items.map((item, index) => ({ ...item, index }));
  const hasReceiptSelection = receiveForm.items.some((item) => item.quantity > 0);

  const receiveFormValid = hasReceiptSelection
    && (() => {
      const seen = new Set<string>();
      return receiveForm.items.every((item) => {
        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) return true;
        const accepted = Number(item.qty_accepted ?? quantity) || 0;
        const rejected = Number(item.qty_rejected ?? 0) || 0;
        if (!Number.isInteger(quantity)) return false;
        if (!item.serials.length || item.serials.length !== quantity) return false;
        if (new Set(item.serials).size !== item.serials.length) return false;
        if (!item.serials.every((serial) => {
          if (seen.has(serial)) return false;
          seen.add(serial);
          return true;
        })) return false;
        return accepted >= 0 && rejected >= 0 && accepted + rejected === quantity;
      });
    })()
    && receiveForm.warehouse_id !== "";

  function updateReceiveItem(index: number, patch: Partial<ReceiveItemDraft>) {
    setReceiveForm((current) => {
      const items = [...current.items];
      const next = { ...items[index], ...patch };
      const quantity = clampQuantity(Number(next.quantity) || 0, Number.MAX_SAFE_INTEGER);
      const accepted = clampQuantity(Number(next.qty_accepted ?? quantity) || 0, quantity);
      const rejected = clampQuantity(Number(next.qty_rejected ?? 0) || 0, quantity);

      items[index] = {
        ...next,
        quantity,
        cylinder_ids: next.cylinder_ids ?? [],
        serials: next.serials ?? [],
        qty_accepted: patch.quantity !== undefined ? quantity : patch.qty_accepted !== undefined ? accepted : quantity - rejected,
        qty_rejected: patch.quantity !== undefined ? 0 : patch.qty_rejected !== undefined ? rejected : quantity - accepted,
      };

      return { ...current, items };
    });
  }

  function setReceiveItemSerials(index: number, cylinders: Array<{ cylinder_id: string; serial: string }>) {
    updateReceiveItem(index, {
      cylinder_ids: cylinders.map((item) => item.cylinder_id),
      serials: cylinders.map((item) => item.serial),
      quantity: cylinders.length,
      qty_accepted: cylinders.length,
      qty_rejected: 0,
    });
  }

  function openSerialPicker(productId: string) {
    setSerialPickerProductId(productId);
    setSerialPickerValue("");
  }

  const selectedSerialItem = receiveRows.find((row) => row.product_id === serialPickerProductId) ?? null;
  const selectedProduct = products.find((product) => product.id === selectedSerialItem?.product_id) ?? null;

  function openReceiveDialog(dispatchId: string) {
    getSalesDispatch(dispatchId)
      .then((dispatch) => {
        setSelectedDispatch(dispatch);
        setReceiveForm({
          warehouse_id: "",
          items: groupDispatchItems(dispatch).map((item) => ({
            ...item,
            quantity: 0,
            qty_accepted: 0,
            qty_rejected: 0,
            cylinder_ids: [],
            serials: [],
          })),
          notes: "",
          dispatch_id: dispatch.id,
          cost_lines: [],
        });
        setSerialPickerProductId(null);
        setSerialPickerValue("");
        setIsCostLinesOpen(false);
        setIsReceiveOpen(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar despacho"));
  }

  useImperativeHandle(ref, () => ({ openReceiveDialog }));

  return (
    <>
      <Dialog
        open={isReceiveOpen}
        title="Recepcionar mercadería"
        description="Selecciona almacén y asigna seriales por línea de producto."
        onClose={() => {
          setIsReceiveOpen(false);
          setSelectedDispatch(null);
          setSerialPickerProductId(null);
        }}
        widthClassName="w-[800px] max-w-[calc(100vw-2rem)]"
        maxWidthClassName="max-w-[800px]"
      >
        <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); if (receiveFormValid) receiveMut.mutate(); }}>
          <label className="block space-y-2 text-sm text-foreground">
            <span>Almacén destino *</span>
            <Combobox value={receiveForm.warehouse_id} onChange={(v) => setReceiveForm((p) => ({ ...p, warehouse_id: v }))} options={warehouseOptions} placeholder="Seleccionar almacén" searchPlaceholder="Buscar almacén" />
          </label>

          {selectedDispatch ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedDispatch.customer?.name ?? selectedDispatch.customer_name ?? "Sin cliente"}</p>
                  <p className="text-xs text-muted-foreground">Despacho {selectedDispatch.id.slice(0, 8)} · {selectedDispatch.dispatch_date} · {selectedDispatch.status}</p>
                </div>
                <p className="text-xs text-muted-foreground">{selectedDispatch.items.length} líneas activas</p>
              </div>
              <div className="space-y-2">
                {receiveRows.map((row) => {
                  const product = products.find((p) => p.id === row.product_id);
                  return (
                    <div key={`${row.product_id ?? row.index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{product ? `${product.sku} · ${product.name}` : row.product_id ?? "Producto desconocido"}</p>
                        <p className="text-xs text-muted-foreground">Línea · recibido {row.quantity} / ordenado {row.source_quantity}</p>
                        {row.serials.length ? <p className="text-xs text-muted-foreground">Seriales seleccionados: {row.serials.join(", ")}</p> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">Pendiente {Math.max(0, row.source_quantity - row.quantity)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <span className="text-sm text-foreground">Items a recibir</span>
            <DataTable
              dense
              columns={[
                {
                  key: "product",
                  header: "Producto",
                  render: (row: (typeof receiveRows)[number]) => {
                    const product = products.find((p) => p.id === row.product_id);
                    return (
                      <div>
                        <p>{product ? `${product.sku} · ${product.name}` : `Producto ${row.product_id?.slice(0, 8) ?? "desconocido"}`}</p>
                        <p className="text-xs text-muted-foreground">Pendiente {Math.max(0, row.source_quantity - row.quantity)} · Recibido {row.quantity}</p>
                      </div>
                    );
                  },
                },
                {
                  key: "pending",
                  header: "Pendiente",
                  className: "w-24",
                  render: (row: (typeof receiveRows)[number]) => Math.max(0, row.source_quantity - row.quantity),
                },
                {
                  key: "received",
                  header: "Recibidas",
                  className: "w-24",
                  render: (row: (typeof receiveRows)[number]) => <Badge variant="secondary">{row.quantity}</Badge>,
                },
                {
                  key: "serials",
                  header: "Seriales",
                  className: "w-96",
                  render: (row: (typeof receiveRows)[number]) => {
                    const serialButtons = row.serials.map((serial, index) => (
                      <Button
                        key={serial}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const cylinders = row.cylinder_ids
                            .map((cylinderId, currentIndex) => ({ cylinder_id: cylinderId, serial: row.serials[currentIndex] }))
                            .filter((item) => item.serial !== serial || item.cylinder_id !== row.cylinder_ids[index]);
                          setReceiveItemSerials(row.index, cylinders);
                        }}
                      >
                        {serial}
                      </Button>
                    ));

                    return (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">{serialButtons.length ? serialButtons : <span className="text-xs text-muted-foreground">Sin seriales</span>}</div>
                        <Button type="button" variant="secondary" size="sm" onClick={() => openSerialPicker(row.product_id ?? row.index.toString())}>
                          Agregar serial
                        </Button>
                      </div>
                    );
                  },
                },
                {
                  key: "accepted",
                  header: "Aceptadas",
                  className: "w-28",
                  render: (row: (typeof receiveRows)[number]) => {
                    const accepted = row.qty_accepted ?? row.quantity;
                    return (
                      <Input
                        type="number"
                        min={0}
                        max={row.quantity}
                        value={accepted}
                        onChange={(e) => {
                          const nextAccepted = clampQuantity(Number(e.target.value) || 0, row.quantity);
                          updateReceiveItem(row.index, {
                            qty_accepted: nextAccepted,
                            qty_rejected: row.quantity - nextAccepted,
                          });
                        }}
                        title="Aceptadas"
                      />
                    );
                  },
                },
                {
                  key: "rejected",
                  header: "Rechazadas",
                  className: "w-28",
                  render: (row: (typeof receiveRows)[number]) => {
                    const rejected = row.qty_rejected ?? 0;
                    return (
                      <Input
                        type="number"
                        min={0}
                        max={row.quantity}
                        value={rejected}
                        onChange={(e) => {
                          const nextRejected = clampQuantity(Number(e.target.value) || 0, row.quantity);
                          updateReceiveItem(row.index, {
                            qty_rejected: nextRejected,
                            qty_accepted: row.quantity - nextRejected,
                          });
                        }}
                        title="Rechazadas"
                      />
                    );
                  },
                },
              ]}
              rows={receiveRows}
              rowKey={(row) => String(row.index)}
              emptyMessage="No hay items pendientes para recibir."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Costos adicionales</p>
                <p className="text-xs text-muted-foreground">{receiveForm.cost_lines.length ? `${receiveForm.cost_lines.length} registrados` : "Sin costos adicionales."}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setIsCostLinesOpen(true)}>Abrir costos</Button>
            </div>
          </div>

          <label className="block space-y-2 text-sm text-foreground"><span>Notas</span><Input value={receiveForm.notes} onChange={(e) => setReceiveForm((p) => ({ ...p, notes: e.target.value }))} /></label>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => { setIsReceiveOpen(false); setSelectedDispatch(null); setSerialPickerProductId(null); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={receiveMut.isPending || !receiveFormValid}>{receiveMut.isPending ? "Guardando..." : "Recepcionar"}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={serialPickerProductId !== null}
        title="Seriales de envase"
        description={selectedSerialItem && selectedProduct ? `${selectedProduct.sku} · ${selectedProduct.name} · ${selectedSerialItem.serials.length} seriales seleccionados` : "Selecciona seriales para la línea elegida."}
        onClose={() => {
          setSerialPickerProductId(null);
          setSerialPickerValue("");
        }}
      >
        <div className="space-y-4">
          <div className="rounded-md border border-border p-3 text-sm text-foreground">
            <p className="font-medium">{selectedProduct ? `${selectedProduct.sku} · ${selectedProduct.name}` : "Sin producto"}</p>
            <p className="text-xs text-muted-foreground">Solo seriales del producto de la línea. No se mezclan productos.</p>
          </div>
          <Combobox
            value={serialPickerValue}
            onChange={(cylinderId) => {
              if (!selectedSerialItem || !cylinderId) return;
              const item = selectedDispatchItems.find((current) => current.cylinder_id === cylinderId);
              if (!item) return;
              if (selectedSerialItem.cylinder_ids.includes(item.cylinder_id)) return;
              if (selectedSerialItem.cylinder_ids.length >= selectedSerialItem.source_quantity) return;
              const cylinders = [
                ...selectedSerialItem.cylinder_ids.map((currentCylinderId, index) => ({
                  cylinder_id: currentCylinderId,
                  serial: selectedSerialItem.serials[index],
                })),
                { cylinder_id: item.cylinder_id, serial: item.serial ?? item.cylinder_id },
              ];
              setReceiveItemSerials(selectedSerialItem.index, cylinders);
              setSerialPickerValue("");
            }}
            options={serialOptions}
            placeholder="Seleccionar serial"
            searchPlaceholder="Buscar serial"
          />
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => { setSerialPickerProductId(null); setSerialPickerValue(""); }}>Listo</Button>
          </div>
        </div>
      </Dialog>

      <SalesReceiptAdditionalCostsDialog
        open={isCostLinesOpen}
        costLines={receiveForm.cost_lines}
        onChange={(value) => setReceiveForm((p) => ({ ...p, cost_lines: value }))}
        onClose={() => setIsCostLinesOpen(false)}
      />
    </>
  );
});
