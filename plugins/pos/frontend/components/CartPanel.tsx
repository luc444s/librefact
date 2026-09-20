import { Button } from "@systutor/shell/ui/button";

import { formatSoles, PAYMENT_METHOD_LABELS } from "../types";
import type { CartLine, PaymentMethod, PosCashSession } from "../types";

type CartPanelProps = {
  lines: CartLine[];
  session: PosCashSession | null;
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onClear: () => void;
  onCharge: () => void;
  onGoToItems: () => void;
};

const METHODS: PaymentMethod[] = ["EFECTIVO", "YAPE_PLIN", "TARJETA"];

export function CartPanel({
  lines,
  session,
  method,
  onMethodChange,
  onIncrease,
  onDecrease,
  onClear,
  onCharge,
  onGoToItems,
}: CartPanelProps) {
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const isOpen = session?.status === "OPEN";

  return (
    <div className="grid gap-3">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-card-foreground">Venta rápida</h2>
            <p className="text-xs text-muted-foreground">Carrito listo para cobrar.</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
            {itemCount} items
          </span>
        </div>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            El carrito está vacío. Agrega productos para cobrar.
          </p>
        ) : (
          <div className="grid gap-2">
            {lines.map((line) => (
              <div
                key={line.productId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-card-foreground">{line.name}</strong>
                  <small className="text-muted-foreground">{formatSoles(line.unitPrice)} c/u</small>
                  <div className="mt-1 flex w-max items-center gap-2 rounded-full bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => onDecrease(line.productId)}
                      className="h-7 w-7 rounded-full bg-background font-black text-foreground"
                      aria-label="Quitar uno"
                    >
                      -
                    </button>
                    <span className="min-w-5 text-center text-sm font-semibold">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onIncrease(line.productId)}
                      className="h-7 w-7 rounded-full bg-background font-black text-foreground"
                      aria-label="Agregar uno"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="whitespace-nowrap text-base font-black text-card-foreground">
                  {formatSoles(line.unitPrice * line.quantity)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

        <aside className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <strong className="text-card-foreground">{formatSoles(total)}</strong>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
          <span>IGV</span>
          <strong className="text-card-foreground">Sin IGV</strong>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {METHODS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onMethodChange(option)}
              className={
                option === method
                  ? "rounded-md border border-border bg-card px-2 py-2 text-xs font-bold text-foreground ring-1 ring-ring"
                  : "rounded-md border border-border bg-card px-2 py-2 text-xs font-bold text-foreground"
              }
            >
              {PAYMENT_METHOD_LABELS[option]}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
          <div>
            <span className="text-xs text-muted-foreground">Total</span>
            <strong className="block text-2xl leading-none text-card-foreground">{formatSoles(total)}</strong>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="border-border bg-card text-foreground hover:bg-muted"
            disabled={lines.length === 0 || !isOpen}
            onClick={onCharge}
          >
            Cobrar
          </Button>
        </div>
        {!isOpen ? (
          <p className="mt-2 text-xs font-medium text-destructive">
            Abre la caja en la pestaña Cierre antes de cobrar.
          </p>
        ) : null}
      </aside>

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" onClick={onGoToItems}>
          + Agregar productos
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="border-destructive/40 bg-destructive/10 text-destructive"
          onClick={onClear}
          disabled={lines.length === 0}
        >
          Cancelar venta
        </Button>
      </div>
    </div>
  );
}
