"""
CR-080: POS Loyalty & Wallet Management API
Five endpoints for loyalty settings, points history, bonus award,
wallet history, and wallet credit.
Auth: verify_pos_auth (X-API-Key).

Endpoints:
  GET  /api/pos/loyalty/settings                    L-1 read loyalty settings (POS subset)
  GET  /api/pos/customers/{id}/points-history       L-3 full points transaction log
  POST /api/pos/customers/{id}/points/award         L-2 award bonus points (cap 1,000 — Q2=b)
  GET  /api/pos/customers/{id}/wallet-history       L-5 wallet transaction log + balance
  POST /api/pos/customers/{id}/wallet/credit        L-4 credit wallet at POS counter

Design:
  create_points_transaction (points.py) and create_wallet_transaction (wallet.py)
  use get_current_user — cannot be called from verify_pos_auth context.
  Bonus / credit logic is inlined here (mirrors the earn/bonus and credit branches).
  wallet_enabled guard added in L-4 (absent from wallet.py helper).
  Bonus cap 1,000 pts enforced at POS layer only (Q2=b); CRM admin path uncapped.
"""

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from core.database import db
from core.auth import verify_pos_auth
from core.helpers import calculate_tier
from core.loyalty import default_loyalty_settings
from core.whatsapp import trigger_whatsapp_event, trigger_points_earned_event
from models.schemas import POSResponse

router = APIRouter(prefix="/pos", tags=["POS Loyalty"])

_BONUS_CAP = 1_000  # CR-080 Q2=b: max bonus points per POS award


# ─────────────────────────────────────────────────────────────────────────────
# L-1: GET /api/pos/loyalty/settings
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/loyalty/settings", response_model=POSResponse)
async def pos_loyalty_settings(user: dict = Depends(verify_pos_auth)):  # CR-080 L-1
    """
    Read loyalty settings for POS display (POS-relevant subset).
    Excludes: lifecycle thresholds, campaign daily limits, VIP auto-promote.
    """
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = default_loyalty_settings(user["id"])

    return POSResponse(
        success=True,
        message="Loyalty settings",
        data={
            "loyalty_enabled":       settings.get("loyalty_enabled", False),
            "wallet_enabled":        settings.get("wallet_enabled", False),
            "coupon_enabled":        settings.get("coupon_enabled", False),
            "bronze_earn_percent":   settings.get("bronze_earn_percent", 5.0),
            "silver_earn_percent":   settings.get("silver_earn_percent", 7.0),
            "gold_earn_percent":     settings.get("gold_earn_percent", 10.0),
            "platinum_earn_percent": settings.get("platinum_earn_percent", 15.0),
            "tier_silver_min":       settings.get("tier_silver_min", 500),
            "tier_gold_min":         settings.get("tier_gold_min", 1500),
            "tier_platinum_min":     settings.get("tier_platinum_min", 5000),
            "redemption_value":      settings.get("redemption_value", 1.0),
            "min_redemption_points": settings.get("min_redemption_points", 50),
            "off_peak_bonus_enabled": settings.get("off_peak_bonus_enabled", False),
            "off_peak_start_time":   settings.get("off_peak_start_time", "14:00"),
            "off_peak_end_time":     settings.get("off_peak_end_time", "17:00"),
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# L-3: GET /api/pos/customers/{customer_id}/points-history
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/points-history", response_model=POSResponse)
async def pos_points_history(  # CR-080 L-3
    customer_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(verify_pos_auth),
):
    """Full points transaction log for a customer, newest first."""
    customer = await db.customers.find_one(
        {"id": customer_id, "user_id": user["id"]},
        {"_id": 0, "name": 1, "total_points": 1},
    )
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    transactions = await db.points_transactions.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)

    # Normalise legacy rows that use 'type'/'reason' instead of 'transaction_type'/'description'
    for tx in transactions:
        tx["transaction_type"] = tx.get("transaction_type") or tx.get("type", "unknown")
        tx["description"]      = tx.get("description") or tx.get("reason", "")

    return POSResponse(
        success=True,
        message=f"{len(transactions)} transaction(s)",
        data={
            "customer_id":     customer_id,
            "customer_name":   customer.get("name", ""),
            "current_balance": int(customer.get("total_points", 0) or 0),
            "transactions":    transactions,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# L-2: POST /api/pos/customers/{customer_id}/points/award
# Inline bonus branch — create_points_transaction uses get_current_user.
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/customers/{customer_id}/points/award", response_model=POSResponse)
async def pos_award_points(  # CR-080 L-2
    customer_id: str,
    payload: dict,
    user: dict = Depends(verify_pos_auth),
):
    """
    Manually award bonus points (service recovery, complimentary gift).
    Cap: 1,000 pts per transaction (Q2=b).
    Requires loyalty_enabled = true.
    Fires bonus_points + points_earned WhatsApp events (async).
    """
    points      = payload.get("points")
    description = payload.get("description", "Bonus points awarded at POS")

    # Validation
    if not isinstance(points, int) or points <= 0:
        return POSResponse(success=False, message="points must be a positive integer", data=None)
    if points > _BONUS_CAP:
        return POSResponse(
            success=False,
            message=f"Exceeds maximum award of {_BONUS_CAP:,} points per transaction",
            data=None,
        )

    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = default_loyalty_settings(user["id"])

    if not settings.get("loyalty_enabled", False):
        return POSResponse(success=False, message="Loyalty program is not enabled for this restaurant", data=None)

    # ── Inline bonus branch (mirrors points.py earn/bonus branch) ─────────────
    now            = datetime.now(timezone.utc).isoformat()
    old_tier       = customer.get("tier", "Bronze")
    current_points = int(customer.get("total_points", 0) or 0)
    new_balance    = current_points + points
    new_tier       = calculate_tier(new_balance, settings)

    await db.customers.update_one(
        {"id": customer_id},
        {
            "$set": {"total_points": new_balance, "tier": new_tier},
            "$inc": {"total_points_earned": points},
        },
    )

    tx_id  = str(uuid.uuid4())
    tx_doc = {
        "id":               tx_id,
        "user_id":          user["id"],
        "customer_id":      customer_id,
        "points":           points,
        "transaction_type": "bonus",
        "description":      description,
        "bill_amount":      None,
        "balance_after":    new_balance,
        "created_at":       now,
    }
    await db.points_transactions.insert_one(tx_doc)
    # ─────────────────────────────────────────────────────────────────────────

    updated_customer = {**customer, "total_points": new_balance, "tier": new_tier}

    asyncio.create_task(trigger_whatsapp_event(
        db, user["id"], "bonus_points", updated_customer,
        {
            "bonus_points":    points,
            "points_balance":  new_balance,
            "description":     description,
            "idempotency_key": f"{tx_id}_bonus_points",
            "reference_type":  "points_tx",
            "reference_id":    tx_id,
        },
    ))
    asyncio.create_task(trigger_points_earned_event(
        db, user["id"], updated_customer, points, "bonus", new_balance,
        extra={
            "idempotency_key": f"{tx_id}_points_earned",
            "reference_type":  "points_tx",
            "reference_id":    tx_id,
        },
    ))

    return POSResponse(
        success=True,
        message=f"{points} bonus points awarded",
        data={
            "transaction_id": tx_id,
            "customer_id":    customer_id,
            "points_awarded": points,
            "new_balance":    new_balance,
            "new_tier":       new_tier,
            "tier_changed":   new_tier != old_tier,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# L-5: GET /api/pos/customers/{customer_id}/wallet-history
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/wallet-history", response_model=POSResponse)
async def pos_wallet_history(  # CR-080 L-5
    customer_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    user: dict = Depends(verify_pos_auth),
):
    """Wallet transaction log + current balance for a customer."""
    customer = await db.customers.find_one(
        {"id": customer_id, "user_id": user["id"]},
        {"_id": 0, "name": 1, "wallet_balance": 1},
    )
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    transactions = await db.wallet_transactions.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)

    return POSResponse(
        success=True,
        message=f"{len(transactions)} transaction(s)",
        data={
            "customer_id":     customer_id,
            "customer_name":   customer.get("name", ""),
            "current_balance": round(float(customer.get("wallet_balance", 0) or 0), 2),
            "transactions":    transactions,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# L-4: POST /api/pos/customers/{customer_id}/wallet/credit
# Inline credit branch — create_wallet_transaction uses get_current_user.
# Also adds wallet_enabled guard (absent from wallet.py helper).
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/customers/{customer_id}/wallet/credit", response_model=POSResponse)
async def pos_wallet_credit(  # CR-080 L-4
    customer_id: str,
    payload: dict,
    user: dict = Depends(verify_pos_auth),
):
    """
    Credit customer wallet at POS counter (cash top-up, gift load).
    Requires wallet_enabled = true and payment_method (Q3=a).
    Fires wallet_credit WhatsApp event (async).
    """
    amount         = payload.get("amount")
    description    = payload.get("description", "Wallet top-up at POS")
    payment_method = (payload.get("payment_method") or "").strip()

    # Validation
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return POSResponse(success=False, message="amount must be a positive number", data=None)
    if amount <= 0:
        return POSResponse(success=False, message="amount must be positive", data=None)
    if not payment_method:
        return POSResponse(
            success=False, message="payment_method is required (cash / card / upi)", data=None
        )

    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    # wallet_enabled guard (absent from wallet.py helper — added here) CR-080
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    if not settings.get("wallet_enabled", False):
        return POSResponse(success=False, message="Wallet feature is not enabled for this restaurant", data=None)

    # ── Inline credit branch (mirrors wallet.py credit path) ──────────────────
    now             = datetime.now(timezone.utc).isoformat()
    current_balance = round(float(customer.get("wallet_balance", 0) or 0), 2)
    new_balance     = round(current_balance + amount, 2)

    await db.customers.update_one({"id": customer_id}, {"$set": {"wallet_balance": new_balance}})

    tx_id  = str(uuid.uuid4())
    tx_doc = {
        "id":               tx_id,
        "user_id":          user["id"],
        "customer_id":      customer_id,
        "amount":           amount,
        "transaction_type": "credit",
        "description":      description,
        "payment_method":   payment_method,
        "balance_after":    new_balance,
        "created_at":       now,
    }
    await db.wallet_transactions.insert_one(tx_doc)
    # ─────────────────────────────────────────────────────────────────────────

    updated_customer = {**customer, "wallet_balance": new_balance}

    asyncio.create_task(trigger_whatsapp_event(
        db, user["id"], "wallet_credit", updated_customer,
        {
            "amount":          amount,
            "wallet_balance":  new_balance,
            "payment_method":  payment_method,
            "transaction_id":  tx_id,
            "description":     description,
            "idempotency_key": f"{tx_id}_wallet_credit",
            "reference_type":  "wallet_tx",
            "reference_id":    tx_id,
        },
    ))

    return POSResponse(
        success=True,
        message=f"Wallet credited \u20b9{amount}",
        data={
            "transaction_id":  tx_id,
            "customer_id":     customer_id,
            "amount_credited": amount,
            "new_balance":     new_balance,
            "payment_method":  payment_method,
        },
    )
