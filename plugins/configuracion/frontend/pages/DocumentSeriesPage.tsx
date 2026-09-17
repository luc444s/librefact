import { FormEvent, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "../../../../apps/web/src/lib/react-query";
import { Alert } from "@systutor/shell/ui/alert";
import { Button } from "@systutor/shell/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@systutor/shell/ui/card";
import { Input } from "@systutor/shell/ui/input";
import { Select } from "@systutor/shell/ui/select";

import { configuracionKeys, createDocumentSeries, listDocumentSeries, updateDocumentSeries } from "../api";
import type { DocumentSeries, DocumentType } from "../types";

type FormState = {
  document_type: DocumentType;
  series: string;
  initial_number: string;
  branch_id: string;
  is_default: boolean;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  document_type: "FACTURA",
  series: "F001",
  initial_number: "1",
  branch_id: "",
  is_default: true,
  is_active: true,
};

export function DocumentSeriesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<DocumentSeries | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const seriesQuery = useQuery({
    queryKey: configuracionKeys.documentSeries,
    queryFn: listDocumentSeries,
  });

  const createMutation = useMutation({
    mutationFn: createDocumentSeries,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configuracionKeys.documentSeries });
      setForm(EMPTY_FORM);
      setErrorMessage(null);
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { branch_id: string | null; is_default: boolean; is_active: boolean } }) =>
      updateDocumentSeries(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configuracionKeys.documentSeries });
      setEditing(null);
      setForm(EMPTY_FORM);
      setErrorMessage(null);
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  function startEdit(row: DocumentSeries) {
    setEditing(row);
    setForm({
      document_type: row.document_type,
      series: row.series,
      initial_number: String(row.initial_number),
      branch_id: row.branch_id ?? "",
      is_default: row.is_default,
      is_active: row.is_active,
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const initialNumber = Number(form.initial_number);
    if (!Number.isInteger(initialNumber) || initialNumber < 1) {
      setErrorMessage("El número inicial debe ser un entero mayor a cero.");
      return;
    }

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        payload: {
          branch_id: form.branch_id.trim() || null,
          is_default: form.is_default,
          is_active: form.is_active,
        },
      });
      return;
    }

    createMutation.mutate({
      document_type: form.document_type,
      series: form.series.trim().toUpperCase(),
      initial_number: initialNumber,
      branch_id: form.branch_id.trim() || null,
      is_default: form.is_default,
      is_active: form.is_active,
    });
  }

  const rows = seriesQuery.data ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Configuración / Facturación</p>
        <h1 className="text-2xl font-semibold text-foreground">Series y correlativos</h1>
        <p className="text-sm text-muted-foreground">Configura FACTURA y BOLETA sin reservar numeración fiscal.</p>
      </div>

      {seriesQuery.error ? <Alert title="No se pudo cargar series">{seriesQuery.error.message}</Alert> : null}
      {errorMessage ? <Alert title="No se pudo guardar">{errorMessage}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{editing ? "Editar serie" : "Nueva serie"}</CardTitle>
            <CardDescription>
              {editing ? "Solo cambia sucursal, activo y predeterminado." : "El correlativo siguiente se inicia con el número inicial."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Select
                value={form.document_type}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    document_type: value as DocumentType,
                    series: value === "BOLETA" ? "B001" : "F001",
                  }))
                }
                disabled={editing !== null}
                placeholder="Tipo de documento"
                options={[
                  { value: "FACTURA", label: "Factura" },
                  { value: "BOLETA", label: "Boleta" },
                ]}
              />
              <Input
                value={form.series}
                onChange={(event) => setForm((current) => ({ ...current, series: event.target.value }))}
                disabled={editing !== null}
                placeholder="F001"
              />
              <Input
                type="number"
                min={1}
                value={form.initial_number}
                onChange={(event) => setForm((current) => ({ ...current, initial_number: event.target.value }))}
                disabled={editing !== null}
                placeholder="Número inicial"
              />
              <Input
                value={form.branch_id}
                onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value }))}
                placeholder="Sucursal opcional (UUID)"
              />
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(event) => setForm((current) => ({ ...current, is_default: event.target.checked }))}
                />
                Predeterminada
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                />
                Activa
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={isSaving}>{editing ? "Guardar" : "Crear"}</Button>
                {editing ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditing(null);
                      setForm(EMPTY_FORM);
                    }}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Series configuradas</CardTitle>
            <CardDescription>{rows.length} serie{rows.length === 1 ? "" : "s"} registrada{rows.length === 1 ? "" : "s"}.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Serie</th>
                    <th className="px-3 py-2">Inicial</th>
                    <th className="px-3 py-2">Siguiente</th>
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2">{row.document_type}</td>
                      <td className="px-3 py-2 font-medium">{row.series}</td>
                      <td className="px-3 py-2">{row.initial_number}</td>
                      <td className="px-3 py-2">{row.next_number}</td>
                      <td className="px-3 py-2">{row.branch_id ?? "Global"}</td>
                      <td className="px-3 py-2">
                        {row.is_active ? "Activa" : "Inactiva"}{row.is_default ? " · Predeterminada" : ""}
                      </td>
                      <td className="px-3 py-2">
                        <Button type="button" variant="secondary" onClick={() => startEdit(row)}>Editar</Button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>
                        No hay series configuradas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
