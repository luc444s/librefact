import { useEffect, useRef, useState } from "react";

import { useQuery } from "../../../../../../apps/web/src/lib/react-query";
import { Link } from "../../../../../../apps/web/src/lib/router";
import { Alert } from "@systutor/shell/ui/alert";
import { Badge } from "@systutor/shell/ui/badge";
import { Button } from "@systutor/shell/ui/button";
import { DataTable } from "@systutor/shell/ui/data-table";
import { CommerceSection } from "../../../../frontend/components";
import { listAllProducts } from "../../../../../productos/frontend/api";
import { listDispatches } from "../../api";
import { ReceiptPanel, type ReceiptPanelHandle } from "../purchase/ReceiptPanel";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  ORDERED: "border-primary/30 bg-primary/10 text-primary",
  PARTIAL: "border-warning/30 bg-warning/10 text-warning",
  RECEIVED: "border-success/30 bg-success/10 text-success",
  DESPACHADO: "border-primary/30 bg-primary/10 text-primary",
  CLOSED: "border-border bg-secondary text-secondary-foreground",
  CANCELLED: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  ORDERED: "Ordenada",
  PARTIAL: "Parcial",
  RECEIVED: "Recibida",
  DESPACHADO: "Despachado",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

export function IngresoDesdeProveedorPage() {
  const receiptRef = useRef<ReceiptPanelHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const productsQuery = useQuery({
    queryKey: ["productos", "all-active"],
    queryFn: () => listAllProducts({ is_active: true }),
  });
  const products = productsQuery.data ?? [];

  const dispatchesQuery = useQuery({
    queryKey: ["compras", "dispatches", "receivable", page],
    queryFn: () => listDispatches({ status: "DESPACHADO", receivable_only: true, limit: 20, offset: (page - 1) * 20 }),
  });

  const dispatches = dispatchesQuery.data?.items ?? [];
  const total = dispatchesQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get("orderId");
    if (!orderId) return;
    listDispatches({ order_id: orderId, status: "DESPACHADO", receivable_only: true, limit: 1 })
      .then((result) => {
        const dispatch = result.items[0];
        if (dispatch) receiptRef.current?.openReceiveDialog(dispatch.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar despacho"));
  }, []);

  return (
    <>
      <CommerceSection
        title="Ingreso desde proveedor"
        description="Gestiona la cola de despachos recepcionables y el retorno desde un solo selector."
        actions={
          <div className="flex gap-2">
            <Link to="/app/commerce/purchase-orders">
              <Button variant="secondary">Volver a órdenes</Button>
            </Link>
          </div>
        }
      >
        {error ? <Alert title="Error">{error}</Alert> : null}

        <DataTable
          columns={[
            { key: "supplier", header: "Proveedor", render: (row) => row.supplier?.name ?? "-" },
            { key: "order", header: "Orden", render: (row) => (row.order_id ? row.order_id.slice(0, 8) : "-") },
            { key: "status", header: "Estado", render: (row) => <Badge className={STATUS_BADGE[row.status] ?? ""}>{STATUS_LABEL[row.status] ?? row.status}</Badge> },
            { key: "date", header: "Fecha", render: (row) => row.dispatch_date },
            { key: "cylinders", header: "Cilindros", render: (row) => row.cylinders.length },
            {
              key: "actions",
              header: "Acciones",
              render: (row) => (
                <div className="flex gap-2">{row.status === "DESPACHADO" ? <Button variant="secondary" onClick={() => receiptRef.current?.openReceiveDialog(row.id)}>Recepcionar</Button> : null}</div>
              ),
            },
          ]}
          rows={dispatches}
          rowKey={(row) => row.id}
          emptyMessage="No hay despachos recepcionables."
        />

        {totalPages > 1 ? (
          <div className="flex justify-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span className="px-3 py-2 text-sm">
              {page} / {totalPages}
            </span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </div>
        ) : null}
      </CommerceSection>
      <ReceiptPanel ref={receiptRef} setError={setError} products={products} />
    </>
  );
}
