import { useMutation, useQuery, useQueryClient } from "../../../../../../apps/web/src/lib/react-query";
import { FormEvent, forwardRef, useImperativeHandle, useState } from "react";
import {
  cancelInvoice,
  createInvoice,
  getOrder,
  getReconciliation,
  listInvoices,
} from "../../api";
import type {
  CreateInvoicePayload,
  PurchaseOrderDetail,
  Reconciliation,
} from "../../types";
import type { ProductListItem } from "../../../../../productos/frontend/types";
import { ClaimDerivationDialog } from "./ClaimDerivationDialog";
import { InvoicesHistoryDialog } from "./InvoicesHistoryDialog";
import { buildInvoiceDraftLines } from "./invoice-defaults";
import { Button } from "@systutor/shell/ui/button";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Input } from "@systutor/shell/ui/input";
import { Badge } from "@systutor/shell/ui/badge";

export type InvoicePanelHandle = {
  openInvoicesDialog: (orderId: string) => void;
};

type InvoicePanelProps = {
  setError: (value: string | null) => void;
  products: ProductListItem[];
};

export const InvoicePanel = forwardRef<InvoicePanelHandle, InvoicePanelProps>(function InvoicePanel({ setError, products }, ref) {
  const queryClient = useQueryClient();
  const [isInvoicesOpen, setIsInvoicesOpen] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<PurchaseOrderDetail | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<CreateInvoicePayload>({ invoice_number: "", invoice_date: "", tax: 0, lines: [] });
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [showInvoicesHistory, setShowInvoicesHistory] = useState(false);
  const [showClaimDerivation, setShowClaimDerivation] = useState(false);
  const [showLinkedOrder, setShowLinkedOrder] = useState(false);

  const invoiceCreateMut = useMutation({
    mutationFn: () => invoiceOrder ? createInvoice(invoiceOrder.id, invoiceForm) : Promise.reject("No order"),
    onSuccess: () => {
      setInvoiceForm({ invoice_number: "", invoice_date: "", tax: 0, lines: [] });
      setReconciliation(null);
      queryClient.invalidateQueries({ queryKey: ["compras", "orders"] });
      if (invoiceOrder) {
        queryClient.invalidateQueries({ queryKey: ["compras", "invoices", invoiceOrder.id] });
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al registrar factura"),
  });
  const invoiceCancelMut = useMutation({
    mutationFn: (id: string) => cancelInvoice(id),
    onSuccess: () => {
      setReconciliation(null);
      queryClient.invalidateQueries({ queryKey: ["compras", "orders"] });
      if (invoiceOrder) {
        queryClient.invalidateQueries({ queryKey: ["compras", "invoices", invoiceOrder.id] });
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al anular factura"),
  });

  const invoicesQuery = useQuery({
    queryKey: ["compras", "invoices", invoiceOrder?.id],
    queryFn: () => listInvoices(invoiceOrder!.id),
    enabled: isInvoicesOpen && Boolean(invoiceOrder),
  });

  function openInvoicesDialog(orderId: string) {
    getOrder(orderId).then((detail) => {
      setInvoiceOrder(detail);
      setInvoiceForm({
        invoice_number: "",
        invoice_date: new Date().toISOString().slice(0, 10),
        tax: 0,
        lines: buildInvoiceDraftLines(detail.items),
      });
      setReconciliation(null);
      setShowInvoicesHistory(false);
      setShowClaimDerivation(false);
      setShowLinkedOrder(false);
      setIsInvoicesOpen(true);
    });
  }

  function runReconcile() {
    if (!invoiceOrder) return;
    getReconciliation(invoiceOrder.id)
      .then(setReconciliation)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al conciliar"));
  }

  function updateInvoiceLine(i: number, f: string, v: string) {
    setInvoiceForm((p) => {
      const lines = [...p.lines];
      lines[i] = { ...lines[i], [f]: f === "order_item_id" ? v : Number(v) || 0 };
      return { ...p, lines };
    });
  }

  useImperativeHandle(ref, () => ({ openInvoicesDialog }));

  const invoiceTotals = {
    subtotal: invoiceForm.lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unit_price) || 0), 0),
    tax: Number(invoiceForm.tax) || 0,
    total: 0,
  };
  invoiceTotals.total = invoiceTotals.subtotal + invoiceTotals.tax;

  return (
    <Dialog open={isInvoicesOpen} title="Facturas de proveedor y conciliación" description="Registra la factura del proveedor y concilia orden, recibido y facturado." onClose={() => { setIsInvoicesOpen(false); setInvoiceOrder(null); setReconciliation(null); }} maxWidthClassName="max-w-6xl">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowInvoicesHistory((value) => !value)}>
            Facturas registradas
          </Button>
          <Button type="button" variant="secondary" onClick={() => setShowClaimDerivation((value) => !value)}>
            Derivar reclamos
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowLinkedOrder(true)}>
              Orden vinculada
            </Button>
            <Button type="button" variant="secondary" onClick={runReconcile}>
              Conciliar
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
          <div className="space-y-6">
            <section className="rounded-md border border-border p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div />
                </div>

              <form className="space-y-6" onSubmit={(e: FormEvent) => { e.preventDefault(); invoiceCreateMut.mutate(); }}>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block space-y-2 text-sm text-foreground">
                    <span>Nro. de factura</span>
                    <Input value={invoiceForm.invoice_number} onChange={(e) => setInvoiceForm(p => ({ ...p, invoice_number: e.target.value }))} placeholder="F001-123" />
                  </label>
                  <label className="block space-y-2 text-sm text-foreground">
                    <span>Fecha</span>
                    <Input type="date" value={invoiceForm.invoice_date} onChange={(e) => setInvoiceForm(p => ({ ...p, invoice_date: e.target.value }))} />
                  </label>
                  <label className="block space-y-2 text-sm text-foreground">
                    <span>Impuesto</span>
                    <Input value={invoiceForm.tax || ""} onChange={(e) => setInvoiceForm(p => ({ ...p, tax: Number(e.target.value) || 0 }))} placeholder="0.00" />
                  </label>
                </div>

                <div className="rounded-md border border-border p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">Líneas de factura</p>
                    <p className="text-xs text-muted-foreground">{invoiceForm.lines.length} líneas</p>
                  </div>
                  <div className="space-y-3">
                    {invoiceForm.lines.map((ln, i) => {
                      const orderItem = invoiceOrder?.items.find((oi) => oi.id === ln.order_item_id);
                      const product = products.find((p) => p.id === orderItem?.product_id);
                      const lineTotal = (Number(ln.qty) || 0) * (Number(ln.unit_price) || 0);

                      return (
                        <div key={i} className="rounded-md border border-border p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">Línea {i + 1}</p>
                              <p className="text-xs text-muted-foreground">{product ? `${product.sku} · ${product.name}` : "Item de orden"}</p>
                            </div>
                            <Badge className="border-border bg-secondary text-secondary-foreground">S/ {lineTotal.toFixed(2)}</Badge>
                          </div>
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_120px_140px]">
                            <label className="block space-y-2 text-sm text-foreground">
                              <span>Producto</span>
                              <Input value={product ? `${product.sku} · ${product.name}` : "Item"} readOnly />
                            </label>
                            <label className="block space-y-2 text-sm text-foreground">
                              <span>Cantidad</span>
                              <Input value={ln.qty || ""} onChange={(e) => updateInvoiceLine(i, "qty", e.target.value)} placeholder="0" />
                            </label>
                            <label className="block space-y-2 text-sm text-foreground">
                              <span>P. unitario</span>
                              <Input value={ln.unit_price || ""} onChange={(e) => updateInvoiceLine(i, "unit_price", e.target.value)} placeholder="0.00" />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4">
                  <div className="text-sm text-foreground">
                    <p className="font-medium">Totales estimados</p>
                    <p className="text-xs text-muted-foreground">Subtotal, impuesto y total se recalculan al editar líneas.</p>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span className="rounded-md border border-border px-3 py-2">Subtotal: S/ {invoiceTotals.subtotal.toFixed(2)}</span>
                    <span className="rounded-md border border-border px-3 py-2">IGV: S/ {invoiceTotals.tax.toFixed(2)}</span>
                    <span className="rounded-md border border-border px-3 py-2 font-medium">Total: S/ {invoiceTotals.total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button type="submit" disabled={invoiceCreateMut.isPending || !invoiceForm.invoice_number}>{invoiceCreateMut.isPending ? "Guardando..." : "Guardar"}</Button>
                </div>
              </form>
            </section>

          </div>

          <div className="space-y-6">
            {reconciliation ? (
              <section className="rounded-md border border-border p-4">
                <div className="mb-3 flex items-center justify-end gap-3">
                  <Badge className={reconciliation.totals.status === "MATCH" ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}>{reconciliation.totals.status}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Ordenado</p><p className="text-lg font-medium">{reconciliation.totals.ordered.toFixed(2)}</p></div>
                  <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Real</p><p className="text-lg font-medium">{reconciliation.totals.real.toFixed(2)}</p></div>
                  <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Facturado</p><p className="text-lg font-medium">{reconciliation.totals.invoiced.toFixed(2)}</p></div>
                </div>
                {reconciliation.invoice_status ? <p className="mt-3 text-sm text-success">Factura {reconciliation.invoice_status}</p> : null}
                <div className="mt-4 space-y-2">
                  {reconciliation.by_item.map((it, idx) => (
                    <div key={idx} className="rounded-md border border-border p-3 text-sm">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">Item {idx + 1}</p>
                        <Badge className={it.status === "MATCH" ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}>{it.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ped {it.ordered_qty} · Acep {it.accepted_qty} · Fact {it.invoiced_qty}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Real {it.real_cost.toFixed(2)} · Fact {it.invoiced_cost.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-md border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge className="border-border bg-secondary text-secondary-foreground">Pendiente</Badge>
                  <span className="text-xs text-muted-foreground">Sin conciliación cargada</span>
                </div>
              </section>
            )}

          </div>
        </div>

        <InvoicesHistoryDialog
          open={showInvoicesHistory}
          invoices={invoicesQuery.data ?? []}
          onClose={() => setShowInvoicesHistory(false)}
          onCancelInvoice={(invoiceId) => invoiceCancelMut.mutate(invoiceId)}
        />

        <ClaimDerivationDialog
          open={showClaimDerivation}
          orderId={invoiceOrder?.id ?? null}
          setError={setError}
          onClose={() => setShowClaimDerivation(false)}
        />

        <Dialog open={showLinkedOrder} title="Orden vinculada" description="Resumen rápido de la orden asociada a esta factura." onClose={() => setShowLinkedOrder(false)} maxWidthClassName="max-w-3xl">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{invoiceOrder?.supplier?.name ?? "Sin proveedor"}</p>
                <p className="text-xs text-muted-foreground">{invoiceOrder?.order_date ?? "-"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={invoiceOrder?.status === "RECEIVED" || invoiceOrder?.status === "PARTIAL" ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"}>
                  {invoiceOrder?.status ?? "-"}
                </Badge>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="text-lg font-medium text-foreground">{invoiceOrder?.items.length ?? 0}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Recibido</p>
                <p className="text-lg font-medium text-foreground">{invoiceOrder?.items.reduce((sum, item) => sum + Number(item.received_qty), 0).toFixed(2) ?? "0.00"}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Ordenado</p>
                <p className="text-lg font-medium text-foreground">{invoiceOrder?.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_cost), 0).toFixed(2) ?? "0.00"}</p>
              </div>
            </div>
          </div>
        </Dialog>
      </div>
    </Dialog>
  );
});
