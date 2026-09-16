import { FormEvent, useEffect, useState } from "react";

import { Button } from "@systutor/shell/ui/button";
import { DataTable } from "@systutor/shell/ui/data-table";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Input } from "@systutor/shell/ui/input";

import type { SalesReceiptCostLine } from "../types";

type Props = {
  open: boolean;
  costLines: SalesReceiptCostLine[];
  onChange: (value: SalesReceiptCostLine[]) => void;
  onClose: () => void;
};

type DraftLine = {
  cost_type: string;
  amount: string;
  notes: string;
};

const EMPTY_DRAFT: DraftLine = {
  cost_type: "FLETE",
  amount: "",
  notes: "",
};

export function SalesReceiptAdditionalCostsDialog({ open, costLines, onChange, onClose }: Props) {
  const [draft, setDraft] = useState<DraftLine>(EMPTY_DRAFT);

  useEffect(() => {
    if (open) setDraft(EMPTY_DRAFT);
  }, [open]);

  function updateLine(index: number, field: keyof SalesReceiptCostLine, value: string) {
    onChange(
      costLines.map((line, currentIndex) =>
        currentIndex === index
          ? {
              ...line,
              [field]: field === "amount" ? Number(value) || 0 : value,
            }
          : line,
      ),
    );
  }

  function addLine(event: FormEvent) {
    event.preventDefault();
    if (!draft.cost_type.trim()) return;
    onChange([
      ...costLines,
      {
        cost_type: draft.cost_type.trim(),
        amount: Number(draft.amount) || 0,
        notes: draft.notes.trim() || null,
      },
    ]);
    setDraft(EMPTY_DRAFT);
  }

  function deleteLine(index: number) {
    onChange(costLines.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <Dialog open={open} title="Costos adicionales" description="Registra costos complementarios de la recepción sin cerrar la ventana principal." onClose={onClose} maxWidthClassName="max-w-4xl">
      <div className="space-y-4">
        <div className="rounded-md border border-border p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Tabla de costos</p>
          <DataTable
            dense
            columns={[
              {
                key: "cost_type",
                header: "Tipo",
                render: (row: SalesReceiptCostLine & { index: number }) => (
                  <Input
                    value={row.cost_type}
                    onChange={(e) => updateLine(row.index, "cost_type", e.target.value)}
                    placeholder="FLETE"
                  />
                ),
              },
              {
                key: "amount",
                header: "Monto",
                className: "w-40",
                render: (row: SalesReceiptCostLine & { index: number }) => (
                  <Input
                    type="number"
                    value={row.amount || ""}
                    onChange={(e) => updateLine(row.index, "amount", e.target.value)}
                    placeholder="0.00"
                  />
                ),
              },
              {
                key: "notes",
                header: "Notas",
                render: (row: SalesReceiptCostLine & { index: number }) => (
                  <Input
                    value={row.notes ?? ""}
                    onChange={(e) => updateLine(row.index, "notes", e.target.value)}
                    placeholder="Opcional"
                  />
                ),
              },
              {
                key: "actions",
                header: "",
                className: "w-16",
                render: (row: SalesReceiptCostLine & { index: number }) => (
                  <Button type="button" variant="secondary" className="h-7 w-7 px-0 py-0" onClick={() => deleteLine(row.index)}>
                    X
                  </Button>
                ),
              },
            ]}
            rows={costLines.map((line, index) => ({ ...line, index })) as Array<SalesReceiptCostLine & { index: number }>}
            rowKey={(row) => String(row.index)}
            emptyMessage="Sin costos adicionales registrados."
          />
        </div>

        <form className="space-y-4 rounded-md border border-dashed border-border p-4" onSubmit={addLine}>
          <p className="text-sm font-medium text-foreground">Nuevo costo</p>
          <div className="grid grid-cols-[1fr_140px_1fr] gap-2">
            <label className="block space-y-2 text-sm text-foreground">
              <span>Tipo</span>
              <Input value={draft.cost_type} onChange={(e) => setDraft((p) => ({ ...p, cost_type: e.target.value }))} placeholder="FLETE" />
            </label>
            <label className="block space-y-2 text-sm text-foreground">
              <span>Monto</span>
              <Input type="number" value={draft.amount} onChange={(e) => setDraft((p) => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
            </label>
            <label className="block space-y-2 text-sm text-foreground">
              <span>Notas</span>
              <Input value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} placeholder="Opcional" />
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setDraft(EMPTY_DRAFT)}>Limpiar</Button>
            <Button type="submit">Agregar costo</Button>
          </div>
        </form>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Dialog>
  );
}
