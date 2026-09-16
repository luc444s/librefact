import { useMutation, useQuery, useQueryClient } from "../../../../../apps/web/src/lib/react-query";
import { useRef, useState } from "react";
import { Button } from "@systutor/shell/ui/button";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Link } from "../../../../../apps/web/src/lib/router";
import { listAllProducts } from "../../../../productos/frontend/api";
import { cancelOrder, closeOrder, confirmOrder } from "../api";
import { OrdersPanel } from "./purchase/OrdersPanel";
import { InvoicePanel, type InvoicePanelHandle } from "./purchase/InvoicePanel";
import { ClaimsPanel, type ClaimsPanelHandle } from "./purchase/ClaimsPanel";
import {
  MerchandiseReturnDialog,
  type MerchandiseReturnDialogHandle,
} from "./purchase/MerchandiseReturnDialog";
import type { PurchaseOrder } from "../types";

export function PurchaseOrdersPage() {
  const [error, setError] = useState<string | null>(null);
  const [launcherOrder, setLauncherOrder] = useState<PurchaseOrder | null>(null);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const queryClient = useQueryClient();
  const invoiceRef = useRef<InvoicePanelHandle>(null);
  const claimsRef = useRef<ClaimsPanelHandle>(null);
  const returnsRef = useRef<MerchandiseReturnDialogHandle>(null);
  const productsQuery = useQuery({
    queryKey: ["productos", "all-active"],
    queryFn: () => listAllProducts({ is_active: true }),
  });
  const products = productsQuery.data ?? [];

  function openLauncher(order: PurchaseOrder) {
    setError(null);
    setIsCloseDialogOpen(false);
    setCloseReason("");
    setLauncherOrder(order);
  }

  function closeLauncher() {
    setLauncherOrder(null);
    setIsCloseDialogOpen(false);
    setCloseReason("");
  }

  const confirmMut = useMutation({
    mutationFn: (orderId: string) => confirmOrder(orderId),
    onSuccess: (updatedOrder) => {
      setLauncherOrder(updatedOrder);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["compras", "orders"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al confirmar"),
  });

  const cancelMut = useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: (updatedOrder) => {
      setLauncherOrder(updatedOrder);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["compras", "orders"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al cancelar"),
  });

  const closeMut = useMutation({
    mutationFn: (orderId: string) => closeOrder(orderId, closeReason),
    onSuccess: (updatedOrder) => {
      setLauncherOrder(updatedOrder);
      setIsCloseDialogOpen(false);
      setCloseReason("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["compras", "orders"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al cerrar"),
  });

  return (
    <>
      <OrdersPanel
        error={error}
        setError={setError}
        products={products}
        onOrderClick={openLauncher}
      />

      <Dialog
        open={launcherOrder !== null}
        title="Acciones de orden"
        description={launcherOrder ? `${launcherOrder.id.slice(0, 8)} · ${launcherOrder.supplier?.name ?? "Sin proveedor"} · ${launcherOrder.status}` : undefined}
        onClose={closeLauncher}
        maxWidthClassName="max-w-md"
        zIndexClassName="z-[990]"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Selecciona una acción de la orden sin perder el contexto activo.</p>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Acciones de orden</p>
            <div className="grid gap-3">
              {launcherOrder && (launcherOrder.status === "ORDERED" || launcherOrder.status === "PARTIAL") ? (
                <Link to={`/app/commerce/ingreso-desde-proveedor?orderId=${encodeURIComponent(launcherOrder.id)}`}>
                  <Button type="button" variant="secondary" className="w-full">Recepcionar</Button>
                </Link>
              ) : null}
              {launcherOrder?.status === "DRAFT" ? (
                <Button type="button" variant="secondary" className="w-full" onClick={() => confirmMut.mutate(launcherOrder.id)} disabled={confirmMut.isPending}>
                  {confirmMut.isPending ? "Confirmando..." : "Confirmar"}
                </Button>
              ) : null}
              {launcherOrder && (launcherOrder.status === "DRAFT" || launcherOrder.status === "ORDERED" || launcherOrder.status === "PARTIAL") ? (
                <Button type="button" variant="secondary" className="w-full" onClick={() => cancelMut.mutate(launcherOrder.id)} disabled={cancelMut.isPending}>
                  {cancelMut.isPending ? "Cancelando..." : "Cancelar"}
                </Button>
              ) : null}
              {launcherOrder && (launcherOrder.status === "RECEIVED" || launcherOrder.status === "PARTIAL") ? (
                <Button type="button" variant="secondary" className="w-full" onClick={() => setIsCloseDialogOpen(true)}>
                  Cerrar
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Flujos secundarios</p>
            <div className="grid gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => launcherOrder && invoiceRef.current?.openInvoicesDialog(launcherOrder.id)}
                disabled={!launcherOrder}
              >
                Facturas
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => launcherOrder && claimsRef.current?.openClaimsDialog(launcherOrder.id)}
                disabled={!launcherOrder}
              >
                Reclamaciones
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => launcherOrder && returnsRef.current?.openReturnsDialog(launcherOrder.id)}
                disabled={!launcherOrder}
              >
                Devoluciones
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={isCloseDialogOpen}
        title="Cerrar orden administrativamente"
        description="El cierre registra diferencias aceptadas. Requiere motivo y es irreversible."
        onClose={() => { setIsCloseDialogOpen(false); setCloseReason(""); }}
        zIndexClassName="z-[995]"
      >
        <form onSubmit={(e) => { e.preventDefault(); if (launcherOrder && closeReason.trim()) closeMut.mutate(launcherOrder.id); }}>
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Motivo del cierre *</span>
              <textarea
                rows={3}
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="Ej: saldo pendiente aceptado por proveedor incumplido"
                required
                className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => { setIsCloseDialogOpen(false); setCloseReason(""); }}>Cancelar</Button>
              <Button type="submit" disabled={!closeReason.trim() || closeMut.isPending}>{closeMut.isPending ? "Cerrando..." : "Cerrar orden"}</Button>
            </div>
          </div>
        </form>
      </Dialog>

      <InvoicePanel ref={invoiceRef} setError={setError} products={products} />
      <ClaimsPanel ref={claimsRef} setError={setError} />
      <MerchandiseReturnDialog ref={returnsRef} products={products} />
    </>
  );
}
