from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class SalesDispatchItemCreateRequest(BaseModel):
    cylinder_id: str
    outgoing_qty: float = Field(default=1, gt=0)
    notes: str | None = None


class SalesDispatchCostLineRequest(BaseModel):
    cost_type: str
    amount: float = Field(ge=0)
    currency: str = "PEN"
    notes: str | None = None


class SalesDispatchCreateRequest(BaseModel):
    customer_id: str
    warehouse_id: str | None = None
    tank_id: str | None = None
    dispatch_date: date | None = None
    notes: str | None = None
    cost_lines: list[SalesDispatchCostLineRequest] | None = None
    cylinders: list[SalesDispatchItemCreateRequest] = Field(min_length=1)


class SalesDispatchCustomerRead(BaseModel):
    id: str
    name: str | None


class SalesDispatchItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    cylinder_id: str
    serial: str | None = None
    product_id: str | None = None
    outgoing_qty: float
    status: str
    notes: str | None = None
    confirmed_at: datetime | None = None


class SalesDispatchCostLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    cost_type: str
    amount: float
    currency: str
    notes: str | None = None


class SalesDispatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    customer: SalesDispatchCustomerRead | None = None
    customer_name: str | None = None
    warehouse_id: str | None = None
    tank_id: str | None = None
    status: str
    dispatch_date: date
    notes: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    items: list[SalesDispatchItemRead] = Field(default_factory=list)
    cost_lines: list[SalesDispatchCostLineRead] = Field(default_factory=list)


class SalesDispatchPageRead(BaseModel):
    items: list[SalesDispatchRead]
    total: int
    limit: int
    offset: int
