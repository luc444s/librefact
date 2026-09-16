import { useMutation, useQuery, useQueryClient } from "../../../../../apps/web/src/lib/react-query";
import { FormEvent, useEffect, useState } from "react";
import { createDispatch, getOrder, listOrders, listSuppliers } from "../api";
import { listCylindersWithFilters } from "../../../../logistics/frontend/api/cylinder-list";
import { listActiveVehicleSessions } from "../../../../logistics/frontend/api/sessions";
import { listAllProducts } from "../../../../productos/frontend/api";
import { Button } from "@systutor/shell/ui/button";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Badge } from "@systutor/shell/ui/badge";
import { Combobox } from "@systutor/shell/ui/combobox";
import { Alert } from "@systutor/shell/ui/alert";

type Props = {
  open: boolean;
  onClose: () => void;
};

const SERVICE_TYPES = [
  "LLENADO", "PH", "RETIMBRADO", "INSPECCION", "REPARACION",
  "CAMBIO_VALVULA", "ACONDICIONAMIENTO", "CERTIFICACION", "MIXTO",
];

const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  ORDERED: "Ordenada",
  PARTIAL: "Parcial",
  RECEIVED: "Recibida",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

type CylRow = { cylinder_id: string; serial: string; product_id: string; service_type: string };

export function DispatchFormModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [cyls, setCyls] = useState<CylRow[]>([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    setCyls([]);
    setError(null);
  }, [orderId]);

  const suppliersQuery = useQuery({
    queryKey: ["compras", "suppliers"],
    queryFn: () => listSuppliers(),
    enabled: open,
  });

  const ordersQuery = useQuery({
    queryKey: ["compras", "orders", "dispatch-form"],
    queryFn: () => listOrders({ limit: 200 }),
    enabled: open,
  });

  const orderDetailQuery = useQuery({
    queryKey: ["compras", "orders", "dispatch-form", orderId],
    queryFn: () => getOrder(orderId),
    enabled: open && Boolean(orderId),
  });

  const productsQuery = useQuery({
    queryKey: ["productos", "all-active", "dispatch-form"],
    queryFn: () => listAllProducts({ is_active: true }),
    enabled: open,
  });

  // Jornadas operativas para vínculo OPCIONAL (§9/§32: solo si va en camión propio)
  const jornadasQuery = useQuery({
    queryKey: ["logistics", "vehicle-sessions", "active", "despacho"],
    queryFn: listActiveVehicleSessions,
    enabled: open,
  });
  const [sessionId, setSessionId] = useState("");
  const orderDetail = orderDetailQuery.data ?? null;
  const productsById = new Map((productsQuery.data ?? []).map((product) => [product.id, product]));

  const createMut = useMutation({
    mutationFn: () => createDispatch({
      supplier_id: supplierId,
      order_id: orderId || null,
      session_id: sessionId || null,
      cylinders: cyls.map(c => ({ cylinder_id: c.cylinder_id, product_id: c.product_id || null, service_type: c.service_type })),
      dispatch_date: new Date().toISOString().slice(0, 10),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras", "dispatches"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al crear salida"),
  });

  function addCyl(row: CylRow) {
    if (cyls.some(c => c.cylinder_id === row.cylinder_id)) {
      setError(`El serial ${row.serial} ya está en la lista`);
      return;
    }
    setError(null);
    setCyls(p => [...p, row]);
  }
  function updateService(i: number, value: string) {
    setCyls(p => p.map((row, j) => (j === i ? { ...row, service_type: value } : row)));
  }
  function removeCyl(i: number) { setCyls(p => p.filter((_, j) => j !== i)); }

  const supplierOptions = (suppliersQuery.data ?? []).map(s => ({ value: s.id, label: s.commercial_name ?? s.name }));
  const orderOptions = (ordersQuery.data?.items ?? [])
    .filter((order) => ["ORDERED", "PARTIAL"].includes(order.status))
    .map((order) => ({
      value: order.id,
      label: `${order.id.slice(0, 8)} · ${order.supplier?.commercial_name ?? order.supplier?.name ?? "Sin proveedor"} · ${ORDER_STATUS_LABEL[order.status] ?? order.status} · ${order.order_date}`,
    }));

  const orderProductCounts = orderDetail?.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.product_id] = Number(item.quantity);
    return acc;
  }, {}) ?? {};

  const selectedCounts = cyls.reduce<Record<string, number>>((acc, cyl) => {
    if (!cyl.product_id) return acc;
    acc[cyl.product_id] = (acc[cyl.product_id] ?? 0) + 1;
    return acc;
  }, {});

  const allowedProductIds = orderDetail ? new Set(orderDetail.items.map((item) => item.product_id)) : null;

  const orderSummary = orderDetail ? orderDetail.items.map((item) => {
    const product = productsById.get(item.product_id);
    const used = selectedCounts[item.product_id] ?? 0;
    const pending = Math.max(Number(item.quantity) - used, 0);
    return {
      product_id: item.product_id,
      label: product ? `${product.sku} · ${product.name}` : item.product_id,
      pending,
      used,
    };
  }) : [];

  const orderProductLabels = orderSummary.reduce<Record<string, string>>((acc, item) => {
    acc[item.product_id] = item.label;
    return acc;
  }, {});

  return (
    <>
      <Dialog
        open={open}
        title="Nueva salida a proveedor"
        description="Selecciona proveedor y agrega los cilindros por serial. La custodia nace al confirmar la salida."
        onClose={onClose}
        maxWidthClassName="max-w-3xl"
      >
        <div className="space-y-4">
          {error ? <Alert title="Error">{error}</Alert> : null}
          <form
            className="space-y-4"
            onSubmit={(e: FormEvent) => { e.preventDefault(); createMut.mutate(); }}
          >
            <label className="block space-y-2 text-sm text-foreground">
              <span>Proveedor *</span>
              <Combobox
                value={supplierId}
                onChange={setSupplierId}
                options={supplierOptions}
                placeholder="Seleccionar proveedor"
                searchPlaceholder="Buscar proveedor"
              />
            </label>
            <label className="block space-y-2 text-sm text-foreground">
              <span>Orden de compra asociada (opcional)</span>
              <Combobox
                value={orderId}
                onChange={setOrderId}
                options={orderOptions}
                placeholder="Seleccionar orden de compra"
                searchPlaceholder="Buscar orden por proveedor, estado o fecha"
              />
            </label>

            {orderDetail ? (
              <div className="rounded-md border border-border p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Orden seleccionada</p>
                <div className="space-y-2">
                  {orderSummary.map((line) => (
                    <div key={line.product_id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                      <span className="font-medium text-foreground">{line.label}</span>
                      <span className="text-muted-foreground">Pendiente: {line.pending} · Ya usados: {line.used}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="block space-y-2 text-sm text-foreground">
              <span>Jornada de traslado (opcional — solo camión propio)</span>
              <Combobox
                value={sessionId}
                onChange={setSessionId}
                options={[
                  { value: "", label: "Sin jornada — transportista externo" },
                  ...(jornadasQuery.data ?? []).map(j => ({
                    value: j.id,
                    label: `${j.vehicle_plate} · ${j.status}`,
                  })),
                ]}
                placeholder="Seleccionar jornada"
                searchPlaceholder="Buscar placa"
              />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Envases ({cyls.length})</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={Boolean(orderId) && !orderDetail}
                  onClick={() => setQuickAddOpen(true)}
                >
                  Agregar serial
                </Button>
              </div>
              {cyls.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Todavía no agregaste seriales. Toca "Agregar serial" y buscálos uno por uno.
                </p>
              ) : null}
              {cyls.map((row, i) => (
                <div key={row.cylinder_id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Badge variant="secondary">{i + 1}</Badge>
                  <span className="flex-1 font-medium text-foreground">{row.serial}</span>
                  <div className="w-44">
                    <Combobox
                      value={row.service_type}
                      onChange={(v) => updateService(i, v)}
                      options={SERVICE_TYPES.map(s => ({ value: s, label: s }))}
                      placeholder="Servicio"
                    />
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => removeCyl(i)}>x</Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button
                type="submit"
                disabled={!supplierId || cyls.length === 0 || createMut.isPending}
              >
                Crear salida
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      <QuickAddSerialDialog
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onAdded={(row) => addCyl(row)}
        allowedProductIds={allowedProductIds}
        productLabels={orderProductLabels}
        productCaps={orderProductCounts}
        selectedCounts={selectedCounts}
      />
    </>
  );
}

type QuickAddProps = {
  open: boolean;
  onClose: () => void;
  onAdded: (row: CylRow) => void;
  allowedProductIds: Set<string> | null;
  productLabels: Record<string, string>;
  productCaps: Record<string, number>;
  selectedCounts: Record<string, number>;
};

/** Alta rápida de seriales al estilo jornadas: combobox de texto clásico,
 * elegís el cilindro y queda agregado sin cerrar para cargar el siguiente. */
function QuickAddSerialDialog({ open, onClose, onAdded, allowedProductIds, productLabels, productCaps, selectedCounts }: QuickAddProps) {
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [dupError, setDupError] = useState<string | null>(null);

  const cylindersQuery = useQuery({
    queryKey: ["compras", "dispatch-cylinders"],
    queryFn: () => listCylindersWithFilters({ per_page: 200 }),
    enabled: open,
  });

  const opciones = (cylindersQuery.data?.items ?? [])
    // No se ofrecen cilindros no disponibles: en ruta, bloqueados, de baja o
    // perdidos (§8 VISION-001). El backend re-valida al crear/confirmar.
    .filter(c => !["EN_RUTA", "BLOQUEADO", "DE_BAJA", "PERDIDO"].includes(c.current_state))
    .filter((c) => !allowedProductIds || allowedProductIds.has(c.product_id))
    .filter((c) => {
      if (!allowedProductIds) return true;
      const cap = productCaps[c.product_id] ?? 0;
      const used = selectedCounts[c.product_id] ?? 0;
      return used < cap;
    })
    .map(c => ({
      value: c.id,
      label: `${c.serial}${c.description ? ` · ${c.description}` : ""}${productLabels[c.product_id] ? ` · ${productLabels[c.product_id]}` : ""}`,
    }));

  function elegir(value: string) {
    if (!value) return;
    const c = (cylindersQuery.data?.items ?? []).find(x => x.id === value);
    if (!c) return;
    if (allowedProductIds && !allowedProductIds.has(c.product_id)) {
      setDupError(`El serial ${c.serial} no pertenece a la orden seleccionada`);
      return;
    }
    const cap = productCaps[c.product_id] ?? 0;
    const used = selectedCounts[c.product_id] ?? 0;
    if (allowedProductIds && used >= cap) {
      setDupError(`El producto ${productLabels[c.product_id] ?? c.product_id} ya llegó a su límite`);
      return;
    }
    onAdded({
      cylinder_id: c.id,
      serial: c.serial,
      product_id: c.product_id ?? "",
      service_type: "LLENADO",
    });
    setLastAdded(c.serial);
    setDupError(null);
  }

  return (
    <Dialog
      open={open}
      title="Agregar seriales"
      description="Elegí un cilindro del buscador. La lista ya respeta los productos de la orden seleccionada."
      onClose={onClose}
      maxWidthClassName="max-w-xl"
    >
      <div className="space-y-3">
        {dupError ? <Alert title="Duplicado">{dupError}</Alert> : null}
        {lastAdded ? (
          <p className="text-xs font-medium text-success">✓ {lastAdded} agregado — seguí cargando el siguiente.</p>
        ) : null}

        <Combobox
          key={lastAdded ?? "vacio"}
          value=""
          onChange={elegir}
          options={opciones}
          placeholder="Seleccionar cilindro..."
          searchPlaceholder="Buscar por serial o descripción..."
        />

        {cylindersQuery.data ? (
          <p className="text-xs text-muted-foreground">{opciones.length} cilindros disponibles</p>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Listo</Button>
        </div>
      </div>
    </Dialog>
  );
}
