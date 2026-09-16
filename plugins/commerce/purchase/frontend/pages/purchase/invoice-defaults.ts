import type { PurchaseOrderDetail } from "../../types";

export function buildInvoiceDraftLines(items: PurchaseOrderDetail["items"]) {
  return items.map((item) => ({
    order_item_id: item.id,
    qty: Math.max(0, Number(item.received_qty.toFixed(2))),
    unit_price: item.unit_cost,
  }));
}
