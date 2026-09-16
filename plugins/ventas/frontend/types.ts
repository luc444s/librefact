export type SalesOrderCustomer = {
  id: string;
  name: string | null;
};

export type SalesOrderItem = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  dispatched_qty: number;
};

export type SalesOrderEvent = {
  id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  user_id: string | null;
  created_at: string;
};

export type SalesOrder = {
  id: string;
  customer: SalesOrderCustomer | null;
  customer_name: string | null;
  status: string;
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type SalesOrderDetail = SalesOrder & {
  items: SalesOrderItem[];
  events: SalesOrderEvent[];
};

export type SalesOrderPage = {
  items: SalesOrder[];
  total: number;
  limit: number;
  offset: number;
};

export type SalesOrderItemPayload = {
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total?: number | null;
};

export type SalesOrderCreatePayload = {
  customer_id: string;
  customer_name?: string | null;
  expected_date?: string | null;
  notes?: string | null;
  items: SalesOrderItemPayload[];
};

export type SalesOrderUpdatePayload = Partial<SalesOrderCreatePayload>;

export type SalesDispatchCustomer = {
  id: string;
  name: string | null;
};

export type SalesDispatchItem = {
  id: string;
  cylinder_id: string;
  serial: string | null;
  product_id: string | null;
  outgoing_qty: number;
  status: string;
  notes: string | null;
  confirmed_at: string | null;
};

export type SalesDispatch = {
  id: string;
  customer: SalesDispatchCustomer | null;
  customer_name: string | null;
  status: string;
  dispatch_date: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  items: SalesDispatchItem[];
};

export type SalesDispatchPage = {
  items: SalesDispatch[];
  total: number;
  limit: number;
  offset: number;
};

export type SalesDispatchItemPayload = {
  cylinder_id: string;
  outgoing_qty?: number;
  notes?: string | null;
};

export type SalesDispatchCostLine = {
  cost_type: string;
  amount: number;
  currency: string;
  notes: string | null;
};

export type SalesDispatchCreatePayload = {
  customer_id: string;
  warehouse_id?: string | null;
  tank_id?: string | null;
  dispatch_date?: string | null;
  notes?: string | null;
  cost_lines?: SalesDispatchCostLine[] | null;
  cylinders: SalesDispatchItemPayload[];
};

export type SalesReceiptCustomer = {
  id: string;
  name: string | null;
};

export type SalesReceiptItem = {
  id: string;
  cylinder_id: string;
  serial: string | null;
  product_id: string | null;
  incoming_qty: number;
  status: string;
  notes: string | null;
  confirmed_at: string | null;
};

export type SalesReceipt = {
  id: string;
  customer: SalesReceiptCustomer | null;
  customer_name: string | null;
  status: string;
  receipt_date: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  items: SalesReceiptItem[];
};

export type SalesReceiptPage = {
  items: SalesReceipt[];
  total: number;
  limit: number;
  offset: number;
};

export type SalesReceiptItemPayload = {
  cylinder_id: string;
  incoming_qty?: number;
  notes?: string | null;
};

export type SalesReceiptCostLine = {
  cost_type: string;
  amount: number;
  notes: string | null;
};

export type SalesReceiptCreatePayload = {
  customer_id: string;
  receipt_date?: string | null;
  notes?: string | null;
  dispatch_id: string;
  warehouse_id: string;
  tank_id?: string | null;
  cost_lines?: SalesReceiptCostLine[] | null;
  cylinders: SalesReceiptItemPayload[];
};
