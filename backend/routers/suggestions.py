"""
POS-CRM Order Suggestions Router
CR: POS-CRM Customer Cross-Sell / Order Suggestions API
Sprint: ROI Measurement for CRM

Endpoint: POST /api/pos/customers/order-suggestions
Auth: verify_pos_auth (same X-API-Key as all /api/pos/* endpoints)

Phase 1 v1.1 changes (POS feedback):
  P-01: Added meta.request_id (UUID)
  Q-04: item_notes_by_id map for all cart items in one call
  P-04: cross_sell_items[].title → name (in customer_intelligence.py)
  P-03: currency field (in customer_intelligence.py)
  Q-02: available_coupons_count per-customer (in customer_intelligence.py)
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid as _uuid

from core.database import db
from core.auth import verify_pos_auth
from models.schemas import POSResponse
from core.customer_intelligence import (
    compute_customer_summary,
    compute_customer_value,
    compute_order_patterns,
    compute_customer_notes,
    compute_item_notes,
    compute_item_notes_batch,
    compute_cross_sell,
)

router = APIRouter(prefix="/pos", tags=["POS Order Suggestions"])


# --- Request schemas (co-located, no cross-file dependency) ---

class CartItem(BaseModel):
    item_id: str
    qty: int = 1
    unit_price: float = 0.0


class SelectedItem(BaseModel):
    item_id: str


class OrderSuggestionsRequest(BaseModel):
    restaurant_id: Optional[str] = None
    crm_customer_id: Optional[str] = None
    pos_customer_id: Optional[str] = None
    current_cart: Optional[List[CartItem]] = None
    selected_item: Optional[SelectedItem] = None
    order_type: Optional[str] = None


# --- Endpoint ---

@router.post("/customers/order-suggestions", response_model=POSResponse)
async def order_suggestions(
    req: OrderSuggestionsRequest,
    user: dict = Depends(verify_pos_auth),
):
    """
    Returns everything a POS cashier needs to personalise an order for a CRM customer:
    customer summary, value scoring, order patterns, notes, and cross-sell suggestions.

    Advisory only — POS shows it, cashier picks, nothing is auto-applied.
    """
    user_id = user["id"]

    # Validate: at least one customer identifier required
    if not req.crm_customer_id and not req.pos_customer_id:
        return POSResponse(
            success=False,
            message="Either crm_customer_id or pos_customer_id is required",
            data={"error": {"code": "INVALID_REQUEST",
                            "detail": "Provide crm_customer_id or pos_customer_id"}},
        )

    # Resolve customer
    customer = None
    if req.crm_customer_id:
        customer = await db.customers.find_one(
            {"id": req.crm_customer_id, "user_id": user_id}, {"_id": 0})
    if not customer and req.pos_customer_id:
        customer = await db.customers.find_one(
            {"pos_customer_id": req.pos_customer_id, "user_id": user_id}, {"_id": 0})

    if not customer:
        return POSResponse(
            success=False,
            message="Customer not found",
            data={"error": {"code": "CUSTOMER_NOT_FOUND",
                            "detail": "No customer matches the provided ID under this restaurant"}},
        )

    customer_id = customer["id"]
    cart_item_ids = [c.item_id for c in (req.current_cart or [])]
    selected_item_id = req.selected_item.item_id if req.selected_item else None

    # Compute all blocks — parallelize independent computations
    import asyncio as _aio

    is_first_time = (customer.get("total_visits", 0) or 0) <= 1
    request_id = str(_uuid.uuid4())

    # Run independent computations in parallel
    tasks = [
        compute_customer_summary(db, user_id, customer_id, customer),
        compute_order_patterns(db, user_id, customer_id),
        compute_customer_notes(db, user_id, customer_id, limit=5),
        compute_cross_sell(db, user_id, customer_id, cart_item_ids, limit=3),
        compute_item_notes_batch(db, user_id, customer_id, cart_item_ids),
    ]
    if selected_item_id:
        tasks.append(compute_item_notes(db, user_id, customer_id, selected_item_id))
    if not is_first_time:
        tasks.append(compute_customer_value(db, user_id, customer_id, customer))

    results = await _aio.gather(*tasks)

    summary = results[0]
    patterns = results[1]
    notes = results[2]
    cross_sell = results[3]
    item_notes_by_id = results[4]

    idx = 5
    item_notes_list = []
    if selected_item_id:
        item_notes_list = results[idx]
        idx += 1
    value = None
    if not is_first_time:
        value = results[idx]

    # Assemble response
    data = {
        "customer_summary": summary,
        "order_patterns": patterns,
        "customer_notes": notes,
        "item_notes": item_notes_list,
        "item_notes_by_id": item_notes_by_id,
        "cross_sell_items": cross_sell,
        "meta": {
            "request_id": request_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "feature_flags": {"cross_sell": True, "upsell": False, "ai": False},
        },
    }
    if value is not None:
        data["customer_value"] = value

    return POSResponse(success=True, message="Order suggestions", data=data)
