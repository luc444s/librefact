import { apiRequest } from "@systutor/shell/api/client";

function buildQuery(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

import type {
  SalesDispatch,
  SalesDispatchCreatePayload,
  SalesDispatchPage,
  SalesReceipt,
  SalesReceiptCreatePayload,
  SalesReceiptPage,
  SalesOrder,
  SalesOrderCreatePayload,
  SalesOrderDetail,
  SalesOrderPage,
  SalesOrderUpdatePayload,
} from "./types";

const BASE = "/api/v1/plugins/ventas/orders";
const DISPATCH_BASE = "/api/v1/plugins/ventas/salidas-a-cliente";
const RECEIPT_BASE = "/api/v1/plugins/ventas/ingresos-desde-cliente";

export function listOrders(params: Record<string, unknown> = {}) {
  return apiRequest<SalesOrderPage>(`${BASE}${buildQuery(params)}`);
}

export function getOrder(id: string) {
  return apiRequest<SalesOrderDetail>(`${BASE}/${id}`);
}

export function createOrder(payload: SalesOrderCreatePayload) {
  return apiRequest<SalesOrder>(`${BASE}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOrder(id: string, payload: SalesOrderUpdatePayload) {
  return apiRequest<SalesOrder>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function confirmOrder(id: string) {
  return apiRequest<SalesOrder>(`${BASE}/${id}/confirm`, { method: "POST" });
}

export function dispatchOrder(id: string, reason?: string) {
  return apiRequest<SalesOrder>(`${BASE}/${id}/dispatch`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function cancelOrder(id: string, reason?: string) {
  return apiRequest<SalesOrder>(`${BASE}/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function closeOrder(id: string, reason: string) {
  return apiRequest<SalesOrder>(`${BASE}/${id}/close`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function listSalesDispatches(params: Record<string, unknown> = {}) {
  return apiRequest<SalesDispatchPage>(`${DISPATCH_BASE}${buildQuery(params)}`);
}

export function createSalesDispatch(payload: SalesDispatchCreatePayload) {
  return apiRequest<SalesDispatch>(`${DISPATCH_BASE}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSalesDispatch(id: string) {
  return apiRequest<SalesDispatch>(`${DISPATCH_BASE}/${id}`);
}

export function confirmSalesDispatch(id: string) {
  return apiRequest<SalesDispatch>(`${DISPATCH_BASE}/${id}/confirm`, { method: "POST" });
}

export function cancelSalesDispatch(id: string) {
  return apiRequest<SalesDispatch>(`${DISPATCH_BASE}/${id}/cancel`, { method: "POST" });
}

export function listSalesReceipts(params: Record<string, unknown> = {}) {
  return apiRequest<SalesReceiptPage>(`${RECEIPT_BASE}${buildQuery(params)}`);
}

export function createSalesReceipt(payload: SalesReceiptCreatePayload) {
  return apiRequest<SalesReceipt>(`${RECEIPT_BASE}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSalesReceipt(id: string) {
  return apiRequest<SalesReceipt>(`${RECEIPT_BASE}/${id}`);
}

export function confirmSalesReceipt(id: string) {
  return apiRequest<SalesReceipt>(`${RECEIPT_BASE}/${id}/confirm`, { method: "POST" });
}

export function cancelSalesReceipt(id: string) {
  return apiRequest<SalesReceipt>(`${RECEIPT_BASE}/${id}/cancel`, { method: "POST" });
}
