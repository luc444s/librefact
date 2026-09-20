import { useState } from "react";
import { Button } from "@systutor/shell/ui/button";
import { Input } from "@systutor/shell/ui/input";
import { useMutation, useQuery } from "../../../../apps/web/src/lib/react-query";

import { searchPosProducts, setPosProductPrice } from "../api";
import { formatSoles, formatWeight } from "../types";
import type { CartLine, PosProductSearchItem } from "../types";

type ItemSearchPanelProps = {
  onAdd: (line: Omit<CartLine, "quantity">) => void;
  onBack: () => void;
  cartCount: number;
  cartTotal: number;
};

export function ItemSearchPanel({ onAdd, onBack, cartCount, cartTotal }: ItemSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [priceProductId, setPriceProductId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");

  const searchQuery = useQuery({
    queryKey: ["pos", "products", query],
    queryFn: () => searchPosProducts(query, 4),
  });

  const priceMutation = useMutation({
    mutationFn: async ({ product, amount }: { product: PosProductSearchItem; amount: number }) => {
      const result = await setPosProductPrice(product.id, amount);
      return { productId: product.id, name: product.name, unitPrice: result.price };
    },
    onSuccess: (line) => {
      setError(null);
      setPriceProductId(null);
      setPriceDraft("");
      onAdd(line);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo fijar el precio"),
  });

  function handleAdd(product: PosProductSearchItem) {
    setError(null);
    if (product.price === null) {
      setPriceProductId(product.id);
      setPriceDraft("");
      return;
    }
    onAdd({ productId: product.id, name: product.name, unitPrice: product.price });
  }

  function confirmPrice(product: PosProductSearchItem) {
    const amount = Number(priceDraft);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Ingresa un precio válido mayor a 0");
      return;
    }
    priceMutation.mutate({ product, amount });
  }

  const products = searchQuery.data ?? [];

  return (
    <div className="grid gap-3">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-card-foreground">Agregar items</h2>
            <p className="text-xs text-muted-foreground">Escanea o busca por nombre, SKU o código de barras.</p>
          </div>
          <Button type="button" variant="secondary" className="shrink-0" onClick={onBack}>
            Ver venta
          </Button>
        </div>

        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Escanea o busca: leche, arroz, 775..."
        />
      </section>

      {error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      ) : null}

      {priceMutation.isPending ? (
        <p className="text-center text-xs text-muted-foreground">Guardando precio...</p>
      ) : null}

      <section className="grid gap-2">
        {searchQuery.isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Buscando productos...</p>
        ) : products.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Sin resultados.</p>
        ) : (
          products.map((product) => {
            const isSettingPrice = priceProductId === product.id;
            const weightLabel = formatWeight(product.weight_kg);
            return (
              <article
                key={product.id}
                className="grid gap-3 rounded-3xl border border-border bg-surface p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 pr-1">
                    <h3 className="max-w-[11rem] whitespace-normal break-words text-sm font-bold leading-tight text-foreground sm:max-w-none">
                      {product.name}
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {weightLabel ? `${weightLabel} · ` : ""}
                      {product.sku}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {product.price === null ? (
                      <span className="whitespace-nowrap rounded-full bg-destructive/10 px-2 py-1 text-xs font-bold leading-none text-destructive">
                        Sin precio
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-foreground">{formatSoles(product.price)}</span>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={product.price === null ? "Poner precio" : "Agregar"}
                      title={product.price === null ? "Poner precio" : "Agregar"}
                      className="h-8 w-8 shrink-0 rounded-full p-0 text-base font-bold text-muted-foreground hover:text-foreground"
                      disabled={priceMutation.isPending}
                      onClick={() => handleAdd(product)}
                    >
                      {product.price === null ? "$" : "+"}
                    </Button>
                  </div>
                </div>

                {isSettingPrice ? (
                  <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-2">
                    <label className="grid min-w-[7rem] flex-1 gap-1">
                      <span className="text-xs font-bold text-muted-foreground">Precio unitario (S/)</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.10"
                        autoFocus
                        value={priceDraft}
                        onChange={(event) => setPriceDraft(event.target.value)}
                        placeholder="0.00"
                      />
                    </label>
                    <Button
                      type="button"
                      aria-label="Guardar y agregar"
                      title="Guardar y agregar"
                      className="h-8 w-8 shrink-0 rounded-full p-0 text-base font-bold"
                      disabled={priceMutation.isPending}
                      onClick={() => confirmPrice(product)}
                    >
                      +
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label="Cancelar"
                      title="Cancelar"
                      className="h-8 w-8 shrink-0 rounded-full p-0 text-base font-bold text-muted-foreground"
                      disabled={priceMutation.isPending}
                      onClick={() => {
                        setPriceProductId(null);
                        setPriceDraft("");
                      }}
                    >
                      ×
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <div className="sticky bottom-24 z-30 flex items-center justify-between gap-3 rounded-3xl bg-sidebar px-4 py-3 text-sidebar-foreground shadow-lg">
        <div className="text-sm">
          <strong>{cartCount} items</strong>
          <br />
          <span className="text-xs opacity-80">Total {formatSoles(cartTotal)}</span>
        </div>
        <Button type="button" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={onBack}>
          Volver a cobrar
        </Button>
      </div>
    </div>
  );
}
