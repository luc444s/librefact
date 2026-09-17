from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DocumentType = Literal["FACTURA", "BOLETA"]


def _validate_series(document_type: str, series: str) -> str:
    value = series.strip().upper()
    prefix = "F" if document_type == "FACTURA" else "B"
    if len(value) != 4 or not value.startswith(prefix) or not value[1:].isdigit():
        raise ValueError(f"{document_type} series must match {prefix}###")
    return value


class DocumentSeriesCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_type: DocumentType
    series: str = Field(min_length=1, max_length=10)
    initial_number: int = Field(ge=1)
    branch_id: str | None = None
    is_default: bool = False
    is_active: bool = True

    @field_validator("series")
    @classmethod
    def normalize_series(cls, value: str) -> str:
        return value.strip().upper()

    def validated_series(self) -> str:
        return _validate_series(self.document_type, self.series)


class DocumentSeriesUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    branch_id: str | None = None
    is_default: bool | None = None
    is_active: bool | None = None


class DocumentSeriesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    branch_id: str | None
    document_type: str
    series: str
    initial_number: int
    next_number: int
    is_default: bool
    is_active: bool
    created_by: str
    created_at: datetime
    updated_at: datetime
