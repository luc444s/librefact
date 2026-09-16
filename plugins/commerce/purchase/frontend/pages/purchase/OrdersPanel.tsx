import { useMutation, useQuery, useQueryClient } from "../../../../../../apps/web/src/lib/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "../../../../../../apps/web/src/lib/router";
import {
  createOrder,
  listOrders,
  listSuppliers,
} from "../../api";
import type { OrderItemPayload, PurchaseOrder } from "../../types";
import type { ProductListItem } from "../../../../../productos/frontend/types";
import { Button } from "@systutor/shell/ui/button";
import { DataTable } from "@systutor/shell/ui/data-table";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Input } from "@systutor/shell/ui/input";
import { Combobox } from "@systutor/shell/ui/combobox";
import { Badge } from "@systutor/shell/ui/badge";
import { Alert } from "@systutor/shell/ui/alert";
import { CommerceSection } from "../../../../frontend/components";
import { SuppliersCatalogModal } from "../../components/SuppliersCatalogModal";
import { inferOrderItemBatchCost } from "./order-item-costs";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  ORDERED: "border-primary/30 bg-primary/10 text-primary",
  PARTIAL: "border-warning/30 bg-warning/10 text-warning",
  RECEIVED: "border-success/30 bg-success/10 text-success",
  CLOSED: "border-border bg-secondary text-secondary-foreground",
  CANCELLED: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  ORDERED: "Ordenada",
  PARTIAL: "Parcial",
  RECEIVED: "Recibida",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

type OrdersPanelProps = {
  error: string | null;
  setError: (value: string | null) => void;
  products: ProductListItem[];
  onOrderClick: (order: PurchaseOrder) => void;
};

export function OrdersPanel({ error, setError, products, onOrderClick }: OrdersPanelProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSuppliersOpen, setIsSuppliersOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [itemDraft, setItemDraft] = useState<{ product_id: string; quantity: string; unit_cost: string; batch_cost: string }>({
    product_id: "",
    quantity: "1",
    unit_cost: "",
    batch_cost: "",
  });
  const [batchCostTouched, setBatchCostTouched] = useState(false);

  const [createForm, setCreateForm] = useState<{
    supplier_id: string; items: OrderItemPayload[]; notes: string;
  }>({ supplier_id: "", items: [], notes: "" });

  const ordersQuery = useQuery({
    queryKey: ["compras", "orders", { status: statusFilter, page }],
    queryFn: () => listOrders({ status: statusFilter || undefined, limit: 20, offset: (page - 1) * 20 }),
  });
  const suppliersQuery = useQuery({
    queryKey: ["compras", "suppliers"],
    queryFn: () => listSuppliers(),
  });

  const createMut = useMutation({
    mutationFn: () => createOrder({ supplier_id: createForm.supplier_id, items: createForm.items, notes: createForm.notes || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["compras", "orders"] }); setIsCreateOpen(false); setCreateForm({ supplier_id: "", items: [], notes: "" }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al crear orden"),
  });

  function openNewItemDialog() {
    setEditingItemIndex(null);
    setItemDraft({ product_id: "", quantity: "1", unit_cost: "", batch_cost: "" });
    setBatchCostTouched(false);
    setIsItemDialogOpen(true);
  }

  function openEditItemDialog(index: number) {
    const item = createForm.items[index];
    if (!item) return;
    setEditingItemIndex(index);
    setItemDraft({
      product_id: item.product_id,
      quantity: String(item.quantity),
      unit_cost: String(item.unit_cost),
      batch_cost: String(item.batch_cost ?? inferOrderItemBatchCost(item.quantity, item.unit_cost) ?? 0),
    });
    setBatchCostTouched(false);
    setIsItemDialogOpen(true);
  }

  useEffect(() => {
    if (!isItemDialogOpen || batchCostTouched) return;
    const inferred = inferOrderItemBatchCost(itemDraft.quantity, itemDraft.unit_cost);
    setItemDraft((current) => {
      const nextBatchCost = inferred === null ? "" : String(inferred);
      return current.batch_cost === nextBatchCost ? current : { ...current, batch_cost: nextBatchCost };
    });
  }, [batchCostTouched, isItemDialogOpen, itemDraft.quantity, itemDraft.unit_cost]);

  function saveItemDraft() {
    const normalizedUnitCost = itemDraft.unit_cost.trim().replace(",", ".");
    const normalizedQuantity = itemDraft.quantity.trim().replace(",", ".");
    const normalizedBatchCost = itemDraft.batch_cost.trim().replace(",", ".");
    const parsedBatchCost = normalizedBatchCost ? Number(normalizedBatchCost) : inferOrderItemBatchCost(normalizedQuantity, normalizedUnitCost);
    const nextItem: OrderItemPayload = {
      product_id: itemDraft.product_id,
      quantity: Number(normalizedQuantity) || 0,
      unit_cost: Number(normalizedUnitCost) || 0,
      batch_cost: parsedBatchCost ?? undefined,
    };
    setCreateForm((current) => {
      const items = [...current.items];
      if (editingItemIndex === null) {
        return { ...current, items: [...items, nextItem] };
      }
      items[editingItemIndex] = nextItem;
      return { ...current, items };
    });
    setIsItemDialogOpen(false);
    setBatchCostTouched(false);
  }

  function removeItem(i: number) {
    setCreateForm((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }));
  }

  const supplierOptions = (suppliersQuery.data ?? []).map(s => ({ value: s.id, label: s.name }));
  const productOptions = products.map(p => ({ value: p.id, label: `${p.sku} · ${p.name}` }));
  const itemRows = createForm.items.map((item, index) => ({ ...item, index }));
  const inferredItemBatchCost = inferOrderItemBatchCost(itemDraft.quantity, itemDraft.unit_cost);
  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <CommerceSection
        title="Órdenes de compra"
        description="Gestiona órdenes a proveedores y accede al ingreso desde proveedor para recepcionar mercadería."
        actions={
          <div className="flex gap-2">
            <Link to="/app/commerce/ingreso-desde-proveedor">
              <Button variant="secondary">Ingreso desde proveedor</Button>
            </Link>
            <Button variant="secondary" onClick={() => setIsSuppliersOpen(true)}>Proveedores</Button>
            <Button onClick={() => { setCreateForm({ supplier_id: "", items: [], notes: "" }); setError(null); setIsCreateOpen(true); }}>Nueva orden</Button>
          </div>
        }
      >
        {error ? <Alert title="Error">{error}</Alert> : null}

        <div className="flex gap-2">
          <div className="max-w-xs">
            <Combobox
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={[
                { value: "", label: "Todos" },
                { value: "DRAFT", label: "Borrador" },
                { value: "ORDERED", label: "Confirmada" },
                { value: "PARTIAL", label: "Parcial" },
                { value: "RECEIVED", label: "Recibida" },
                { value: "CANCELLED", label: "Cancelada" },
              ]}
              placeholder="Filtrar por estado"
            />
          </div>
        </div>

        <DataTable
          onRowClick={onOrderClick}
          columns={[
            { key: "supplier", header: "Proveedor", render: (row) => row.supplier?.name ?? "-" },
            { key: "status", header: "Estado", render: (row) => <Badge className={STATUS_BADGE[row.status] ?? ""}>{STATUS_LABEL[row.status] ?? row.status}</Badge> },
            { key: "date", header: "Fecha", render: (row) => row.order_date },
          ]}
          rows={orders} rowKey={(row) => row.id} emptyMessage="No hay órdenes de compra."
        />

        {totalPages > 1 ? (
          <div className="flex justify-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span className="px-3 py-2 text-sm">{page} / {totalPages}</span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente</Button>
          </div>
        ) : null}

        <Dialog open={isCreateOpen} title="Nueva orden de compra" description="Selecciona proveedor y agrega productos." onClose={() => setIsCreateOpen(false)}>
          <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); createMut.mutate(); }}>
            <label className="block space-y-2 text-sm text-foreground"><span>Proveedor</span>
              <Combobox value={createForm.supplier_id} onChange={(v) => setCreateForm(p => ({ ...p, supplier_id: v }))} options={supplierOptions} placeholder="Seleccionar proveedor" searchPlaceholder="Buscar proveedor" />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Productos</span>
                <Button type="button" variant="secondary" onClick={openNewItemDialog}>+ Agregar</Button>
              </div>
              <DataTable
                dense
                columns={[
                  {
                    key: "product",
                    header: "Producto",
                    render: (row: (typeof itemRows)[number]) => productOptions.find((option) => option.value === row.product_id)?.label ?? "Sin producto",
                  },
                    { key: "quantity", header: "Cantidad", render: (row: (typeof itemRows)[number]) => row.quantity },
                    { key: "unit_cost", header: "Costo unitario", render: (row: (typeof itemRows)[number]) => row.unit_cost },
                    { key: "batch_cost", header: "Costo por lote", render: (row: (typeof itemRows)[number]) => row.batch_cost ?? inferOrderItemBatchCost(row.quantity, row.unit_cost) ?? "-" },
                  {
                    key: "actions",
                    header: "",
                    render: (row: (typeof itemRows)[number]) => (
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => openEditItemDialog(row.index)}>Editar</Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => removeItem(row.index)}>X</Button>
                      </div>
                    ),
                  },
                ]}
                rows={itemRows}
                rowKey={(row) => String(row.index)}
                emptyMessage="Todavía no agregaste productos."
              />
            </div>
            <label className="block space-y-2 text-sm text-foreground"><span>Notas</span><Input value={createForm.notes} onChange={(e) => setCreateForm(p => ({ ...p, notes: e.target.value }))} /></label>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending}>{createMut.isPending ? "Creando..." : "Crear orden"}</Button>
            </div>
          </form>
        </Dialog>

        <Dialog
          open={isItemDialogOpen}
          title={editingItemIndex === null ? "Agregar producto" : "Editar producto"}
            description="Selecciona el producto y completa cantidad, costo unitario y costo por lote antes de volver a la tabla."
            onClose={() => setIsItemDialogOpen(false)}
            maxWidthClassName="max-w-xl"
          >
            <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); saveItemDraft(); }}>
            <label className="block space-y-2 text-sm text-foreground">
              <span>Producto</span>
              <Combobox
                value={itemDraft.product_id}
                onChange={(v) => setItemDraft((p) => ({ ...p, product_id: v }))}
                options={productOptions}
                placeholder="Buscar producto"
                searchPlaceholder="SKU o nombre"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2 text-sm text-foreground">
                <span>Cantidad</span>
                <Input
                  value={itemDraft.quantity}
                  onChange={(e) => setItemDraft((p) => ({ ...p, quantity: e.target.value }))}
                  placeholder="1"
                />
              </label>
              <label className="block space-y-2 text-sm text-foreground">
                <span>Costo unitario</span>
                <Input
                  value={itemDraft.unit_cost}
                  onChange={(e) => setItemDraft((p) => ({ ...p, unit_cost: e.target.value }))}
                  placeholder="0.00"
                />
              </label>
              <div className="space-y-2">
                <label className="block space-y-2 text-sm text-foreground">
                  <span>Costo por lote</span>
                  <Input
                    value={itemDraft.batch_cost}
                    onChange={(e) => {
                      setBatchCostTouched(true);
                      setItemDraft((p) => ({ ...p, batch_cost: e.target.value }));
                    }}
                    placeholder="0.00"
                  />
                </label>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (inferredItemBatchCost === null) return;
                      setBatchCostTouched(false);
                      setItemDraft((p) => ({ ...p, batch_cost: String(inferredItemBatchCost) }));
                    }}
                    disabled={inferredItemBatchCost === null}
                  >
                    Inferir
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Se calcula como cantidad por costo unitario si lo dejas vacío.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setIsItemDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!itemDraft.product_id}>Guardar</Button>
            </div>
          </form>
        </Dialog>

      </CommerceSection>

      <SuppliersCatalogModal open={isSuppliersOpen} onClose={() => setIsSuppliersOpen(false)} />
    </>
  );
}
