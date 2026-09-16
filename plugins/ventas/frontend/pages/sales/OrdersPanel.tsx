import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "../../../../../apps/web/src/lib/react-query";
import { Link } from "../../../../../apps/web/src/lib/router";
import { Alert } from "@systutor/shell/ui/alert";
import { Badge } from "@systutor/shell/ui/badge";
import { Button } from "@systutor/shell/ui/button";
import { Combobox } from "@systutor/shell/ui/combobox";
import { DataTable } from "@systutor/shell/ui/data-table";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Input } from "@systutor/shell/ui/input";
import { CommerceSection } from "../../../../commerce/frontend/components";
import { listCustomers } from "../../../../crm/frontend/api";
import { listAllProducts } from "../../../../productos/frontend/api";
import { createOrder, listOrders } from "../../api";
import type { SalesOrder, SalesOrderItemPayload } from "../../types";
import type { ProductListItem } from "../../../../productos/frontend/types";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  CONFIRMED: "border-primary/30 bg-primary/10 text-primary",
  PARTIAL: "border-warning/30 bg-warning/10 text-warning",
  DISPATCHED: "border-success/30 bg-success/10 text-success",
  CLOSED: "border-border bg-secondary text-secondary-foreground",
  CANCELLED: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmado",
  PARTIAL: "Parcial",
  DISPATCHED: "Despachado",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

type OrdersPanelProps = {
  error: string | null;
  setError: (value: string | null) => void;
  products: ProductListItem[];
  onOrderClick: (order: SalesOrder) => void;
};

export function OrdersPanel({ error, setError, products, onOrderClick }: OrdersPanelProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [batchTotalTouched, setBatchTotalTouched] = useState(false);
  const [itemDraft, setItemDraft] = useState<{ product_id: string; quantity: string; unit_price: string; line_total: string }>({
    product_id: "",
    quantity: "1",
    unit_price: "",
    line_total: "",
  });
  const [createForm, setCreateForm] = useState<{
    customer_id: string;
    customer_name: string;
    items: OrderItemPayload[];
    notes: string;
  }>({ customer_id: "", customer_name: "", items: [], notes: "" });

  const ordersQuery = useQuery({
    queryKey: ["ventas", "orders", { status: statusFilter, page }],
    queryFn: () => listOrders({ status: statusFilter || undefined, limit: 20, offset: (page - 1) * 20 }),
  });
  const customersQuery = useQuery({
    queryKey: ["crm", "customers", "ventas-orders-picker"],
    queryFn: () => listCustomers({ limit: 100, offset: 0 }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createOrder({
        customer_id: createForm.customer_id,
        customer_name: createForm.customer_name || null,
        items: createForm.items,
        notes: createForm.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventas", "orders"] });
      setIsCreateOpen(false);
      setCreateForm({ customer_id: "", customer_name: "", items: [], notes: "" });
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al crear pedido"),
  });

  const customerOptions = (customersQuery.data?.items ?? []).map((customer) => ({
    value: customer.id,
    label: customer.display_name,
  }));
  const productOptions = products.map((product) => ({ value: product.id, label: `${product.sku} · ${product.name}` }));
  const itemRows = createForm.items.map((item, index) => ({ ...item, index }));
  const inferredLineTotal = (() => {
    const quantity = Number(itemDraft.quantity.trim().replace(",", "."));
    const unitPrice = Number(itemDraft.unit_price.trim().replace(",", "."));
    if (!quantity || !unitPrice) return null;
    return Number((quantity * unitPrice).toFixed(2));
  })();
  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  useEffect(() => {
    if (!isItemDialogOpen || batchTotalTouched) return;
    setItemDraft((current) => {
      const nextLineTotal = inferredLineTotal === null ? "" : String(inferredLineTotal);
      return current.line_total === nextLineTotal ? current : { ...current, line_total: nextLineTotal };
    });
  }, [batchTotalTouched, inferredLineTotal, isItemDialogOpen]);

  function openNewItemDialog() {
    setEditingItemIndex(null);
    setItemDraft({ product_id: "", quantity: "1", unit_price: "", line_total: "" });
    setBatchTotalTouched(false);
    setIsItemDialogOpen(true);
  }

  function openEditItemDialog(index: number) {
    const item = createForm.items[index];
    if (!item) return;
    setEditingItemIndex(index);
    setItemDraft({
      product_id: item.product_id,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      line_total: String(item.line_total ?? Number((item.quantity * item.unit_price).toFixed(2))),
    });
    setBatchTotalTouched(false);
    setIsItemDialogOpen(true);
  }

  function saveItemDraft() {
    const normalizedUnitPrice = itemDraft.unit_price.trim().replace(",", ".");
    const normalizedQuantity = itemDraft.quantity.trim().replace(",", ".");
    const normalizedLineTotal = itemDraft.line_total.trim().replace(",", ".");
    const parsedLineTotal = normalizedLineTotal ? Number(normalizedLineTotal) : inferredLineTotal;
    const nextItem: SalesOrderItemPayload = {
      product_id: itemDraft.product_id,
      quantity: Number(normalizedQuantity) || 0,
      unit_price: Number(normalizedUnitPrice) || 0,
      line_total: parsedLineTotal ?? undefined,
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
    setBatchTotalTouched(false);
  }

  function removeItem(index: number) {
    setCreateForm((current) => ({ ...current, items: current.items.filter((_, currentIndex) => currentIndex !== index) }));
  }

  return (
    <>
      <CommerceSection
        title="Pedidos de venta"
        description="Gestiona pedidos de clientes y cruza el flujo con CRM y stock-out de logística."
        actions={
          <div className="flex gap-2">
            <Link to="/app/crm/customers">
              <Button variant="secondary">Clientes</Button>
            </Link>
            <Button
              onClick={() => {
                setCreateForm({ customer_id: "", customer_name: "", items: [], notes: "" });
                setError(null);
                setIsCreateOpen(true);
              }}
            >
              Nuevo pedido
            </Button>
          </div>
        }
      >
        {error ? <Alert title="Error">{error}</Alert> : null}

        <div className="flex gap-2">
          <div className="max-w-xs">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="DRAFT">Borrador</option>
              <option value="CONFIRMED">Confirmado</option>
              <option value="PARTIAL">Parcial</option>
              <option value="DISPATCHED">Despachado</option>
              <option value="CANCELLED">Cancelado</option>
              <option value="CLOSED">Cerrado</option>
            </select>
          </div>
        </div>

        <DataTable
          onRowClick={onOrderClick}
          columns={[
            { key: "customer", header: "Cliente", render: (row) => row.customer?.name ?? row.customer_name ?? "-" },
            {
              key: "status",
              header: "Estado",
              render: (row) => <Badge className={STATUS_BADGE[row.status] ?? ""}>{STATUS_LABEL[row.status] ?? row.status}</Badge>,
            },
            { key: "date", header: "Fecha", render: (row) => row.order_date },
          ]}
          rows={orders}
          rowKey={(row) => row.id}
          emptyMessage="No hay pedidos de venta."
        />

        {totalPages > 1 ? (
          <div className="flex justify-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span className="px-3 py-2 text-sm">
              {page} / {totalPages}
            </span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </div>
        ) : null}

        <Dialog
          open={isCreateOpen}
          title="Nuevo pedido de venta"
          description="Selecciona cliente y agrega productos."
          onClose={() => setIsCreateOpen(false)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
          >
            <label className="block space-y-2 text-sm text-foreground">
              <span>Cliente</span>
              <Combobox
                value={createForm.customer_id}
                onChange={(value) => {
                  const selected = (customersQuery.data?.items ?? []).find((customer) => customer.id === value);
                  setCreateForm((current) => ({
                    ...current,
                    customer_id: value,
                    customer_name: selected?.display_name ?? selected?.legal_name ?? "",
                  }));
                }}
                options={customerOptions}
                placeholder="Seleccionar cliente"
                searchPlaceholder="Buscar cliente"
              />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Productos</span>
                <Button type="button" variant="secondary" onClick={openNewItemDialog}>
                  + Agregar
                </Button>
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
                  { key: "unit_price", header: "Precio unitario", render: (row: (typeof itemRows)[number]) => row.unit_price },
                  {
                    key: "line_total",
                    header: "Total",
                    render: (row: (typeof itemRows)[number]) => row.line_total ?? Number((row.quantity * row.unit_price).toFixed(2)),
                  },
                  {
                    key: "actions",
                    header: "",
                    render: (row: (typeof itemRows)[number]) => (
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => openEditItemDialog(row.index)}>
                          Editar
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => removeItem(row.index)}>
                          X
                        </Button>
                      </div>
                    ),
                  },
                ]}
                rows={itemRows}
                rowKey={(row) => String(row.index)}
                emptyMessage="Todavía no agregaste productos."
              />
            </div>
            <label className="block space-y-2 text-sm text-foreground">
              <span>Notas</span>
              <Input value={createForm.notes} onChange={(e) => setCreateForm((current) => ({ ...current, notes: e.target.value }))} />
            </label>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "Creando..." : "Crear pedido"}
              </Button>
            </div>
          </form>
        </Dialog>

        <Dialog
          open={isItemDialogOpen}
          title={editingItemIndex === null ? "Agregar producto" : "Editar producto"}
          description="Selecciona el producto y completa cantidad, precio unitario y total antes de volver a la tabla."
          onClose={() => setIsItemDialogOpen(false)}
          maxWidthClassName="max-w-xl"
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveItemDraft();
            }}
          >
            <label className="block space-y-2 text-sm text-foreground">
              <span>Producto</span>
              <Combobox
                value={itemDraft.product_id}
                onChange={(value) => setItemDraft((current) => ({ ...current, product_id: value }))}
                options={productOptions}
                placeholder="Buscar producto"
                searchPlaceholder="SKU o nombre"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2 text-sm text-foreground">
                <span>Cantidad</span>
                <Input value={itemDraft.quantity} onChange={(e) => setItemDraft((current) => ({ ...current, quantity: e.target.value }))} placeholder="1" />
              </label>
              <label className="block space-y-2 text-sm text-foreground">
                <span>Precio unitario</span>
                <Input value={itemDraft.unit_price} onChange={(e) => setItemDraft((current) => ({ ...current, unit_price: e.target.value }))} placeholder="0.00" />
              </label>
              <div className="space-y-2">
                <label className="block space-y-2 text-sm text-foreground">
                  <span>Total</span>
                  <Input
                    value={itemDraft.line_total}
                    onChange={(e) => {
                      setBatchTotalTouched(true);
                      setItemDraft((current) => ({ ...current, line_total: e.target.value }));
                    }}
                    placeholder="0.00"
                  />
                </label>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (inferredLineTotal === null) return;
                      setBatchTotalTouched(false);
                      setItemDraft((current) => ({ ...current, line_total: String(inferredLineTotal) }));
                    }}
                    disabled={inferredLineTotal === null}
                  >
                    Inferir
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Se calcula como cantidad por precio unitario si lo dejas vacío.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setIsItemDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!itemDraft.product_id}>
                Guardar
              </Button>
            </div>
          </form>
        </Dialog>
      </CommerceSection>
    </>
  );
}
