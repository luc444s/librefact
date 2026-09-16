import { useMutation, useQuery, useQueryClient } from "../../../../apps/web/src/lib/react-query";
import { useState } from "react";
import { Button } from "@systutor/shell/ui/button";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Link } from "../../../../apps/web/src/lib/router";
import { listAllProducts } from "../../../productos/frontend/api";
import { confirmOrder, cancelOrder, closeOrder, dispatchOrder } from "../api";
import { OrdersPanel } from "./sales/OrdersPanel";
import type { SalesOrder } from "../types";

export function SalesOrdersPage() {
  const [error, setError] = useState<string | null>(null);
  const [launcherOrder, setLauncherOrder] = useState<SalesOrder | null>(null);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ["productos", "all-active"],
    queryFn: () => listAllProducts({ is_active: true }),
  });
  const products = productsQuery.data ?? [];

  function openLauncher(order: SalesOrder) {
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
      queryClient.invalidateQueries({ queryKey: ["ventas", "orders"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al confirmar"),
  });

  const dispatchMut = useMutation({
    mutationFn: (orderId: string) => dispatchOrder(orderId),
    onSuccess: (updatedOrder) => {
      setLauncherOrder(updatedOrder);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["ventas", "orders"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al despachar"),
  });

  const cancelMut = useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: (updatedOrder) => {
      setLauncherOrder(updatedOrder);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["ventas", "orders"] });
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
      queryClient.invalidateQueries({ queryKey: ["ventas", "orders"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al cerrar"),
  });

  return (
    <>
      <OrdersPanel error={error} setError={setError} products={products} onOrderClick={openLauncher} />

      <Dialog
        open={launcherOrder !== null}
        title="Acciones de pedido"
        description={
          launcherOrder
            ? `${launcherOrder.id.slice(0, 8)} · ${launcherOrder.customer?.name ?? "Sin cliente"} · ${launcherOrder.status}`
            : undefined
        }
        onClose={closeLauncher}
        maxWidthClassName="max-w-md"
        zIndexClassName="z-[990]"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecciona una acción del pedido sin perder el contexto activo.
          </p>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Acciones del pedido</p>
            <div className="grid gap-3">
              {launcherOrder?.status === "DRAFT" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => confirmMut.mutate(launcherOrder.id)}
                  disabled={confirmMut.isPending}
                >
                  {confirmMut.isPending ? "Confirmando..." : "Confirmar"}
                </Button>
              ) : null}
              {launcherOrder && (launcherOrder.status === "CONFIRMED" || launcherOrder.status === "PARTIAL") ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => dispatchMut.mutate(launcherOrder.id)}
                  disabled={dispatchMut.isPending}
                >
                  {dispatchMut.isPending ? "Despachando..." : "Despachar"}
                </Button>
              ) : null}
              {launcherOrder?.status === "DISPATCHED" ? (
                <Button type="button" variant="secondary" className="w-full" onClick={() => setIsCloseDialogOpen(true)}>
                  Cerrar
                </Button>
              ) : null}
              {launcherOrder && (launcherOrder.status === "DRAFT" || launcherOrder.status === "CONFIRMED" || launcherOrder.status === "PARTIAL") ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => cancelMut.mutate(launcherOrder.id)}
                  disabled={cancelMut.isPending}
                >
                  {cancelMut.isPending ? "Cancelando..." : "Cancelar"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fronteras</p>
            <div className="grid gap-3">
              <Link to="/app/crm/customers">
                <Button type="button" variant="secondary" className="w-full">
                  Clientes
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={isCloseDialogOpen}
        title="Cerrar pedido administrativamente"
        description="El cierre registra diferencias aceptadas. Requiere motivo y es irreversible."
        onClose={() => {
          setIsCloseDialogOpen(false);
          setCloseReason("");
        }}
        zIndexClassName="z-[995]"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (launcherOrder && closeReason.trim()) closeMut.mutate(launcherOrder.id);
          }}
        >
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Motivo del cierre *</span>
              <textarea
                rows={3}
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="Ej: pedido cerrado por ajuste comercial"
                required
                className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsCloseDialogOpen(false);
                  setCloseReason("");
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!closeReason.trim() || closeMut.isPending}>
                {closeMut.isPending ? "Cerrando..." : "Cerrar pedido"}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </>
  );
}
