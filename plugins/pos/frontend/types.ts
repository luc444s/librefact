export type PaymentMethod = "EFECTIVO" | "YAPE_PLIN" | "TARJETA";

export type PosCashSession = {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  status: string;
  opening_amount: number;
  counted_amount: number | null;
  expected_cash_amount: number | null;
  difference: number | null;
  notes: string | null;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
};

export type PosPayment = {
  id: string;
  session_id: string;
  order_id: string;
  method: string;
  amount: number;
  received_amount: number | null;
  change_amount: number | null;
  created_by: string;
  created_at: string;
};

export type PosSaleItem = {
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type PosSale = {
  order_id: string;
  document_type: string;
  document_full_number: string | null;
  status: string;
  total: number;
  items: PosSaleItem[];
  created_at: string;
};

export type CheckoutItemPayload = {
  product_id: string;
  quantity: number;
};

export type CheckoutPayload = {
  items: CheckoutItemPayload[];
  method: PaymentMethod;
  received_amount?: number | null;
  session_id?: string | null;
  notes?: string | null;
};

export type CheckoutResponse = {
  sale: PosSale;
  payment: PosPayment;
};

export type SummaryPaymentTotal = {
  method: string;
  total: number;
  count: number;
};

export type SummarySaleRow = {
  order_id: string;
  document_full_number: string | null;
  method: string;
  total: number;
  created_at: string;
};

export type SessionSummary = {
  session: PosCashSession;
  sales_count: number;
  total_sold: number;
  payment_totals: SummaryPaymentTotal[];
  expected_cash_amount: number;
  difference: number | null;
  recent_sales: SummarySaleRow[];
};

export type QuickProductPayload = {
  name: string;
  sale_price: number;
  barcode?: string | null;
  barcode_type?: string;
  sku?: string | null;
  initial_stock?: number;
  unit_cost?: number;
  weight_kg?: number | null;
  description?: string | null;
  line_id?: string | null;
};

export type QuickProduct = {
  id: string;
  sku: string;
  name: string;
  sale_price: number;
  barcode: string | null;
  initial_stock: number;
};

export type PosProductSearchItem = {
  id: string;
  sku: string;
  name: string;
  price: number | null;
  weight_kg: number | null;
};

export type SetProductPrice = {
  product_id: string;
  price: number;
};

export type CartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

export type PosScreen = "sale" | "items" | "product" | "close";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  YAPE_PLIN: "Yape/Plin",
  TARJETA: "Tarjeta",
};

export function formatSoles(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `S/ ${amount.toFixed(2)}`;
}

export function formatWeight(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const kg = Number(value);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  if (kg < 1) return `${Math.round(kg * 1000)} g`;
  return `${kg.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} kg`;
}
