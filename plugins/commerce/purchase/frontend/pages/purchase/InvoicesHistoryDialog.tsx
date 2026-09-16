import { Button } from "@systutor/shell/ui/button";
import { Badge } from "@systutor/shell/ui/badge";
import { Dialog } from "@systutor/shell/ui/dialog";
import type { SupplierInvoice } from "../../types";

type InvoicesHistoryDialogProps = {
  open: boolean;
  invoices: SupplierInvoice[];
  onClose: () => void;
  onCancelInvoice: (invoiceId: string) => void;
};

export function InvoicesHistoryDialog({ open, invoices, onClose, onCancelInvoice }: InvoicesHistoryDialogProps) {
  return (
    <Dialog open={open} title="Facturas registradas" description="Historial de facturas asociadas a la orden." onClose={onClose} maxWidthClassName="max-w-3xl">
      <div className="space-y-2">
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
            <div>
              <p className="font-medium text-foreground">{inv.invoice_number}</p>
              <p className="text-xs text-muted-foreground">{inv.invoice_date} · {inv.total.toFixed(2)} {inv.currency}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="border-border bg-secondary text-secondary-foreground">{inv.status}</Badge>
              {inv.status !== "ANULADA" ? <Button type="button" variant="secondary" onClick={() => onCancelInvoice(inv.id)}>Anular</Button> : null}
            </div>
          </div>
        ))}
        {!invoices.length ? <p className="text-sm text-muted-foreground">Sin facturas.</p> : null}
      </div>
    </Dialog>
  );
}
