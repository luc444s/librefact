import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "../../../../apps/web/src/lib/react-query";

import { checkout, closeSession, getCurrentSession, openSession } from "../api";
import { CartPanel } from "../components/CartPanel";
import { CashClosePanel } from "../components/CashClosePanel";
import { ItemSearchPanel } from "../components/ItemSearchPanel";
import { PaymentModal } from "../components/PaymentModal";
import { QuickProductForm } from "../components/QuickProductForm";
import { formatSoles } from "../types";
import type { CartLine, PaymentMethod, PosScreen } from "../types";

const NAV_ITEMS: Array<{ screen: PosScreen; label: string }> = [
  { screen: "sale", label: "Venta" },
  { screen: "items", label: "Agregar" },
  { screen: "product", label: "Producto" },
  { screen: "close", label: "Cierre" },
];

export function PosPage() {
  const [screen, setScreen] = useState<PosScreen>("sale");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["pos", "current-session"],
    queryFn: () => getCurrentSession(),
  });
  const session = sessionQuery.data ?? null;

  const cartCount = lines.reduce((total, line) => total + line.quantity, 0);
  const cartTotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [lines]
  );

  function addLine(line: Omit<CartLine, "quantity">) {
    setLines((current) => {
      const existing = current.find((item) => item.productId === line.productId);
      if (existing) {
        return current.map((item) =>
          item.productId === line.productId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...current, { ...line, quantity: 1 }];
    });
  }

  function increase(productId: string) {
    setLines((current) =>
      current.map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line))
    );
  }

  function decrease(productId: string) {
    setLines((current) =>
      current
        .map((line) => (line.productId === productId ? { ...line, quantity: line.quantity - 1 } : line))
        .filter((line) => line.quantity > 0)
    );
  }

  const openMutation = useMutation({
    mutationFn: (openingAmount: number) => openSession({ opening_amount: openingAmount }),
    onSuccess: () => {
      setSessionError(null);
      toast.success("Caja abierta");
      queryClient.invalidateQueries({ queryKey: ["pos", "current-session"] });
    },
    onError: (error) => setSessionError(error instanceof Error ? error.message : "No se pudo abrir la caja"),
  });

  const closeMutation = useMutation({
    mutationFn: (countedAmount: number) => closeSession(session!.id, { counted_amount: countedAmount }),
    onSuccess: () => {
      setSessionError(null);
      toast.success("Caja cerrada");
      queryClient.invalidateQueries({ queryKey: ["pos", "current-session"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "session-summary"] });
    },
    onError: (error) => setSessionError(error instanceof Error ? error.message : "No se pudo cerrar la caja"),
  });

  const checkoutMutation = useMutation({
    mutationFn: () =>
      checkout({
        items: lines.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
        method,
        received_amount: method === "EFECTIVO" && receivedAmount !== "" ? Number(receivedAmount) : null,
        session_id: session?.id ?? null,
      }),
    onSuccess: (result) => {
      setCheckoutError(null);
      setIsPaymentOpen(false);
      setReceivedAmount("");
      setLines([]);
      setScreen("sale");
      toast.success(`Venta registrada${result.sale.document_full_number ? ` ${result.sale.document_full_number}` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["pos", "session-summary"] });
    },
    onError: (error) => setCheckoutError(error instanceof Error ? error.message : "No se pudo registrar la venta"),
  });

  function openPayment() {
    setCheckoutError(null);
    if (method === "EFECTIVO") {
      setReceivedAmount(cartTotal.toFixed(2));
    }
    setIsPaymentOpen(true);
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3 pb-24">
      <header className="rounded-b-[2rem] border border-border bg-sidebar p-4 text-sidebar-foreground shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[0.65rem] font-black uppercase tracking-wide text-sidebar-muted">POS Bodega</span>
            <strong className="block text-xl leading-tight">Bodega Express</strong>
          </div>
          <span
            className={
              session?.status === "OPEN"
                ? "rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"
                : "rounded-full border border-sidebar-muted/40 bg-background/10 px-3 py-1.5 text-xs font-bold text-sidebar-muted"
            }
          >
            {session?.status === "OPEN" ? "Caja abierta" : "Caja cerrada"}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3 rounded-3xl bg-accent p-4 text-accent-foreground shadow-lg">
          <div>
            <span className="text-[0.65rem] font-black uppercase tracking-wide opacity-70">Total venta</span>
            <strong className="block text-3xl leading-none">{formatSoles(cartTotal)}</strong>
          </div>
          <button
            type="button"
            className="rounded-2xl bg-sidebar px-4 py-3 text-sm font-black text-sidebar-foreground disabled:opacity-50"
            disabled={lines.length === 0 || session?.status !== "OPEN"}
            onClick={openPayment}
          >
            Cobrar
          </button>
        </div>
      </header>

      {screen === "sale" ? (
        <CartPanel
          lines={lines}
          session={session}
          method={method}
          onMethodChange={setMethod}
          onIncrease={increase}
          onDecrease={decrease}
          onClear={() => setLines([])}
          onCharge={openPayment}
          onGoToItems={() => setScreen("items")}
        />
      ) : null}

      {screen === "items" ? (
        <ItemSearchPanel
          onAdd={addLine}
          onBack={() => setScreen("sale")}
          cartCount={cartCount}
          cartTotal={cartTotal}
        />
      ) : null}

      {screen === "product" ? (
        <QuickProductForm
          onCreated={(line) => {
            addLine(line);
            toast.success("Producto agregado al carrito");
            setScreen("sale");
          }}
          onCancel={() => setScreen("sale")}
        />
      ) : null}

      {screen === "close" ? (
        <CashClosePanel
          session={session}
          onOpen={(amount) => openMutation.mutate(amount)}
          onClose={(amount) => closeMutation.mutate(amount)}
          isOpening={openMutation.isPending}
          isClosing={closeMutation.isPending}
          error={sessionError}
        />
      ) : null}

      <PaymentModal
        open={isPaymentOpen}
        method={method}
        total={cartTotal}
        receivedAmount={receivedAmount}
        onReceivedChange={setReceivedAmount}
        onConfirm={() => checkoutMutation.mutate()}
        onClose={() => setIsPaymentOpen(false)}
        isPending={checkoutMutation.isPending}
        error={checkoutError}
      />

      <nav className="fixed inset-x-0 bottom-3 z-20 mx-auto grid max-w-3xl grid-cols-4 gap-1.5 rounded-3xl border border-border bg-card/95 p-2 shadow-card backdrop-blur">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.screen}
            type="button"
            onClick={() => setScreen(item.screen)}
            className={
              screen === item.screen
                ? "rounded-2xl bg-primary px-2 py-2 text-xs font-bold text-primary-foreground"
                : "rounded-2xl px-2 py-2 text-xs font-bold text-muted-foreground"
            }
          >
            {item.label}
          </button>
        ))}
      </nav>

      {cartCount > 0 && screen !== "sale" && screen !== "items" ? (
        <button
          type="button"
          onClick={() => setScreen("sale")}
          className="fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-sidebar px-4 py-2 text-xs font-bold text-sidebar-foreground shadow-lg"
        >
          {cartCount} items · {formatSoles(cartTotal)} · Ver venta
        </button>
      ) : null}
    </div>
  );
}
