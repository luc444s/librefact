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
  onScan: () => void;
  scanMessage?: string | null;
  onCreateProduct?: () => void;
};

const METHODS: PaymentMethod[] = ["EFECTIVO", "YAPE_PLIN", "TARJETA"];

function ScanIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path d="M7 8v8M10 8v8M13 8v8M17 8v8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

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
  onScan,
  scanMessage,
  onCreateProduct,
}: CartPanelProps) {
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const isOpen = session?.status === "OPEN";

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="secondary"
          aria-label="Escanear"
          title="Escanear"
          className="flex h-12 items-center justify-center border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onScan}
        >
          <ScanIcon />
        </Button>
        <Button
          type="button"
          variant="secondary"
          aria-label="Agregar"
          title="Agregar"
          className="flex h-12 items-center justify-center"
          onClick={onGoToItems}
        >
          <PlusIcon />
        </Button>
      </div>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-card-foreground">Venta rápida</h2>
            <p className="text-xs text-muted-foreground">Carrito listo para cobrar.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
              {itemCount} items
            </span>
            <button
              type="button"
              aria-label="Cancelar venta"
              disabled={lines.length === 0}
              onClick={() => {
                if (window.confirm("¿Cancelar la venta y vaciar el carrito?")) onClear();
              }}
              className="rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive disabled:opacity-40"
            >
              Cancelar venta
            </button>
          </div>
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

      <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
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
                  ? "rounded-md border border-primary bg-primary px-2 py-2 text-xs font-bold text-primary-foreground"
                  : "rounded-md border border-primary/40 bg-primary/10 px-2 py-2 text-xs font-bold text-primary"
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
            className="border-primary bg-primary text-primary-foreground hover:bg-primary/90"
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
      </section>

      {scanMessage ? (
        <section className="grid gap-2 rounded-3xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
          <p className="font-semibold">{scanMessage}</p>
          {onCreateProduct ? (
            <Button type="button" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={onCreateProduct}>
              Producto rápido
            </Button>
          ) : null}
        </section>
      ) : null}

    </div>
  );
}
