export type QuoteDraftListItem = {
  id: string;
  customer_name: string | null;
  delivery_date: string;
  delivery_time: string | null;
  status: string;
  vehicle_plate: string | null;
  conditions: string | null;
  notes: string | null;
  items_count: number;
  created_at: string;
  updated_at: string;
};

export type QuoteDraftItem = {
  id: string;
  product_id: string;
  product_name: string | null;
  quantity: number;
  unit_weight_kg: number | null;
};

export type QuoteItemPayload = {
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total?: number | null;
};

export type QuoteCreatePayload = {
  customer_id: string;
  valid_until?: string | null;
  items: QuoteItemPayload[];
  notes?: string | null;
};

export type QuoteDraftDTO = {
  id: string;
  customer: { id: string; name: string | null };
  customer_name: string | null;
  vehicle: { id: string | null; plate: string | null } | null;
  vehicle_plate: string | null;
  status: string;
  delivery_date: string;
  delivery_time: string | null;
  conditions: string | null;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  items: QuoteDraftItem[];
  quote_number: string;
  currency: string;
  valid_until: string | null;
  warehouse_name: string | null;
  seller_name: string | null;
};
