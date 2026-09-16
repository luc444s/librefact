import { useState } from "react";
import { Button } from "@systutor/shell/ui/button";
import { Combobox } from "@systutor/shell/ui/combobox";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Input } from "@systutor/shell/ui/input";

export type CotizacionItemFormProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (item: { product_id: string; quantity: number; unit_price: number; line_total: number | null }) => void;
  editingItemIndex: number | null;
  items: Array<{ product_id: string; quantity: number; unit_price: number; line_total: number | null }>;
  products: Array<{ id: string; sku: string | null; name: string | null }>;
};

export function CotizacionItemForm({
  open,
  onClose,
  onSubmit,
  editingItemIndex,
  items,
  products,
}: CotizacionItemFormProps) {
  const [productSelected, setProductSelected] = useState<string>("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [lineTotal, setLineTotal] = useState("");

  const product = products.find((p) => p.id === productSelected);

  const productOptions = products.map((product) => ({ value: product.id, label: `${product.sku ?? ""} · ${product.name ?? "Sin nombre"}` }));

  const inferredLineTotal = (() => {
    const quantityNum = Number(quantity.trim().replace(",", "."));
    const unitPriceNum = Number(unitPrice.trim().replace(",", "."));
    if (!quantityNum || !unitPriceNum) return null;
    return Number((quantityNum * unitPriceNum).toFixed(2));
  })();

  const handleProductChange = (value: string) => {
    setProductSelected(value);
  };

  const handleSave = () => {
    const normalizedUnitPrice = unitPrice.trim().replace(",", ".");
    const normalizedQuantity = quantity.trim().replace(",", ".");
    const normalizedLineTotal = lineTotal.trim().replace(",", ".");
    const parsedLineTotal = normalizedLineTotal ? Number(normalizedLineTotal) : inferredLineTotal;
    const nextItem: { product_id: string; quantity: number; unit_price: number; line_total: number | null } = {
      product_id: productSelected,
      quantity: Number(normalizedQuantity) || 0,
      unit_price: Number(normalizedUnitPrice) || 0,
      line_total: parsedLineTotal ?? undefined,
    };
    onSubmit(nextItem);
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={editingItemIndex === null ? "Agregar producto" : "Editar producto"}
      description="Selecciona el producto y completa cantidad, precio unitario y total antes de volver a la tabla."
      onClose={onClose}
      maxWidthClassName="max-w-xl"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <label className="block space-y-2 text-sm text-foreground">
          <span>Producto</span>
          <Combobox
            value={productSelected}
            onChange={handleProductChange}
            options={productOptions}
            placeholder="Buscar producto"
            searchPlaceholder="SKU o nombre"
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm text-foreground">
            <span>Cantidad</span>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" />
          </label>
          <label className="block space-y-2 text-sm text-foreground">
            <span>Precio unitario</span>
            <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
          </label>
          <div className="space-y-2">
            <label className="block space-y-2 text-sm text-foreground">
              <span>Total</span>
              <Input
                value={lineTotal}
                onChange={(e) => setLineTotal(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (inferredLineTotal === null) return;
                  setLineTotal(String(inferredLineTotal));
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
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!productSelected}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}