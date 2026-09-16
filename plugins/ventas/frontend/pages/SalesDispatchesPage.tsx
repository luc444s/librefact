import { useMutation, useQuery, useQueryClient } from "../../../../apps/web/src/lib/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@systutor/shell/ui/button";
import { Dialog } from "@systutor/shell/ui/dialog";
import { DataTable } from "@systutor/shell/ui/data-table";
import { Alert } from "@systutor/shell/ui/alert";
import { Badge } from "@systutor/shell/ui/badge";
import { Combobox } from "@systutor/shell/ui/combobox";
import { cancelSalesDispatch, confirmSalesDispatch, createSalesDispatch, listSalesDispatches } from "../api";
import { listCustomers } from "../../../crm/frontend/api";
import { listCylindersWithFilters } from "../../../logistics/frontend/api/cylinder-list";

const STATUS_BADGE: Record<string, string> = {
  PREPARADO: "border-warning/30 bg-warning/10 text-warning",
  DESPACHADO: "border-primary/30 bg-primary/10 text-primary",
  CANCELADO: "border-destructive/30 bg-destructive/10 text-destructive",
};

type SelectedCylinder = {
  cylinder_id: string;
  serial: string;
  product_id: string | null;
};

export function SalesDispatchesPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const dispatchesQuery = useQuery({
    queryKey: ["ventas", "salidas-a-cliente", { status: statusFilter }],
    queryFn: () => listSalesDispatches({ status: statusFilter || undefined }),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["ventas", "salidas-a-cliente"] });
    setError(null);
  }

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirmSalesDispatch(id),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Error al confirmar"),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelSalesDispatch(id),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Error al cancelar"),
  });

  const dispatches = dispatchesQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <Dialog
        open={formOpen}
        title="Nueva salida a cliente"
        description="Selecciona cliente y agrega los cilindros por serial. La salida se confirma después."
        onClose={() => {
          setFormOpen(false);
          setError(null);
        }}
        maxWidthClassName="max-w-3xl"
      >
        <CreateDispatchDialog
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setError(null);
          }}
          onCreated={invalidate}
          setError={setError}
        />
      </Dialog>

      <Button onClick={() => setFormOpen(true)}>Nueva salida</Button>

      <CardLikeSection
        error={error}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        dispatches={dispatches}
        confirmMut={confirmMut}
        cancelMut={cancelMut}
      />
    </div>
  );
}

function CardLikeSection({
  error,
  statusFilter,
  setStatusFilter,
  dispatches,
  confirmMut,
  cancelMut,
}: {
  error: string | null;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  dispatches: Awaited<ReturnType<typeof listSalesDispatches>>["items"];
  confirmMut: { mutate: (id: string) => void; isPending: boolean };
  cancelMut: { mutate: (id: string) => void; isPending: boolean };
}) {
  const totalQty = (row: (typeof dispatches)[number]) => row.items.reduce((sum, item) => sum + Number(item.outgoing_qty), 0);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Salidas a cliente</h2>
          <p className="text-sm text-muted-foreground">Egreso por serial con cliente y stock de salida.</p>
        </div>
        <div className="w-64">
          <Combobox
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "", label: "Todos los estados" },
              { value: "PREPARADO", label: "Preparado" },
              { value: "DESPACHADO", label: "Despachado" },
              { value: "CANCELADO", label: "Cancelado" },
            ]}
            placeholder="Filtrar por estado"
          />
        </div>
      </div>

      {error ? <Alert title="Error">{error}</Alert> : null}

      <DataTable
        columns={[
          {
            key: "customer",
            header: "Cliente",
            render: (row) => row.customer?.name ?? row.customer_name ?? row.customer?.id ?? "-",
          },
          { key: "date", header: "Fecha", render: (row) => row.dispatch_date },
          { key: "items", header: "Cilindros", render: (row) => `${row.items.length} seriales / ${totalQty(row)} salida(s)` },
          {
            key: "status",
            header: "Estado",
            render: (row) => (
              <Badge className={STATUS_BADGE[row.status] ?? ""}>
                {row.status === "PREPARADO" ? "Preparado" : row.status === "DESPACHADO" ? "Despachado" : "Cancelado"}
              </Badge>
            ),
          },
          {
            key: "actions",
            header: "",
            render: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.status === "PREPARADO" ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => confirmMut.mutate(row.id)} disabled={confirmMut.isPending}>
                      Confirmar salida
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => cancelMut.mutate(row.id)} disabled={cancelMut.isPending}>
                      Cancelar
                    </Button>
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
        rows={dispatches}
        rowKey={(row) => row.id}
        emptyMessage="No hay salidas registradas."
      />
    </div>
  );
}

function CreateDispatchDialog({
  open,
  onClose,
  onCreated,
  setError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  setError: (value: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [selectedCylinderId, setSelectedCylinderId] = useState("");
  const [selectedCylinders, setSelectedCylinders] = useState<SelectedCylinder[]>([]);

  useEffect(() => {
    if (!open) {
      setCustomerId("");
      setDispatchDate(new Date().toISOString().slice(0, 10));
      setNotes("");
      setSelectedCylinderId("");
      setSelectedCylinders([]);
      setError(null);
    }
  }, [open, setError]);

  const customersQuery = useQuery({
    queryKey: ["crm", "customers", "ventas-salidas-a-cliente"],
    queryFn: () => listCustomers({ limit: 200 }),
    enabled: open,
  });

  const cylindersQuery = useQuery({
    queryKey: ["logistics", "cylinders", "ventas-salidas-a-cliente"],
    queryFn: () => listCylindersWithFilters({ active: true, per_page: 200 }),
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createSalesDispatch({
        customer_id: customerId,
        dispatch_date: dispatchDate || undefined,
        notes: notes || undefined,
        cylinders: selectedCylinders.map((item) => ({ cylinder_id: item.cylinder_id, outgoing_qty: 1 })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventas", "salidas-a-cliente"] });
      onCreated();
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al crear la salida"),
  });

  const customerOptions = (customersQuery.data?.items ?? []).map((customer) => ({
    value: customer.id,
    label: `${customer.commercial_name ?? customer.legal_name} · ${customer.document_number}`,
  }));

  const cylinderOptions = (cylindersQuery.data?.items ?? [])
    .filter((cylinder) => !["BLOQUEADO", "DE_BAJA", "PERDIDO"].includes(cylinder.current_state))
    .map((cylinder) => ({
      value: cylinder.id,
      label: `${cylinder.serial}${cylinder.description ? ` · ${cylinder.description}` : ""}`,
    }));

  function addCylinder() {
    if (!selectedCylinderId) return;
    const cylinder = (cylindersQuery.data?.items ?? []).find((item) => item.id === selectedCylinderId);
    if (!cylinder) return;
    if (selectedCylinders.some((item) => item.cylinder_id === cylinder.id)) {
      setError(`El serial ${cylinder.serial} ya está agregado`);
      return;
    }
    setSelectedCylinders((items) => [...items, { cylinder_id: cylinder.id, serial: cylinder.serial, product_id: cylinder.product_id }]);
    setSelectedCylinderId("");
    setError(null);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (!customerId || selectedCylinders.length === 0) return;
        createMut.mutate();
      }}
    >
      <label className="block space-y-2 text-sm text-foreground">
        <span>Cliente *</span>
        <Combobox value={customerId} onChange={setCustomerId} options={customerOptions} placeholder="Seleccionar cliente" searchPlaceholder="Buscar cliente" />
      </label>

      <label className="block space-y-2 text-sm text-foreground">
        <span>Fecha de salida</span>
        <input
          type="date"
          value={dispatchDate}
          onChange={(event) => setDispatchDate(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label className="block space-y-2 text-sm text-foreground">
        <span>Cilindro *</span>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Combobox value={selectedCylinderId} onChange={setSelectedCylinderId} options={cylinderOptions} placeholder="Seleccionar serial" searchPlaceholder="Buscar serial" />
          </div>
          <Button type="button" variant="secondary" onClick={addCylinder} disabled={!selectedCylinderId}>
            Agregar
          </Button>
        </div>
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Seriales ({selectedCylinders.length})</p>
        {selectedCylinders.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no agregaste seriales.</p>
        ) : null}
        {selectedCylinders.map((item) => (
          <div key={item.cylinder_id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span>{item.serial}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedCylinders((rows) => rows.filter((row) => row.cylinder_id !== item.cylinder_id))}>
              Quitar
            </Button>
          </div>
        ))}
      </div>

      <label className="block space-y-2 text-sm text-foreground">
        <span>Notas</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!customerId || selectedCylinders.length === 0 || createMut.isPending}>
          {createMut.isPending ? "Creando..." : "Crear salida"}
        </Button>
      </div>
    </form>
  );
}
