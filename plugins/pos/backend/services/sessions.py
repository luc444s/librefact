from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from plugins.pos.backend.common import PosActionContext, audit_pos_action, emit_pos_event
from plugins.pos.backend.models import PosCashSession, PosPayment
from plugins.ventas.backend.models import SalesOrder

OPEN = "OPEN"
CLOSED = "CLOSED"
CASH_METHOD = "EFECTIVO"


def _new_uuid() -> str:
    return str(uuid4())


def _utc_now() -> datetime:
    return datetime.now(UTC)


def get_session(db: Session, *, tenant_id: str, session_id: str) -> PosCashSession | None:
    return db.scalar(
        select(PosCashSession).where(
            PosCashSession.id == session_id,
            PosCashSession.tenant_id == tenant_id,
        )
    )


def get_open_session(
    db: Session, *, tenant_id: str, warehouse_id: str
) -> PosCashSession | None:
    return db.scalar(
        select(PosCashSession).where(
            PosCashSession.tenant_id == tenant_id,
            PosCashSession.warehouse_id == warehouse_id,
            PosCashSession.status == OPEN,
        )
    )


def open_session(
    db: Session,
    *,
    tenant_id: str,
    warehouse_id: str,
    opening_amount: float,
    user_id: str,
    action_context: PosActionContext,
) -> PosCashSession:
    existing = get_open_session(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if existing is not None:
        raise ValueError("Ya existe una caja abierta para este almacén")

    session = PosCashSession(
        id=_new_uuid(),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status=OPEN,
        opening_amount=round(float(opening_amount), 2),
        opened_by=user_id,
        opened_at=_utc_now(),
    )
    db.add(session)
    db.flush()
    audit_pos_action(
        db,
        context=action_context,
        action="session.open",
        entity_type="pos_cash_session",
        entity_id=session.id,
        details={"warehouse_id": warehouse_id, "opening_amount": float(session.opening_amount)},
    )
    emit_pos_event(
        db,
        context=action_context,
        event_name="pos.session.opened",
        entity_type="pos_cash_session",
        entity_id=session.id,
        payload={
            "session_id": session.id,
            "warehouse_id": warehouse_id,
            "opening_amount": float(session.opening_amount),
        },
    )
    return session


def cash_total(db: Session, *, tenant_id: str, session_id: str) -> float:
    total = db.scalar(
        select(func.coalesce(func.sum(PosPayment.amount), 0)).where(
            PosPayment.tenant_id == tenant_id,
            PosPayment.session_id == session_id,
            PosPayment.method == CASH_METHOD,
        )
    )
    return round(float(total or 0), 2)


def expected_cash_amount(db: Session, *, session: PosCashSession) -> float:
    return round(
        float(session.opening_amount) + cash_total(db, tenant_id=session.tenant_id, session_id=session.id),
        2,
    )


def close_session(
    db: Session,
    *,
    session: PosCashSession,
    counted_amount: float,
    user_id: str,
    notes: str | None,
    action_context: PosActionContext,
) -> PosCashSession:
    if session.status != OPEN:
        raise ValueError("La caja ya está cerrada")

    expected = expected_cash_amount(db, session=session)
    counted = round(float(counted_amount), 2)
    session.status = CLOSED
    session.counted_amount = counted
    session.expected_cash_amount = expected
    session.difference = round(counted - expected, 2)
    if notes is not None:
        session.notes = notes
    session.closed_by = user_id
    session.closed_at = _utc_now()
    db.add(session)
    db.flush()
    audit_pos_action(
        db,
        context=action_context,
        action="session.close",
        entity_type="pos_cash_session",
        entity_id=session.id,
        details={
            "counted_amount": counted,
            "expected_cash_amount": expected,
            "difference": float(session.difference),
        },
    )
    emit_pos_event(
        db,
        context=action_context,
        event_name="pos.session.closed",
        entity_type="pos_cash_session",
        entity_id=session.id,
        payload={
            "session_id": session.id,
            "counted_amount": counted,
            "expected_cash_amount": expected,
            "difference": float(session.difference),
        },
    )
    return session


def build_summary(db: Session, *, session: PosCashSession) -> dict:
    totals_rows = db.execute(
        select(
            PosPayment.method,
            func.coalesce(func.sum(PosPayment.amount), 0),
            func.count(PosPayment.id),
        )
        .where(PosPayment.tenant_id == session.tenant_id, PosPayment.session_id == session.id)
        .group_by(PosPayment.method)
        .order_by(PosPayment.method.asc())
    ).all()
    payment_totals = [
        {"method": row[0], "total": round(float(row[1] or 0), 2), "count": int(row[2] or 0)}
        for row in totals_rows
    ]
    payments = list(
        db.scalars(
            select(PosPayment)
            .where(PosPayment.tenant_id == session.tenant_id, PosPayment.session_id == session.id)
            .order_by(PosPayment.created_at.asc())
        ).all()
    )
    sales_count = len(payments)
    total_sold = round(sum(float(payment.amount) for payment in payments), 2)
    expected = expected_cash_amount(db, session=session)

    sales_rows = db.execute(
        select(PosPayment, SalesOrder.document_full_number)
        .outerjoin(SalesOrder, SalesOrder.id == PosPayment.order_id)
        .where(PosPayment.tenant_id == session.tenant_id, PosPayment.session_id == session.id)
        .order_by(PosPayment.created_at.desc())
        .limit(10)
    ).all()
    recent_sales = [
        {
            "order_id": payment.order_id,
            "document_full_number": document_full_number,
            "method": payment.method,
            "total": round(float(payment.amount), 2),
            "created_at": payment.created_at,
        }
        for payment, document_full_number in sales_rows
    ]

    return {
        "session": session,
        "sales_count": sales_count,
        "total_sold": total_sold,
        "payment_totals": payment_totals,
        "expected_cash_amount": expected,
        "difference": float(session.difference) if session.difference is not None else None,
        "recent_sales": recent_sales,
    }
