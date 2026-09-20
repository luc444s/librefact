import { apiRequest } from "@systutor/shell/api/client";

import type {
  CheckoutPayload,
  CheckoutResponse,
  PosCashSession,
  PosProductSearchItem,
  QuickProduct,
  QuickProductPayload,
  SessionSummary,
  SetProductPrice,
} from "./types";

const BASE = "/api/v1/plugins/pos";

export function openSession(payload: { opening_amount: number; warehouse_id?: string | null }) {
  return apiRequest<PosCashSession>(`${BASE}/sessions/open`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getCurrentSession() {
  return apiRequest<PosCashSession | null>(`${BASE}/sessions/current`);
}

export function getSessionSummary(sessionId: string) {
  return apiRequest<SessionSummary>(`${BASE}/sessions/${sessionId}/summary`);
}

export function closeSession(sessionId: string, payload: { counted_amount: number; notes?: string | null }) {
  return apiRequest<PosCashSession>(`${BASE}/sessions/${sessionId}/close`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function checkout(payload: CheckoutPayload) {
  return apiRequest<CheckoutResponse>(`${BASE}/checkout`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createQuickProduct(payload: QuickProductPayload) {
  return apiRequest<QuickProduct>(`${BASE}/products/quick`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function searchPosProducts(q: string, limit = 20) {
  const query = new URLSearchParams();
  if (q.trim()) {
    query.set("q", q);
  }
  query.set("limit", String(limit));
  return apiRequest<PosProductSearchItem[]>(`${BASE}/products/search?${query.toString()}`);
}

export function setPosProductPrice(productId: string, amount: number) {
  return apiRequest<SetProductPrice>(`${BASE}/products/${productId}/price`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}
