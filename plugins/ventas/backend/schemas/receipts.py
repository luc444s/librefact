from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class SalesReceiptItemCreateRequest(BaseModel):
    cylinder_id: str
    incoming_qty: float = Field(default=1, gt=0)
    notes: str | None = None


class SalesReceiptCostLineRequest(BaseModel):
    cost_type: str
    amount: float = Field(ge=0)
    currency: str = "PEN"
    notes: str | None = None


class SalesReceiptCreateRequest(BaseModel):
    customer_id: str
    warehouse_id: str
    receipt_date: date | None = None
    notes: str | None = None
    dispatch_id: str
    tank_id: str | None = None
    cost_lines: list[SalesReceiptCostLineRequest] | None = None
    cylinders: list[SalesReceiptItemCreateRequest] = Field(min_length=1)


class SalesReceiptCustomerRead(BaseModel):
    id: str
    name: str | None


class SalesReceiptItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    cylinder_id: str
    serial: str | None = None
    product_id: str | None = None
    incoming_qty: float
    status: str
    notes: str | None = None
    confirmed_at: datetime | None = None


class SalesReceiptCostLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    cost_type: str
    amount: float
    currency: str
    notes: str | None = None


class SalesReceiptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    customer: SalesReceiptCustomerRead | None = None
    customer_name: str | None = None
    warehouse_id: str | None = None
    dispatch_id: str | None = None
    tank_id: str | None = None
    status: str
    receipt_date: date
    notes: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    items: list[SalesReceiptItemRead] = Field(default_factory=list)
    cost_lines: list[SalesReceiptCostLineRead] = Field(default_factory=list)


class SalesReceiptPageRead(BaseModel):
    items: list[SalesReceiptRead]
    total: int
    limit: int
    offset: int
