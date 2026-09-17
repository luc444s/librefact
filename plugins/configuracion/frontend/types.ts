export type DocumentType = "FACTURA" | "BOLETA";

export type DocumentSeries = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  document_type: DocumentType;
  series: string;
  initial_number: number;
  next_number: number;
  is_default: boolean;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type DocumentSeriesCreatePayload = {
  document_type: DocumentType;
  series: string;
  initial_number: number;
  branch_id: string | null;
  is_default: boolean;
  is_active: boolean;
};

export type DocumentSeriesUpdatePayload = {
  branch_id?: string | null;
  is_default?: boolean;
  is_active?: boolean;
};
