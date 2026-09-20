import { useState } from "react";
import { Button } from "@systutor/shell/ui/button";
import { Input } from "@systutor/shell/ui/input";
import { useQuery } from "../../../../apps/web/src/lib/react-query";

import { getSessionSummary } from "../api";
import { formatSoles } from "../types";
import type { PosCashSession } from "../types";

type CashClosePanelProps = {
  session: PosCashSession | null;
  onOpen: (openingAmount: number) => void;
  onClose: (countedAmount: number) => void;
  isOpening: boolean;
  isClosing: boolean;
  error: string | null;
};

export function CashClosePanel({ session, onOpen, onClose, isOpening, isClosing, error }: CashClosePanelProps) {
  const [openingAmount, setOpeningAmount] = useState("0");
  const [countedAmount, setCountedAmount] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["pos", "session-summary", session?.id],
    queryFn: () => getSessionSummary(session!.id),
    enabled: Boolean(session?.id),
  });

  if (!session) {
    return (
      <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-base font-bold text-card-foreground">Apertura de caja</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Registra el monto inicial del turno para empezar a cobrar.
        </p>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onOpen(Number(openingAmount || "0"));
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-muted-foreground">Monto inicial</span>
            <Input
              type="number"
              min="0"
              step="0.10"
              value={openingAmount}
              onChange={(event) => setOpeningAmount(event.target.value)}
            />
          </label>
          {error ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          ) : null}
          <Button type="submit" disabled={isOpening} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isOpening ? "Abriendo..." : "Abrir caja"}
          </Button>
        </form>
      </section>
    );
  }

  const summary = summaryQuery.data;
  const totalsByMethod = summary?.payment_totals ?? [];
  const isClosed = session.status !== "OPEN";

  return (
    <div className="grid gap-3">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-card-foreground">Cierre de caja</h2>
            <p className="text-xs text-muted-foreground">Resumen del turno antes de cerrar.</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
            {isClosed ? "Cerrada" : "Abierta"}
          </span>
        </div>

        {summaryQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando resumen...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Total vendido" value={formatSoles(summary?.total_sold ?? 0)} />
              <Stat label="Ventas" value={String(summary?.sales_count ?? 0)} />
              <Stat label="Apertura" value={formatSoles(session.opening_amount)} />
              <Stat
                label="Efectivo esperado"
                value={formatSoles(summary?.expected_cash_amount ?? session.opening_amount)}
              />
              {totalsByMethod.map((row) => (
                <Stat key={row.method} label={row.method} value={formatSoles(row.total)} />
              ))}
            </div>

            {session.difference !== null && session.difference !== undefined ? (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm">
                <span className="text-muted-foreground">Diferencia del cierre</span>
                <strong className={session.difference === 0 ? "text-primary" : "text-destructive"}>
                  {formatSoles(session.difference)}
                </strong>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <h3 className="text-sm font-bold text-card-foreground">Últimas ventas</h3>
        {summary && summary.recent_sales.length > 0 ? (
          <div className="mt-2 grid gap-2">
            {summary.recent_sales.map((sale) => (
              <div key={sale.order_id} className="flex items-center justify-between border-b border-dashed border-border pb-2 text-sm last:border-b-0 last:pb-0">
                <span className="text-muted-foreground">
                  {sale.document_full_number ?? sale.order_id.slice(0, 8)} · {sale.method}
                </span>
                <strong className="text-card-foreground">{formatSoles(sale.total)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Aún no hay ventas en este turno.</p>
        )}
      </section>

      {!isClosed ? (
        <form
          className="grid gap-3 rounded-3xl border border-border bg-card p-4 shadow-card"
          onSubmit={(event) => {
            event.preventDefault();
            onClose(Number(countedAmount || "0"));
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-muted-foreground">Monto contado</span>
            <Input
              type="number"
              min="0"
              step="0.10"
              value={countedAmount}
              onChange={(event) => setCountedAmount(event.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          ) : null}
          <Button
            type="submit"
            variant="secondary"
            className="border-destructive/40 bg-destructive/10 text-destructive"
            disabled={isClosing || countedAmount === ""}
          >
            {isClosing ? "Cerrando..." : "Cerrar caja"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-lg text-foreground">{value}</strong>
    </div>
  );
}
