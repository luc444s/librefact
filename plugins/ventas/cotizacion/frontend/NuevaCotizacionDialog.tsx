import { useState } from "react";
import { Button } from "@systutor/shell/ui/button";
import { Combobox } from "@systutor/shell/ui/combobox";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Input } from "@systutor/shell/ui/input";
import { DataTable } from "@systutor/shell/ui/data-table";

export type NuevaCotizacionDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { customer_id: string; valid_until: string | null; items: any[]; notes: string | null }) => void;
  isPending: boolean;
  customers: Array<{ id: string; display_name: string | null; legal_name: string | null; name: string | null; address: string | null; contact: string | null }>;
  products: Array<{ id: string; sku: string | null; name: string | null }>;
};

export function NuevaCotizacionDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  customers,
  products,
}: NuevaCotizacionDialogProps) {
  const [customerSelected, setCustomerSelected] = useState<string>("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [itemDraft, setItemDraft] = useState<{ product_id: string; quantity: string; unit_price: string; line_total: string }>({
    product_id: "",
    quantity: "1",
    unit_price: "",
    line_total: "",
  });

  const customer = customers.find((c) => c.id === customerSelected);

  const customerOptions = customers.map((customer) => ({
    value: customer.id,
    label: customer.display_name ?? customer.legal_name ?? customer.name ?? "Sin nombre",
  }));

  const productOptions = products.map((product) => ({ value: product.id, label: `${product.sku ?? ""} · ${product.name ?? "Sin nombre"}` }));

  const [createForm, setCreateForm] = useState<{
    customer_id: string;
    customer_name: string;
    items: any[];
    notes: string;
  }>({ customer_id: "", customer_name: "", items: [], notes: "" });

  const itemRows = createForm.items.map((item, index) => ({ ...item, index }));

  const inferredLineTotal = (() => {
    const quantity = Number(itemDraft.quantity.trim().replace(",", "."));
    const unitPrice = Number(itemDraft.unit_price.trim().replace(",", "."));
    if (!quantity || !unitPrice) return null;
    return Number((quantity * unitPrice).toFixed(2));
  })();

  const handleCustomerChange = (value: string) => {
    setCustomerSelected(value);
  };

  const openNewItemDialog = () => {
    setEditingItemIndex(null);
    setItemDraft({ product_id: "", quantity: "1", unit_price: "", line_total: "" });
    setItemDialogOpen(true);
  };

  const openEditItemDialog = (index: number) => {
    const item = createForm.items[index];
    if (!item) return;
    setEditingItemIndex(index);
    setItemDraft({
      product_id: item.product_id,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      line_total: String(item.line_total ?? Number((item.quantity * item.unit_price).toFixed(2))),
    });
    setItemDialogOpen(true);
  };

  const saveItemDraft = () => {
    const normalizedUnitPrice = itemDraft.unit_price.trim().replace(",", ".");
    const normalizedQuantity = itemDraft.quantity.trim().replace(",", ".");
    const normalizedLineTotal = itemDraft.line_total.trim().replace(",", ".");
    const parsedLineTotal = normalizedLineTotal ? Number(normalizedLineTotal) : inferredLineTotal;
    const nextItem: { product_id: string; quantity: number; unit_price: number; line_total: number | null } = {
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
    setItemDialogOpen(false);
  };

  const removeItem = (index: number) => {
    setCreateForm((current) => ({ ...current, items: current.items.filter((_, currentIndex) => currentIndex !== index) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerSelected || createForm.items.length === 0) return;
    onSubmit({
      customer_id: customerSelected,
      valid_until: validUntil || null,
      items: createForm.items,
      notes: notes || null,
    });
  };

  return (
    <>
      <Dialog
        open={open}
        title="Nueva cotización"
        description="Selecciona cliente y agrega productos."
        onClose={onClose}
      >
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm text-foreground">
            <span>Cliente</span>
            <Combobox
              value={customerSelected}
              onChange={handleCustomerChange}
              options={customerOptions}
              placeholder="Buscar cliente"
              searchPlaceholder="Buscar cliente"
            />
          </label>

          {customer ? (
            <div className="rounded-md border border-border p-3 space-y-2 text-sm">
              <div className="flex gap-2"><span className="text-muted-foreground">Contacto</span><span>{customer.contact ?? "—"}</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground">RUC/Doc</span><span>{customer.document ?? "—"}</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground">Dirección</span><span>{customer.address ?? "—"}</span></div>
            </div>
          ) : null}

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
                  render: (row: any) => productOptions.find((option) => option.value === row.product_id)?.label ?? "Sin producto",
                },
                { key: "quantity", header: "Cantidad", render: (row: any) => row.quantity },
                { key: "unit_price", header: "Precio unitario", render: (row: any) => row.unit_price },
                {
                  key: "line_total",
                  header: "Total",
                  render: (row: any) => row.line_total ?? Number((row.quantity * row.unit_price).toFixed(2)),
                },
                {
                  key: "actions",
                  header: "",
                  render: (row: any) => (
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
            <span>Válida hasta</span>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <label className="block space-y-2 text-sm text-foreground">
            <span>Notas</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !customerSelected || createForm.items.length === 0}>
              {isPending ? "Creando..." : "Crear cotización"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={itemDialogOpen}
        title={editingItemIndex === null ? "Agregar producto" : "Editar producto"}
        description="Selecciona el producto y completa cantidad, precio unitario y total antes de volver a la tabla."
        onClose={() => setItemDialogOpen(false)}
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
            <Button type="button" variant="secondary" onClick={() => setItemDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!itemDraft.product_id}>
              Guardar
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function NuevaCotizacionDialogView({
  customers,
  products,
  validUntil,
  notes,
  items,
  onCustomerChange,
  onValidUntilChange,
  onNotesChange,
  onAddItem,
  onEditItem,
  onRemoveItem,
  onSubmit,
  isPending,
}: {
  customers: Array<{ id: string; display_name: string | null; legal_name: string | null; name: string | null; address: string | null; contact: string | null }>;
  products: Array<{ id: string; sku: string | null; name: string | null }>;
  validUntil: string;
  notes: string;
  items: any[];
  onCustomerChange: (value: string) => void;
  onValidUntilChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onAddItem: () => void;
  onEditItem: (index: number) => void;
  onRemoveItem: (index: number) => void;
  onSubmit: (payload: { customer_id: string; valid_until: string | null; items: any[]; notes: string | null }) => void;
  isPending: boolean;
}) {
  const [customerSelected, setCustomerSelected] = useState<string>("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [itemDraft, setItemDraft] = useState<{ product_id: string; quantity: string; unit_price: string; line_total: string }>({
    product_id: "",
    quantity: "1",
    unit_price: "",
    line_total: "",
  });

  const customer = customers.find((c) => c.id === customerSelected);

  const customerOptions = customers.map((customer) => ({
    value: customer.id,
    label: customer.display_name ?? customer.legal_name ?? customer.name ?? "Sin nombre",
  }));

  const productOptions = products.map((product) => ({ value: product.id, label: `${product.sku ?? ""} · ${product.name ?? "Sin nombre"}` }));

  const [createForm, setCreateForm] = useState<{
    customer_id: string;
    customer_name: string;
    items: any[];
    notes: string;
  }>({ customer_id: "", customer_name: "", items: [], notes: "" });

  const itemRows = createForm.items.map((item, index) => ({ ...item, index }));

  const inferredLineTotal = (() => {
    const quantity = Number(itemDraft.quantity.trim().replace(",", "."));
    const unitPrice = Number(itemDraft.unit_price.trim().replace(",", "."));
    if (!quantity || !unitPrice) return null;
    return Number((quantity * unitPrice).toFixed(2));
  })();

  const handleCustomerChange = (value: string) => {
    setCustomerSelected(value);
    onCustomerChange(value);
  };

  const openNewItemDialog = () => {
    setEditingItemIndex(null);
    setItemDraft({ product_id: "", quantity: "1", unit_price: "", line_total: "" });
    setItemDialogOpen(true);
  };

  const openEditItemDialog = (index: number) => {
    const item = createForm.items[index];
    if (!item) return;
    setEditingItemIndex(index);
    setItemDraft({
      product_id: item.product_id,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      line_total: String(item.line_total ?? Number((item.quantity * item.unit_price).toFixed(2))),
    });
    setItemDialogOpen(true);
  };

  const saveItemDraft = () => {
    const normalizedUnitPrice = itemDraft.unit_price.trim().replace(",", ".");
    const normalizedQuantity = itemDraft.quantity.trim().replace(",", ".");
    const normalizedLineTotal = itemDraft.line_total.trim().replace(",", ".");
    const parsedLineTotal = normalizedLineTotal ? Number(normalizedLineTotal) : inferredLineTotal;
    const nextItem: { product_id: string; quantity: number; unit_price: number; line_total: number | null } = {
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
    setItemDialogOpen(false);
  };

  const removeItem = (index: number) => {
    setCreateForm((current) => ({ ...current, items: current.items.filter((_, currentIndex) => currentIndex !== index) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerSelected || createForm.items.length === 0) return;
    onSubmit({
      customer_id: customerSelected,
      valid_until: validUntil || null,
      items: createForm.items,
      notes: notes || null,
    });
  };

  return (
    <>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2 text-sm text-foreground">
          <span>Cliente</span>
          <Combobox
            value={customerSelected}
            onChange={handleCustomerChange}
            options={customerOptions}
            placeholder="Buscar cliente"
            searchPlaceholder="Buscar cliente"
          />
        </label>

        {customer ? (
          <div className="rounded-md border border-border p-3 space-y-2 text-sm">
            <div className="flex gap-2"><span className="text-muted-foreground">Contacto</span><span>{customer.contact ?? "—"}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground">RUC/Doc</span><span>{customer.document ?? "—"}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground">Dirección</span><span>{customer.address ?? "—"}</span></div>
          </div>
        ) : null}

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
                render: (row: any) => productOptions.find((option) => option.value === row.product_id)?.label ?? "Sin producto",
              },
              { key: "quantity", header: "Cantidad", render: (row: any) => row.quantity },
              { key: "unit_price", header: "Precio unitario", render: (row: any) => row.unit_price },
              {
                key: "line_total",
                header: "Total",
                render: (row: any) => row.line_total ?? Number((row.quantity * row.unit_price).toFixed(2)),
              },
              {
                key: "actions",
                header: "",
                render: (row: any) => (
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
          <span>Válida hasta</span>
          <Input
            type="date"
            value={validUntil}
            onChange={(e) => {
              onValidUntilChange(e.target.value);
            }}
            placeholder="YYYY-MM-DD"
          />
        </label>

        <label className="block space-y-2 text-sm text-foreground">
          <span>Notas</span>
          <Input value={notes} onChange={(e) => onNotesChange(e.target.value)} />
        </label>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => {}}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending || !customerSelected || createForm.items.length === 0}>
            {isPending ? "Creando..." : "Crear cotización"}
          </Button>
        </div>
      </form>

      <Dialog
        open={itemDialogOpen}
        title={editingItemIndex === null ? "Agregar producto" : "Editar producto"}
        description="Selecciona el producto y completa cantidad, precio unitario y total antes de volver a la tabla."
        onClose={() => setItemDialogOpen(false)}
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
            <Button type="button" variant="secondary" onClick={() => setItemDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!itemDraft.product_id}>
              Guardar
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
