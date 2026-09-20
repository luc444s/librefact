import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "../../../../apps/web/src/lib/react-query";

import { checkout, closeSession, getCurrentSession, openSession } from "../api";
import { CartPanel } from "../components/CartPanel";
import { CashClosePanel } from "../components/CashClosePanel";
import { ItemSearchPanel } from "../components/ItemSearchPanel";
import { PaymentModal } from "../components/PaymentModal";
import { PosSettingsModal } from "../components/PosSettingsModal";
import { QuickProductForm } from "../components/QuickProductForm";
import { formatSoles } from "../types";
import type { CartLine, PaymentMethod, PosScreen } from "../types";

const POS_TITLE_KEY = "pos.bodega.title";
const POS_QR_KEY = "pos.bodega.qrImage";

const NAV_ITEMS: Array<{ screen: PosScreen; label: string; icon: "sale" | "items" | "product" | "close" }> = [
  { screen: "sale", label: "Venta", icon: "sale" },
  { screen: "items", label: "Agregar", icon: "items" },
  { screen: "product", label: "Producto", icon: "product" },
  { screen: "close", label: "Cierre", icon: "close" },
];

function NavIcon({ icon }: { icon: (typeof NAV_ITEMS)[number]["icon"] }) {
  if (icon === "sale") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 10h4M7 14h2M15 14h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }
  if (icon === "items") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M5 7h14M5 12h14M5 17h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M18 15v6M15 18h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }
  if (icon === "product") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M6 8.5 12 5l6 3.5v7L12 19l-6-3.5z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="m6 8.5 6 3.5 6-3.5M12 12v7" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M7 4h10v16H7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9.5 8h5M9.5 12h5M9.5 16h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M15 16.5 16.3 18l2.7-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19 12a7.7 7.7 0 0 0-.08-1.08l2.08-1.6-2-3.46-2.46.98a7.8 7.8 0 0 0-1.86-1.08L14.31 3h-4.62l-.37 2.76a7.8 7.8 0 0 0-1.86 1.08L5 5.86l-2 3.46 2.08 1.6a7.42 7.42 0 0 0 0 2.16L3 14.68l2 3.46 2.46-.98a7.8 7.8 0 0 0 1.86 1.08l.37 2.76h4.62l.37-2.76a7.8 7.8 0 0 0 1.86-1.08l2.46.98 2-3.46-2.08-1.6A7.7 7.7 0 0 0 19 12Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}

export function PosPage() {
  const [screen, setScreen] = useState<PosScreen>("sale");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [posTitle, setPosTitleState] = useState(() => localStorage.getItem(POS_TITLE_KEY) || "Bodega Express");
  const [qrImage, setQrImageState] = useState(() => localStorage.getItem(POS_QR_KEY) || "");

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

  function setPosTitle(value: string) {
    setPosTitleState(value);
    localStorage.setItem(POS_TITLE_KEY, value);
  }

  function setQrImage(value: string) {
    setQrImageState(value);
    if (value) localStorage.setItem(POS_QR_KEY, value);
    else localStorage.removeItem(POS_QR_KEY);
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3 pb-24">
      <header className="rounded-b-[2rem] border border-border bg-sidebar p-4 text-sidebar-foreground shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[0.65rem] font-black uppercase tracking-wide text-sidebar-muted">POS Bodega</span>
            <strong className="block text-xl leading-tight">{posTitle.trim() || "Bodega Express"}</strong>
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
        qrImage={qrImage}
      />

      <PosSettingsModal
        open={isSettingsOpen}
        title={posTitle}
        qrImage={qrImage}
        onTitleChange={setPosTitle}
        onQrImageChange={setQrImage}
        onClose={() => setIsSettingsOpen(false)}
      />

      <nav className="fixed inset-x-0 bottom-3 z-20 mx-auto grid max-w-3xl grid-cols-5 gap-1.5 rounded-3xl border border-border bg-card/95 p-2 shadow-card backdrop-blur">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.screen}
            type="button"
            aria-label={item.label}
            title={item.label}
            onClick={() => setScreen(item.screen)}
            className={
              screen === item.screen
                ? "grid place-items-center rounded-2xl bg-primary px-2 py-2 text-primary-foreground"
                : "grid place-items-center rounded-2xl px-2 py-2 text-muted-foreground"
            }
          >
            <NavIcon icon={item.icon} />
          </button>
        ))}
        <button
          type="button"
          aria-label="Ajustes"
          title="Ajustes"
          onClick={() => setIsSettingsOpen(true)}
          className={
            isSettingsOpen
              ? "grid place-items-center rounded-2xl bg-primary px-2 py-2 text-primary-foreground"
              : "grid place-items-center rounded-2xl px-2 py-2 text-muted-foreground"
          }
        >
          <SettingsIcon />
        </button>
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
