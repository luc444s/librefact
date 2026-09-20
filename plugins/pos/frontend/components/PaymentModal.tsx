import { Button } from "@systutor/shell/ui/button";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Input } from "@systutor/shell/ui/input";

import { formatSoles, PAYMENT_METHOD_LABELS } from "../types";
import type { PaymentMethod } from "../types";

type PaymentModalProps = {
  open: boolean;
  method: PaymentMethod;
  total: number;
  receivedAmount: string;
  onReceivedChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
  error: string | null;
  qrImage?: string;
};

export function PaymentModal({
  open,
  method,
  total,
  receivedAmount,
  onReceivedChange,
  onConfirm,
  onClose,
  isPending,
  error,
  qrImage,
}: PaymentModalProps) {
  const isQrPayment = method === "YAPE_PLIN";
  const isCash = method === "EFECTIVO";
  const received = Number(receivedAmount || "0");
  const change = isCash && receivedAmount !== "" ? received - total : null;

  return (
    <Dialog
      open={open}
      title={isQrPayment ? "Cobro con Yape/Plin" : `Confirmar ${PAYMENT_METHOD_LABELS[method]}`}
      description={
        isQrPayment
          ? "Muestra el QR y confirma solo cuando el pago figure como recibido."
          : "Confirma que el cliente pagó antes de registrar la venta."
      }
      onClose={onClose}
      maxWidthClassName={isQrPayment ? "max-w-xl" : "max-w-md"}
      maxHeightClassName={isQrPayment ? "max-h-[95vh]" : undefined}
      zIndexClassName="z-[1000]"
    >
      <div className="grid gap-4">
        {isQrPayment ? (
          <div className="grid justify-items-center gap-2">
            {qrImage ? (
              <img
                src={qrImage}
                alt="QR Yape/Plin"
                className="h-[min(78vw,52vh,28rem)] w-[min(78vw,52vh,28rem)] rounded-lg border-4 border-background object-contain shadow-inner"
              />
            ) : (
              <div
                aria-label="QR mock Yape/Plin"
                className="h-[min(78vw,52vh,28rem)] w-[min(78vw,52vh,28rem)] rounded-lg border-4 border-background shadow-inner"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, hsl(var(--foreground)) 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, hsl(var(--foreground)) 0 6px, transparent 6px 12px)",
                  backgroundColor: "hsl(var(--background))",
                  boxShadow: "inset 0 0 0 1px hsl(var(--foreground))",
                }}
              />
            )}
            <p className="text-center text-xs text-muted-foreground">
              {qrImage ? "Confirma cuando el pago aparezca recibido." : "QR de demostración. Configura tu QR real en ajustes."}
            </p>
          </div>
        ) : null}

        {isCash ? (
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-muted-foreground">Monto recibido</span>
            <Input
              type="number"
              min="0"
              step="0.10"
              value={receivedAmount}
              onChange={(event) => onReceivedChange(event.target.value)}
              placeholder={total.toFixed(2)}
            />
            {change !== null ? (
              <span className={change < 0 ? "text-xs font-semibold text-destructive" : "text-xs font-semibold text-muted-foreground"}>
                Vuelto: {formatSoles(Math.max(change, 0))}
              </span>
            ) : null}
          </label>
        ) : null}

        <div className="flex items-end justify-between rounded-2xl border border-border bg-surface p-4">
          <div>
            <span className="text-xs text-muted-foreground">Método</span>
            <strong className="block text-base text-foreground">{PAYMENT_METHOD_LABELS[method]}</strong>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground">Total</span>
            <strong className="block text-2xl leading-none text-foreground">{formatSoles(total)}</strong>
          </div>
        </div>

        {error ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            No
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onConfirm}
            disabled={isPending || (isCash && change !== null && change < 0)}
          >
            {isPending ? "Registrando..." : isQrPayment ? "Pago recibido" : "Sí, cobrar"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
