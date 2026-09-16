import { useQuery } from "../../../../apps/web/src/lib/react-query";
import { useRef, useState } from "react";

import { Alert } from "@systutor/shell/ui/alert";
import { Badge } from "@systutor/shell/ui/badge";
import { Button } from "@systutor/shell/ui/button";
import { DataTable } from "@systutor/shell/ui/data-table";

import { listSalesDispatches } from "../api";
import { SalesReceiptPanel, type SalesReceiptPanelHandle } from "./SalesReceiptPanel";
import { listAllProducts } from "../../../productos/frontend/api";

const STATUS_BADGE: Record<string, string> = {
  DESPACHADO: "border-primary/30 bg-primary/10 text-primary",
};

function totalQty(row: { items: Array<{ outgoing_qty: number }> }) {
  return row.items.reduce((sum, item) => sum + Number(item.outgoing_qty), 0);
}

export function SalesReceiptsPage() {
  const receiptRef = useRef<SalesReceiptPanelHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const productsQuery = useQuery({
    queryKey: ["productos", "all-active"],
    queryFn: () => listAllProducts({ is_active: true }),
  });

  const dispatchesQuery = useQuery({
    queryKey: ["ventas", "salidas-a-cliente", "receivable", page],
    queryFn: () => listSalesDispatches({ status: "DESPACHADO", limit: 20, offset: (page - 1) * 20 }),
  });

  const dispatches = dispatchesQuery.data?.items ?? [];
  const total = dispatchesQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);
  const products = productsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {error ? <Alert title="Error">{error}</Alert> : null}

      <DataTable
        columns={[
          {
            key: "supplier",
            header: "Proveedor",
            render: (row) => row.customer?.name ?? row.customer_name ?? "-",
          },
          {
            key: "order",
            header: "Orden",
            render: (row) => row.id.slice(0, 8),
          },
          { key: "status", header: "Estado", render: (row) => <Badge className={STATUS_BADGE[row.status] ?? ""}>{row.status === "DESPACHADO" ? "Despachado" : row.status}</Badge> },
          { key: "date", header: "Fecha", render: (row) => row.dispatch_date },
          { key: "items", header: "Cilindros", render: (row) => `${totalQty(row)}` },
          {
            key: "actions",
            header: "Acciones",
            render: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.status === "DESPACHADO" ? <Button variant="secondary" size="sm" onClick={() => receiptRef.current?.openReceiveDialog(row.id)}>Recepcionar</Button> : null}
              </div>
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

      <SalesReceiptPanel ref={receiptRef} setError={setError} products={products} />
    </div>
  );
}
