from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PaymentMethod = Literal["EFECTIVO", "YAPE_PLIN", "TARJETA"]


class OpenSessionRequest(BaseModel):
    warehouse_id: str | None = None
    opening_amount: float = Field(default=0, ge=0)


class CloseSessionRequest(BaseModel):
    counted_amount: float = Field(ge=0)
    notes: str | None = Field(default=None, max_length=500)


class PosCashSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    warehouse_id: str
    status: str
    opening_amount: float
    counted_amount: float | None
    expected_cash_amount: float | None
    difference: float | None
    notes: str | None
    opened_by: str
    closed_by: str | None
    opened_at: datetime
    closed_at: datetime | None


class PosPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    order_id: str
    method: str
    amount: float
    received_amount: float | None
    change_amount: float | None
    created_by: str
    created_at: datetime


class CheckoutItemRequest(BaseModel):
    product_id: str
    quantity: float = Field(gt=0)


class CheckoutRequest(BaseModel):
    items: list[CheckoutItemRequest] = Field(min_length=1)
    method: PaymentMethod = "EFECTIVO"
    received_amount: float | None = Field(default=None, ge=0)
    session_id: str | None = None
    notes: str | None = Field(default=None, max_length=500)


class PosSaleItemRead(BaseModel):
    product_id: str
    quantity: float
    unit_price: float
    line_total: float


class PosSaleRead(BaseModel):
    order_id: str
    document_type: str
    document_full_number: str | None
    status: str
    total: float
    items: list[PosSaleItemRead]
    created_at: datetime


class CheckoutResponse(BaseModel):
    sale: PosSaleRead
    payment: PosPaymentRead


class SummaryPaymentTotal(BaseModel):
    method: str
    total: float
    count: int


class SummarySaleRow(BaseModel):
    order_id: str
    document_full_number: str | None
    method: str
    total: float
    created_at: datetime


class SessionSummaryRead(BaseModel):
    session: PosCashSessionRead
    sales_count: int
    total_sold: float
    payment_totals: list[SummaryPaymentTotal]
    expected_cash_amount: float
    difference: float | None
    recent_sales: list[SummarySaleRow]


class QuickProductRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sale_price: float = Field(ge=0)
    barcode: str | None = Field(default=None, max_length=150)
    barcode_type: str = Field(default="EAN13", min_length=1, max_length=20)
    sku: str | None = Field(default=None, min_length=1, max_length=30)
    initial_stock: float = Field(default=0, ge=0)
    unit_cost: float = Field(default=0, ge=0)
    weight_kg: float | None = Field(default=None, ge=0)
    description: str | None = None
    line_id: str | None = None
    unit_id: str | None = None


class QuickProductRead(BaseModel):
    id: str
    sku: str
    name: str
    sale_price: float
    barcode: str | None
    initial_stock: float


class PosProductSearchItem(BaseModel):
    id: str
    sku: str
    name: str
    price: float | None = None
    weight_kg: float | None = None


class SetProductPriceRequest(BaseModel):
    amount: float = Field(gt=0)


class SetProductPriceResponse(BaseModel):
    product_id: str
    price: float
