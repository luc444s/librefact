function parseAmount(value: string | number) {
  if (typeof value === "number") return value;
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function inferOrderItemBatchCost(quantity: string | number, unitCost: string | number) {
  const parsedQuantity = parseAmount(quantity);
  const parsedUnitCost = parseAmount(unitCost);
  if (parsedQuantity === null || parsedUnitCost === null) return null;
  return Number((parsedQuantity * parsedUnitCost).toFixed(2));
}
