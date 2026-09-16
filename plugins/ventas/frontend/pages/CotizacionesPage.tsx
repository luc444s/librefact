import { useMutation, useQuery, useQueryClient } from "../../../../apps/web/src/lib/react-query";
import { useMemo, useState } from "react";
import { Button } from "@systutor/shell/ui/button";
import { Alert } from "@systutor/shell/ui/alert";
import { Badge } from "@systutor/shell/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@systutor/shell/ui/card";
import { DataTable } from "@systutor/shell/ui/data-table";
import { Dialog } from "@systutor/shell/ui/dialog";
import type { DataTableColumn } from "@systutor/shell/ui/data-table";
import {
  confirmCotizacion,
  convertCotizacion,
  createCotizacion,
  listCotizaciones,
  type QuoteDraftListItem,
} from "../../cotizacion/frontend/api";
import { NuevaCotizacionDialog } from "../../cotizacion/frontend/NuevaCotizacionDialog";
import { listCustomers } from "../../../crm/frontend/api";
import { listAllProducts } from "../../../productos/frontend/api";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "border-warning/30 bg-warning/10 text-warning",
  CONFIRMED: "border-primary/30 bg-primary/10 text-primary",
  CONVERTED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  CANCELLED: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function CotizacionesPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const quotesQuery = useQuery({
    queryKey: ["ventas", "cotizaciones", { status: statusFilter }],
    queryFn: () => listCotizaciones({ status: statusFilter || undefined }),
  });

  const customersQuery = useQuery({
    queryKey: ["crm", "customers", "cotizaciones-picker"],
    queryFn: () => listCustomers({ limit: 100, offset: 0 }),
  });

  const productsQuery = useQuery({
    queryKey: ["productos", "flat", "cotizaciones"],
    queryFn: () => listAllProducts({ limit: 1000 }),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["ventas", "cotizaciones"] });
    setError(null);
  };

  const createMut = useMutation({
    mutationFn: (payload: { customer_id: string; valid_until: string | null; items: any[]; notes: string | null }) =>
      createCotizacion({
        customer_id: payload.customer_id,
        valid_until: payload.valid_until,
        items: payload.items,
        notes: payload.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventas", "cotizaciones"] });
      setIsCreateOpen(false);
      setError(null);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo crear la cotización"),
  });

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirmCotizacion(id),
    onSuccess: refresh,
    onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo confirmar"),
  });

  const convertMut = useMutation({
    mutationFn: (id: string) => convertCotizacion(id),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["ventas", "orders"] });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo convertir"),
  });

  const quotes = quotesQuery.data ?? [];
  const selectedQuote = useMemo(() => {
    if (!selectedId) return null;
    return quotes.find((quote) => quote.id === selectedId) ?? null;
  }, [quotes, selectedId]);

  const customerOptions = (customersQuery.data?.items ?? []).map((customer) => ({
    value: customer.id,
    label: customer.display_name ?? customer.legal_name ?? customer.name ?? "Sin nombre",
  }));

  const columns: DataTableColumn<QuoteDraftListItem>[] = [
    {
      key: "id",
      header: "#",
      className: "w-24",
      render: (row) => <span className="font-mono text-primary/70">{row.id.slice(0, 4).toUpperCase()}</span>,
    },
    {
      key: "customer",
      header: "Cliente",
      render: (row) => row.customer_name ?? "Sin cliente",
    },
    {
      key: "date",
      header: "Entrega",
      className: "w-32",
      render: (row) => row.delivery_date,
    },
    {
      key: "status",
      header: "Estado",
      className: "w-28",
      render: (row) => <Badge className={STATUS_BADGE[row.status] ?? ""}>{row.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSelectedId(row.id)}>
            Ver
          </Button>
          {row.status === "DRAFT" ? (
            <Button variant="secondary" size="sm" onClick={() => confirmMut.mutate(row.id)}>
              Confirmar
            </Button>
          ) : null}
          {row.status === "CONFIRMED" ? (
            <Button size="sm" onClick={() => convertMut.mutate(row.id)}>
              Convertir
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Cotizaciones</CardTitle>
              <CardDescription>Demandas comerciales de ventas con frontera a CRM y Logistics.</CardDescription>
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos los estados</option>
                <option value="DRAFT">Borrador</option>
                <option value="CONFIRMED">Confirmada</option>
                <option value="CONVERTED">Convertida</option>
                <option value="CANCELLED">Cancelada</option>
              </select>
              <Button onClick={() => setIsCreateOpen(true)}>
                + Nueva cotización
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <Alert title="Error">{error}</Alert> : null}
          <DataTable
            columns={columns}
            rows={quotes}
            rowKey={(row) => row.id}
            emptyMessage="No hay cotizaciones."
          />
        </CardContent>
      </Card>

      <Dialog
        open={selectedQuote !== null}
        title={selectedQuote ? `Cotización ${selectedQuote.id.slice(0, 8)}` : "Cotización"}
        onClose={() => setSelectedId(null)}
        maxWidthClassName="max-w-lg"
      >
        {selectedQuote ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex gap-2"><span className="text-muted-foreground">Cliente</span><span>{selectedQuote.customer_name ?? "Sin cliente"}</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground">Entrega</span><span>{selectedQuote.delivery_date}{selectedQuote.delivery_time ? ` ${selectedQuote.delivery_time}` : ""}</span></div>
              <div className="flex gap-2"><span className="text-muted-foreground">Estado</span><span>{selectedQuote.status}</span></div>
              {selectedQuote.conditions ? <div className="flex gap-2"><span className="text-muted-foreground">Condiciones</span><span>{selectedQuote.conditions}</span></div> : null}
              {selectedQuote.notes ? <div className="flex gap-2"><span className="text-muted-foreground">Notas</span><span>{selectedQuote.notes}</span></div> : null}
            </div>
            <div className="flex justify-end gap-2">
              {selectedQuote.status === "DRAFT" ? <Button variant="secondary" onClick={() => confirmMut.mutate(selectedQuote.id)}>Confirmar</Button> : null}
              {selectedQuote.status === "CONFIRMED" ? <Button onClick={() => convertMut.mutate(selectedQuote.id)}>Convertir</Button> : null}
              <Button variant="secondary" onClick={() => setSelectedId(null)}>Cerrar</Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <NuevaCotizacionDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={createMut.mutate}
        isPending={createMut.isPending}
        customers={customersQuery.data?.items ?? []}
        products={productsQuery.data ?? []}
      />
    </div>
  );
}
