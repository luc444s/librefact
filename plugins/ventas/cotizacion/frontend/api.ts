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

import type { QuoteDraftDTO, QuoteDraftListItem, QuoteItemPayload, QuoteCreatePayload } from "./types";

const BASE = "/api/v1/plugins/ventas";

export function listCotizaciones(params: Record<string, unknown> = {}) {
  return apiRequest<QuoteDraftListItem[]>(`${BASE}/cotizaciones${buildQuery(params)}`);
}

export function getCotizacion(id: string) {
  return apiRequest<QuoteDraftDTO>(`${BASE}/cotizaciones/${id}`);
}

export function createCotizacion(payload: QuoteCreatePayload) {
  return apiRequest<QuoteDraftDTO>(`${BASE}/cotizaciones`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmCotizacion(id: string) {
  return apiRequest<QuoteDraftDTO>(`${BASE}/cotizaciones/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
}

export function convertCotizacion(id: string) {
  return apiRequest<QuoteDraftDTO>(`${BASE}/cotizaciones/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "CONVERTED" }),
  });
}
