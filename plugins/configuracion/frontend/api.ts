import { apiRequest } from "@systutor/shell/api/client";

import type { DocumentSeries, DocumentSeriesCreatePayload, DocumentSeriesUpdatePayload } from "./types";

const CONFIGURACION_BASE = "/api/v1/plugins/configuracion";

export const configuracionKeys = {
  documentSeries: ["configuracion", "document-series"] as const,
};

export async function listDocumentSeries(): Promise<DocumentSeries[]> {
  return apiRequest(`${CONFIGURACION_BASE}/billing/document-series`);
}

export async function createDocumentSeries(payload: DocumentSeriesCreatePayload): Promise<DocumentSeries> {
  return apiRequest(`${CONFIGURACION_BASE}/billing/document-series`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDocumentSeries(
  seriesId: string,
  payload: DocumentSeriesUpdatePayload,
): Promise<DocumentSeries> {
  return apiRequest(`${CONFIGURACION_BASE}/billing/document-series/${seriesId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
