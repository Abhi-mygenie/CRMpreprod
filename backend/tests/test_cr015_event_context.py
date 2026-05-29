"""
CR-015 T3 — Unit tests for build_order_event_context()
Spec: /app/memory/crm/crm_roi_sprint/planning/CR_015_DAY_2_FROZEN_SPEC.md §4.1
"""
import sys
import os
import pytest

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.whatsapp import build_order_event_context
from routers.pos import POSOrderWebhook, OrderItem


def _make_order(**overrides):
    """Build a minimal valid POSOrderWebhook with optional overrides."""
    base = {
        "restaurant_id": "689",
        "order_id": "ORD-001",
        "cust_mobile": "7505242126",
        "order_amount": 1850.0,
    }
    base.update(overrides)
    return POSOrderWebhook(**base)


def _make_customer():
    return {
        "id": "cust_abc",
        "name": "abhishek jain",
        "phone": "7505242126",
        "total_points": 500,
        "tier": "Silver",
        "wallet_balance": 200.0,
    }


# ── Test 1: minimal required only ──

def test_build_minimal_required_only():
    """With only required POSOrderWebhook fields, ctx has order_id/pos_order_id/order_amount + the 4 outcome fields. No None values."""
    order = _make_order()
    customer = _make_customer()

    ctx = build_order_event_context(
        order, customer,
        points_earned=50,
        new_points=550,
        wallet_used=0.0,
        new_wallet_balance=200.0,
    )

    # Core keys present
    assert ctx["order_id"] == "ORD-001"
    assert ctx["pos_order_id"] == "ORD-001"
    assert ctx["order_amount"] == 1850.0
    assert ctx["points_earned"] == 50
    assert ctx["points_balance"] == 550
    assert ctx["wallet_balance"] == 200.0

    # No None values in output
    for k, v in ctx.items():
        assert v is not None, f"Key {k} should not be None"
        assert v != "", f"Key {k} should not be empty string"


# ── Test 2: full payload populates 25+ keys ──

def test_build_full_payload_populates_25_keys():
    """With all 26 source fields filled, ctx has >= 25 keys."""
    order = _make_order(
        restaurant_order_id="KM-1234",
        order_sub_total_amount=1600.0,
        order_discount=50.0,
        self_discount=10.0,
        tax_amount=200.0,
        gst_tax=200.0,
        vat_tax=0.0,
        service_tax=0.0,
        tip_amount=50.0,
        delivery_charge=0.0,
        round_up=0.0,
        payment_method="UPI",
        payment_status="paid",
        payment_type="prepaid",
        transaction_id="TXN-999",
        order_status="completed",
        order_type="dine_in",
        table_id="T5",
        employee_name="Raju",
        order_created_at="2026-05-29T14:30:00+05:30",
        order_notes="Extra spicy",
        coupon_code="WELCOME10",
        coupon_discount=100.0,
        coupon_title="Welcome 10%",
        coupon_type="percentage",
        items=[
            OrderItem(item_name="Kunafa", item_qty=2, item_price=500.0),
            OrderItem(item_name="Chai", item_qty=1, item_price=100.0),
        ],
    )
    customer = _make_customer()

    ctx = build_order_event_context(
        order, customer,
        points_earned=90,
        new_points=590,
        wallet_used=50.0,
        new_wallet_balance=150.0,
        crm_loyalty_points_redeemed=10,
        crm_loyalty_discount=20.0,
    )

    assert len(ctx) >= 25, f"Expected >= 25 keys, got {len(ctx)}: {sorted(ctx.keys())}"
    # Spot-check a few values
    assert ctx["restaurant_order_id"] == "KM-1234"
    assert ctx["payment_method"] == "UPI"
    assert ctx["order_type"] == "dine_in"
    assert ctx["table_id"] == "T5"
    assert ctx["waiter_name"] == "Raju"
    assert ctx["order_date"] == "2026-05-29T14:30:00+05:30"
    assert ctx["order_time"] == "2026-05-29T14:30:00+05:30"
    assert ctx["order_notes"] == "Extra spicy"
    assert ctx["item_count"] == 2
    assert ctx["coupon_code"] == "WELCOME10"
    assert ctx["coupon_discount"] == 100.0
    assert ctx["loyalty_points_used"] == 10
    assert ctx["loyalty_discount"] == 20.0


# ── Test 3: None stripping ──

def test_none_stripping():
    """Optional fields not set -> not in returned dict."""
    order = _make_order()  # payment_method, table_id, etc. are None by default
    customer = _make_customer()

    ctx = build_order_event_context(
        order, customer,
        points_earned=0,
        new_points=500,
        wallet_used=0.0,
        new_wallet_balance=200.0,
    )

    # None fields should NOT be in the dict
    assert "payment_method" not in ctx
    assert "table_id" not in ctx
    assert "transaction_id" not in ctx
    assert "employee_name" not in ctx
    assert "waiter_name" not in ctx
    assert "order_created_at" not in ctx
    assert "order_notes" not in ctx
    assert "coupon_code" not in ctx


# ── Test 4: empty string stripped ──

def test_empty_string_stripped():
    """Explicit empty-string fields not in returned dict."""
    order = _make_order(
        payment_method="",
        table_id="",
        order_notes="",
    )
    customer = _make_customer()

    ctx = build_order_event_context(
        order, customer,
        points_earned=10,
        new_points=510,
        wallet_used=0.0,
        new_wallet_balance=200.0,
    )

    assert "payment_method" not in ctx
    assert "table_id" not in ctx
    assert "order_notes" not in ctx


# ── Test 5: zero values preserved ──

def test_zero_values_preserved():
    """order_amount=0 and wallet_used=0 remain in dict (valid currency 0)."""
    order = _make_order(order_amount=0.0)
    customer = _make_customer()

    ctx = build_order_event_context(
        order, customer,
        points_earned=0,
        new_points=500,
        wallet_used=0.0,
        new_wallet_balance=200.0,
    )

    # Zero is valid — should be in the dict
    assert "order_amount" in ctx
    assert ctx["order_amount"] == 0.0
    assert "points_earned" in ctx
    assert ctx["points_earned"] == 0
    assert "points_balance" in ctx
    assert ctx["points_balance"] == 500


# ── Test 6: item_count derived ──

def test_item_count_derived():
    """items=[OrderItem x 3] -> ctx['item_count']==3; items=None -> ctx['item_count']==0."""
    # With items
    order_with_items = _make_order(
        items=[
            OrderItem(item_name="A", item_qty=1, item_price=100.0),
            OrderItem(item_name="B", item_qty=2, item_price=200.0),
            OrderItem(item_name="C", item_qty=1, item_price=50.0),
        ]
    )
    customer = _make_customer()

    ctx = build_order_event_context(
        order_with_items, customer,
        points_earned=10, new_points=510,
        wallet_used=0.0, new_wallet_balance=200.0,
    )
    assert ctx["item_count"] == 3

    # Without items (None)
    order_no_items = _make_order(items=None)
    ctx2 = build_order_event_context(
        order_no_items, customer,
        points_earned=10, new_points=510,
        wallet_used=0.0, new_wallet_balance=200.0,
    )
    assert ctx2["item_count"] == 0


# ── Test 7: coupon fields from POS payload ──

def test_coupon_fields_from_pos_payload():
    """When order_data.coupon_code is set, coupon_* flow through."""
    order = _make_order(
        coupon_code="SAVE20",
        coupon_discount=200.0,
        coupon_title="Save 20%",
        coupon_type="percentage",
    )
    customer = _make_customer()

    ctx = build_order_event_context(
        order, customer,
        points_earned=10, new_points=510,
        wallet_used=0.0, new_wallet_balance=200.0,
    )

    assert ctx["coupon_code"] == "SAVE20"
    assert ctx["coupon_discount"] == 200.0
    assert ctx["coupon_title"] == "Save 20%"
    assert ctx["coupon_type"] == "percentage"


# ── Test 8: extra overrides take precedence ──

def test_extra_overrides_take_precedence():
    """extra={'order_amount': 99999} -> ctx['order_amount']==99999."""
    order = _make_order(order_amount=1850.0)
    customer = _make_customer()

    ctx = build_order_event_context(
        order, customer,
        points_earned=10, new_points=510,
        wallet_used=0.0, new_wallet_balance=200.0,
        extra={"order_amount": 99999, "custom_field": "hello"},
    )

    assert ctx["order_amount"] == 99999
    assert ctx["custom_field"] == "hello"


# ── Test 9: restaurant_order_id fallback ──

def test_restaurant_order_id_fallback():
    """When order_data.restaurant_order_id is None, falls back to order_id."""
    order = _make_order(restaurant_order_id=None)
    customer = _make_customer()

    ctx = build_order_event_context(
        order, customer,
        points_earned=10, new_points=510,
        wallet_used=0.0, new_wallet_balance=200.0,
    )

    assert ctx["restaurant_order_id"] == "ORD-001"  # falls back to order_id

    # With explicit restaurant_order_id
    order2 = _make_order(restaurant_order_id="KM-5678")
    ctx2 = build_order_event_context(
        order2, customer,
        points_earned=10, new_points=510,
        wallet_used=0.0, new_wallet_balance=200.0,
    )

    assert ctx2["restaurant_order_id"] == "KM-5678"


# ── Test 10: caller loyalty overrides POS-supplied ──

def test_caller_loyalty_overrides_pos_supplied():
    """Caller's crm_loyalty_discount=42 overrides order_data.loyalty_discount."""
    order = _make_order(
        loyalty_points_used=5,
        loyalty_discount=10.0,
    )
    customer = _make_customer()

    # CRM-calculated values take priority (truthy)
    ctx = build_order_event_context(
        order, customer,
        points_earned=10, new_points=510,
        wallet_used=0.0, new_wallet_balance=200.0,
        crm_loyalty_points_redeemed=42,
        crm_loyalty_discount=84.0,
    )

    assert ctx["loyalty_points_used"] == 42
    assert ctx["loyalty_discount"] == 84.0

    # When CRM values are 0, POS values should flow through
    ctx2 = build_order_event_context(
        order, customer,
        points_earned=10, new_points=510,
        wallet_used=0.0, new_wallet_balance=200.0,
        crm_loyalty_points_redeemed=0,
        crm_loyalty_discount=0.0,
    )

    assert ctx2["loyalty_points_used"] == 5
    assert ctx2["loyalty_discount"] == 10.0
