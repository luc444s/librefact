import { useState } from "react";
import { Button } from "@systutor/shell/ui/button";
import { Input } from "@systutor/shell/ui/input";
import { useMutation, useQuery } from "../../../../apps/web/src/lib/react-query";

import { listLines } from "../../../productos/frontend/api";
import { createQuickProduct } from "../api";
import type { CartLine } from "../types";

type QuickProductFormProps = {
  onCreated: (line: Omit<CartLine, "quantity">) => void;
  onCancel: () => void;
};

export function QuickProductForm({ onCreated, onCancel }: QuickProductFormProps) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [lineId, setLineId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const linesQuery = useQuery({
    queryKey: ["pos", "quick-product", "lines"],
    queryFn: () => listLines(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createQuickProduct({
        name: name.trim(),
        sale_price: Number(salePrice),
        barcode: barcode.trim() || null,
        initial_stock: Number(initialStock || "0"),
        weight_kg: weightKg ? Number(weightKg) : null,
        line_id: lineId || null,
      }),
    onSuccess: (product) => {
      setError(null);
      onCreated({ productId: product.id, name: product.name, unitPrice: Number(product.sale_price) });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear el producto"),
  });

  const canSubmit = name.trim().length > 0 && Number(salePrice) >= 0 && salePrice !== "";

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-card-foreground">Producto rápido</h2>
          <p className="text-xs text-muted-foreground">Crea un producto sin salir del flujo de caja.</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Nuevo</span>
      </div>

      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-muted-foreground">Barcode</span>
          <Input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="7751271013109" />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-muted-foreground">Nombre *</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Leche en polvo Gloria" required />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-muted-foreground">Precio venta *</span>
            <Input
              type="number"
              min="0"
              step="0.10"
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
              placeholder="34.90"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-muted-foreground">Stock inicial</span>
            <Input
              type="number"
              min="0"
              step="1"
              value={initialStock}
              onChange={(event) => setInitialStock(event.target.value)}
              placeholder="0"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-muted-foreground">Peso kg</span>
            <Input type="number" min="0" step="0.001" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="0.800" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-muted-foreground">Categoría</span>
            <select
              value={lineId}
              onChange={(event) => setLineId(event.target.value)}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Sin categoría</option>
              {(linesQuery.data ?? []).map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? "Guardando..." : "Guardar y agregar"}
          </Button>
        </div>
      </form>
    </section>
  );
}
