import { useMutation, useQuery, useQueryClient } from "../../../../../../apps/web/src/lib/react-query";
import { FormEvent, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { getDispatch, getOrder, listTanks, receiveOrder, registerDispatchReturn } from "../../api";
import type { Dispatch, PurchaseOrderDetail, ReceiveCostLine } from "../../types";
import type { ProductListItem } from "../../../../../productos/frontend/types";
import { listCylindersWithFilters } from "../../../../../logistics/frontend/api/cylinder-list";
import type { LogisticsCylinder } from "../../../../../logistics/frontend/api/cylinders";
import { listWarehouses, getRealWarehouses } from "../../../../../logistics/frontend/api/warehouses";
import { ReceiptAdditionalCostsDialog } from "./ReceiptAdditionalCostsDialog";
import { ReceiptServiceLines, type ReceiptServiceLinesHandle } from "./ReceiptServiceLines";
import { Button } from "@systutor/shell/ui/button";
import { Dialog } from "@systutor/shell/ui/dialog";
import { DataTable } from "@systutor/shell/ui/data-table";
import { Input } from "@systutor/shell/ui/input";
import { Combobox } from "@systutor/shell/ui/combobox";
import { Badge } from "@systutor/shell/ui/badge";

function clampQuantity(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

const BLOCKED_CYLINDER_STATES = new Set(["EN_RUTA", "BLOQUEADO", "DE_BAJA", "PERDIDO"]);

type ReceiveItemDraft = {
  purchase_item_id: string;
  quantity: number;
  serials: string[];
  returnCylinderIds: string[];
  qty_accepted?: number;
  qty_rejected?: number;
};

export type ReceiptPanelHandle = {
  openReceiveDialog: (dispatchId: string) => void;
};

type ReceiptPanelProps = {
  setError: (value: string | null) => void;
  products: ProductListItem[];
};

export const ReceiptPanel = forwardRef<ReceiptPanelHandle, ReceiptPanelProps>(function ReceiptPanel({ setError, products }, ref) {
  const queryClient = useQueryClient();
  const serviceLinesRef = useRef<ReceiptServiceLinesHandle>(null);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isCostLinesOpen, setIsCostLinesOpen] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderDetail | null>(null);
  const [serialPickerItemId, setSerialPickerItemId] = useState<string | null>(null);
  const [serialPickerValue, setSerialPickerValue] = useState("");

  const [receiveForm, setReceiveForm] = useState<{
    warehouse_id: string;
    items: ReceiveItemDraft[];
    notes: string;
    tank_id: string;
    dispatch_id: string;
    cost_lines: ReceiveCostLine[];
  }>({ warehouse_id: "", items: [], notes: "", tank_id: "", dispatch_id: "", cost_lines: [] });

  const selectedOrderItems = selectedOrder?.items ?? [];
  const selectedDispatchCylinders = selectedDispatch?.cylinders ?? [];

  const receiveMut = useMutation({
    mutationFn: async () => {
      if (!selectedOrder) throw new Error("No order");

      const receiptItems = receiveForm.items.filter((item) => item.quantity > 0);
      const returnCylinderIds = receiveForm.items.flatMap((item) => item.returnCylinderIds);

      if (receiptItems.length) {
        await receiveOrder(selectedOrder.id, {
          warehouse_id: receiveForm.warehouse_id,
          items: receiptItems,
          notes: receiveForm.notes || null,
          tank_id: receiveForm.tank_id || null,
          dispatch_id: receiveForm.dispatch_id || null,
          cost_lines: receiveForm.cost_lines.length ? receiveForm.cost_lines : null,
        } as any);
      }

      if (returnCylinderIds.length) {
        await registerDispatchReturn(receiveForm.dispatch_id, returnCylinderIds);
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["compras", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["compras", "dispatches"] });
      setIsReceiveOpen(false);
      setError(null);
      if (selectedOrder && receiveForm.items.some((item) => item.quantity > 0)) {
        const orderId = selectedOrder.id;
        setSelectedOrder(null);
        setSelectedDispatch(null);
        const detail = await getOrder(orderId);
        const receipt = detail.receipts[detail.receipts.length - 1];
        if (receipt) serviceLinesRef.current?.openServiceLinesDialog(receipt.id);
      } else {
        setSelectedOrder(null);
        setSelectedDispatch(null);
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al recepcionar"),
  });

  const receiveProductId = selectedOrder?.items?.[0]?.product_id;
  const cylindersQuery = useQuery({
    queryKey: ["compras", "receipt-cylinders"],
    queryFn: () => listCylindersWithFilters({ per_page: 200 }),
    enabled: isReceiveOpen && Boolean(selectedOrder),
  });
  const tanksQuery = useQuery({
    queryKey: ["compras", "tanks", receiveProductId],
    queryFn: () => listTanks(receiveProductId),
    enabled: isReceiveOpen && Boolean(receiveProductId),
  });
  const warehousesQuery = useQuery({
    queryKey: ["logistics", "warehouses"],
    queryFn: listWarehouses,
  });
  const warehouseOptions = getRealWarehouses(warehousesQuery.data ?? []).map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }));

  const tankOptions = (tanksQuery.data ?? []).map((tank) => ({
    value: tank.id,
    label: `${tank.serial} · ${tank.description} (${tank.content_kg?.toFixed(1) ?? 0} kg)`,
  }));

  const receiveRows = receiveForm.items.map((item, index) => ({ ...item, index }));
  const hasReceiptSelection = receiveForm.items.some((item) => item.quantity > 0);
  const hasReturnSelection = receiveForm.items.some((item) => item.returnCylinderIds.length > 0);

  const receiveFormValid = (hasReceiptSelection || hasReturnSelection) && (!hasReceiptSelection || receiveForm.warehouse_id !== "") && (() => {
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
  })();

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
        serials: next.serials ?? [],
        returnCylinderIds: next.returnCylinderIds ?? [],
        qty_accepted: patch.quantity !== undefined ? quantity : patch.qty_accepted !== undefined ? accepted : quantity - rejected,
        qty_rejected: patch.quantity !== undefined ? 0 : patch.qty_rejected !== undefined ? rejected : quantity - accepted,
      };

      return { ...current, items };
    });
  }

  function setReceiveItemSerials(index: number, serials: string[]) {
    updateReceiveItem(index, {
      serials,
      quantity: serials.length,
      qty_accepted: serials.length,
      qty_rejected: 0,
    });
  }

  function setReceiveItemReturnCylinderIds(index: number, returnCylinderIds: string[]) {
    updateReceiveItem(index, { returnCylinderIds });
  }

  function openSerialPicker(itemId: string) {
    setSerialPickerItemId(itemId);
    setSerialPickerValue("");
  }

  const selectedSerialItem = receiveRows.find((row) => row.purchase_item_id === serialPickerItemId) ?? null;
  const selectedOrderItem = selectedOrderItems.find((item) => item.id === serialPickerItemId) ?? null;
  const selectedProduct = products.find((product) => product.id === selectedOrderItem?.product_id) ?? null;
  const selectedOrderItemPending = selectedOrderItem ? Math.max(0, selectedOrderItem.quantity - selectedOrderItem.received_qty) : 0;
  const serialOptions = selectedOrderItem
    ? [
        ...(cylindersQuery.data?.items ?? [])
          .filter((cylinder: LogisticsCylinder) => !BLOCKED_CYLINDER_STATES.has(cylinder.current_state))
          .filter((cylinder: LogisticsCylinder) => cylinder.product_id === selectedOrderItem.product_id)
          .filter((cylinder: LogisticsCylinder) => {
            if (!selectedSerialItem) return true;
            const usedElsewhere = receiveForm.items.some((item) => item.purchase_item_id !== selectedSerialItem.purchase_item_id && item.serials.includes(cylinder.serial));
            return selectedSerialItem.serials.includes(cylinder.serial) || !usedElsewhere;
          })
          .map((cylinder: LogisticsCylinder) => ({
            value: `receive:${cylinder.serial}`,
            label: `${cylinder.serial}${cylinder.description ? ` · ${cylinder.description}` : ""} · ${cylinder.current_state}`,
          })),
        ...selectedDispatchCylinders
          .filter((cylinder) => cylinder.status === "EN_CUSTODIA")
          .filter((cylinder) => cylinder.product_id === selectedOrderItem.product_id)
          .filter((cylinder) => {
            if (!selectedSerialItem) return true;
            return selectedSerialItem.returnCylinderIds.includes(cylinder.cylinder_id)
              || !receiveForm.items.some((item) => item.purchase_item_id !== selectedSerialItem.purchase_item_id && item.returnCylinderIds.includes(cylinder.cylinder_id));
          })
          .map((cylinder) => ({
            value: `return:${cylinder.cylinder_id}`,
            label: `${cylinder.serial ?? cylinder.cylinder_id} · EN_CUSTODIA`,
          })),
      ]
    : [];

  function openReceiveDialog(dispatchId: string) {
    getDispatch(dispatchId)
      .then((dispatch) => {
        if (!dispatch.order_id) {
          throw new Error("El despacho no tiene orden asociada");
        }
        return getOrder(dispatch.order_id).then((detail) => ({ dispatch, detail }));
      })
      .then(({ dispatch, detail }) => {
        setSelectedDispatch(dispatch);
        setSelectedOrder(detail);
        setReceiveForm({
          warehouse_id: "",
          items: detail.items
            .filter((item) => item.received_qty < item.quantity || dispatch.cylinders.some((cylinder) => cylinder.status === "EN_CUSTODIA" && cylinder.product_id === item.product_id))
            .map((item) => ({
              purchase_item_id: item.id,
              quantity: 0,
              serials: [],
              returnCylinderIds: [],
              qty_accepted: 0,
              qty_rejected: 0,
            })),
          notes: "",
          tank_id: "",
          dispatch_id: dispatch.id,
          cost_lines: [],
        });
        setSerialPickerItemId(null);
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
          setSelectedOrder(null);
          setSerialPickerItemId(null);
        }}
        widthClassName="w-[800px] max-w-[calc(100vw-2rem)]"
        maxWidthClassName="max-w-[800px]"
      >
        <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); if (receiveFormValid) receiveMut.mutate(); }}>
          <label className="block space-y-2 text-sm text-foreground">
            <span>Almacén destino *</span>
            <Combobox value={receiveForm.warehouse_id} onChange={(v) => setReceiveForm((p) => ({ ...p, warehouse_id: v }))} options={warehouseOptions} placeholder="Seleccionar almacén" searchPlaceholder="Buscar almacén" />
          </label>
          {tankOptions.length > 0 ? (
            <label className="block space-y-2 text-sm text-foreground">
              <span>Tanque criogénico destino</span>
              <Combobox value={receiveForm.tank_id} onChange={(v) => setReceiveForm((p) => ({ ...p, tank_id: v }))} options={tankOptions} placeholder="Seleccionar tanque (opcional)" searchPlaceholder="Buscar tanque" />
            </label>
          ) : null}
          {selectedOrder ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedOrder.supplier?.name ?? "Sin proveedor"}</p>
                  <p className="text-xs text-muted-foreground">Despacho {selectedDispatch?.id.slice(0, 8) ?? "-"} · Orden {selectedOrder.id.slice(0, 8)} · {selectedOrder.order_date} · {selectedOrder.status}</p>
                </div>
                <p className="text-xs text-muted-foreground">{selectedOrder.items.length} líneas activas</p>
              </div>
              <div className="space-y-2">
                {receiveRows.map((row) => {
                  const orderItem = selectedOrder.items.find((item) => item.id === row.purchase_item_id);
                  const product = products.find((p) => p.id === orderItem?.product_id);
                  const pending = Math.max(0, (orderItem?.quantity ?? 0) - (orderItem?.received_qty ?? 0));
                  return (
                    <div key={row.purchase_item_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{product ? `${product.sku} · ${product.name}` : orderItem?.product_id}</p>
                        <p className="text-xs text-muted-foreground">Línea · recibido {orderItem?.received_qty ?? 0} / ordenado {orderItem?.quantity ?? 0}</p>
                        {row.serials.length ? <p className="text-xs text-muted-foreground">Seriales seleccionados: {row.serials.join(", ")}</p> : null}
                        {row.returnCylinderIds.length ? <p className="text-xs text-muted-foreground">Retornos seleccionados: {row.returnCylinderIds.join(", ")}</p> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">Pendiente {pending}</p>
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
                    const orderItem = selectedOrder?.items.find((oi) => oi.id === row.purchase_item_id);
                    const product = products.find((p) => p.id === orderItem?.product_id);
                    return (
                      <div>
                        <p>{product ? `${product.sku} · ${product.name}` : `Producto ${orderItem?.product_id?.slice(0, 8) ?? "desconocido"}`}</p>
                        <p className="text-xs text-muted-foreground">Pendiente {Math.max(0, (orderItem?.quantity ?? 0) - (orderItem?.received_qty ?? 0))} · Recibido {orderItem?.received_qty ?? 0}</p>
                      </div>
                    );
                  },
                },
                {
                  key: "pending",
                  header: "Pendiente",
                  className: "w-24",
                  render: (row: (typeof receiveRows)[number]) => {
                    const orderItem = selectedOrder?.items.find((oi) => oi.id === row.purchase_item_id);
                    return Math.max(0, (orderItem?.quantity ?? 0) - (orderItem?.received_qty ?? 0));
                  },
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
                    const serialButtons = row.serials.map((serial) => (
                      <Button
                        key={serial}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setReceiveItemSerials(row.index, row.serials.filter((current) => current !== serial))}
                      >
                        {serial}
                      </Button>
                    ));
                    const returnButtons = row.returnCylinderIds.map((cylinderId) => {
                      const cylinder = selectedDispatchCylinders.find((current) => current.cylinder_id === cylinderId);
                      return (
                        <Button
                          key={cylinderId}
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setReceiveItemReturnCylinderIds(row.index, row.returnCylinderIds.filter((current) => current !== cylinderId))}
                        >
                          {cylinder?.serial ?? cylinderId}
                        </Button>
                      );
                    });

                    return (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">{serialButtons.length ? serialButtons : <span className="text-xs text-muted-foreground">Sin seriales</span>}</div>
                        <div className="flex flex-wrap gap-1">{returnButtons.length ? returnButtons : <span className="text-xs text-muted-foreground">Sin retornos</span>}</div>
                        <Button type="button" variant="secondary" size="sm" onClick={() => openSerialPicker(row.purchase_item_id)}>
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
            <Button type="button" variant="secondary" onClick={() => { setIsReceiveOpen(false); setSelectedDispatch(null); setSelectedOrder(null); setSerialPickerItemId(null); }}>Cancelar</Button>
            <Button type="submit" disabled={receiveMut.isPending || !receiveFormValid}>{receiveMut.isPending ? "Guardando..." : hasReturnSelection && !hasReceiptSelection ? "Registrar retorno" : "Recepcionar"}</Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={serialPickerItemId !== null}
        title="Seriales de envase"
        description={selectedOrderItem && selectedProduct ? `${selectedProduct.sku} · ${selectedProduct.name} · ${selectedSerialItem ? selectedSerialItem.serials.length + selectedSerialItem.returnCylinderIds.length : 0} seriales seleccionados` : "Selecciona seriales para la línea elegida."}
        onClose={() => {
          setSerialPickerItemId(null);
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
            onChange={(serial) => {
              if (!selectedSerialItem || !serial) return;
              const [kind, value] = serial.split(":", 2);
              if (kind === "receive") {
                if (selectedSerialItem.serials.includes(value)) return;
                if (selectedSerialItem.serials.length >= selectedOrderItemPending) return;
                setReceiveItemSerials(selectedSerialItem.index, [...selectedSerialItem.serials, value]);
              }
              if (kind === "return") {
                if (selectedSerialItem.returnCylinderIds.includes(value)) return;
                setReceiveItemReturnCylinderIds(selectedSerialItem.index, [...selectedSerialItem.returnCylinderIds, value]);
              }
              setSerialPickerValue("");
            }}
            options={serialOptions}
            placeholder="Seleccionar serial"
            searchPlaceholder="Buscar serial"
          />
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => { setSerialPickerItemId(null); setSerialPickerValue(""); }}>Listo</Button>
          </div>
        </div>
      </Dialog>
      <ReceiptAdditionalCostsDialog
        open={isCostLinesOpen}
        costLines={receiveForm.cost_lines}
        onChange={(value) => setReceiveForm((p) => ({ ...p, cost_lines: value }))}
        onClose={() => setIsCostLinesOpen(false)}
      />
      <ReceiptServiceLines ref={serviceLinesRef} setError={setError} />
    </>
  );
});
