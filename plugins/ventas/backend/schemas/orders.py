from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class SalesOrderItemCreateRequest(BaseModel):
    product_id: str
    quantity: float = Field(gt=0)
    unit_price: float = Field(gt=0)
    line_total: float | None = Field(default=None, gt=0)


class SalesOrderCreateRequest(BaseModel):
    customer_id: str
    customer_name: str | None = None
    expected_date: date | None = None
    notes: str | None = None
    items: list[SalesOrderItemCreateRequest] = Field(min_length=1)


class SalesOrderUpdateRequest(BaseModel):
    customer_id: str | None = None
    customer_name: str | None = None
    expected_date: date | None = None
    notes: str | None = None
    items: list[SalesOrderItemCreateRequest] | None = None


class SalesOrderCustomerRead(BaseModel):
    id: str
    name: str | None


class SalesOrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    quantity: float
    unit_price: float
    line_total: float
    dispatched_qty: float


class SalesOrderEventRead(BaseModel):
    id: str
    from_status: str | None
    to_status: str
    reason: str | None
    user_id: str | None
    created_at: datetime


class SalesOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    customer: SalesOrderCustomerRead | None
    customer_name: str | None
    status: str
    order_date: date
    expected_date: date | None
    notes: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime


class SalesOrderDetailRead(SalesOrderRead):
    items: list[SalesOrderItemRead]
    events: list[SalesOrderEventRead] = []


class SalesOrderPageRead(BaseModel):
    items: list[SalesOrderRead]
    total: int
    limit: int
    offset: int


class CancelOrderRequest(BaseModel):
    reason: str | None = None


class DispatchOrderRequest(BaseModel):
    reason: str | None = None


class CloseOrderRequest(BaseModel):
    reason: str = Field(min_length=1)
