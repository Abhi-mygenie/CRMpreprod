"""Shared loyalty math helpers.

CR-001C-L Phase L1 (F1, 2026-05-22, forward-only):
  Single source of truth for loyalty point calculation and tier resolution.
  Hosts:
    • calculate_points(order_amount, customer, settings) — base earn +
      off-peak bonus.
    • calculate_tier(total_points, settings) — total_points → tier string.

  Parity contract: behavior MUST exactly match the previous inline
  `pos.py::_calculate_points` and `helpers.py::calculate_tier`
  implementations. A parity QA harness lives in
  `/tmp/cr_001c_l_l1_l2_parity_qa.py`.

  Used by:
    • routers/pos.py (realtime POS webhook) — Phase L1+L2.
    • core/helpers.py (re-export shim for `calculate_tier`) — Phase L1.

  Reserved for future phases (NOT yet wired here):
    • routers/migration.py order_sync — Phase L3.
    • routers/points.py manual redeem / core/loyalty_jobs.py crons — Phase L4.
"""
import uuid as _uuid
from core.helpers import check_off_peak_bonus, get_earn_percent_for_tier


def default_loyalty_settings(user_id: str) -> dict:
    """Single source of truth for new-restaurant loyalty defaults.

    CR-001C-L-FIX Phase 1 (2026-05-26): returns CR-004-compliant values
    sourced from the LoyaltySettings Pydantic model so schema and runtime
    cannot drift. Every code path that creates or falls back to loyalty
    settings MUST call this helper instead of hardcoding a dict.
    """
    from models.schemas import LoyaltySettings  # local import to avoid cycle
    base = LoyaltySettings(id=str(_uuid.uuid4()), user_id=user_id).model_dump()
    return base


def calculate_tier(total_points: int, settings: dict) -> str:
    """Map total_points → tier name. Pure function.

    Parity with prior `helpers.calculate_tier`. `helpers.calculate_tier`
    is retained as a re-export shim so existing callers do not change.
    """
    if total_points >= settings.get("tier_platinum_min", 5000):
        return "Platinum"
    if total_points >= settings.get("tier_gold_min", 1500):
        return "Gold"
    if total_points >= settings.get("tier_silver_min", 500):
        return "Silver"
    return "Bronze"


def calculate_points(order_amount: float, customer: dict, settings: dict) -> dict:
    """Calculate points earned for an order including off-peak bonus.

    Parity with prior `pos.py::_calculate_points`. Caller is responsible
    for honoring `settings.loyalty_enabled` (kill-switch); this helper
    computes math only.

    Returns dict with keys:
        base_points: int
        off_peak_bonus: int
        total_points: int
        description: str
        off_peak_message: Optional[str]
    """
    min_order = settings.get("min_order_value", 0)
    if order_amount < min_order:
        return {
            "base_points": 0,
            "off_peak_bonus": 0,
            "total_points": 0,
            "description": "",
        }

    tier = customer.get("tier", "Bronze")
    earn_percent = get_earn_percent_for_tier(tier, settings)
    base_points = int(order_amount * earn_percent / 100)

    # Off-peak bonus
    is_off_peak, bonus_value, bonus_type, off_peak_msg = check_off_peak_bonus(settings)
    off_peak_bonus = 0

    if is_off_peak and base_points > 0:
        if bonus_type == "multiplier":
            off_peak_bonus = int(base_points * (bonus_value - 1))
        else:
            off_peak_bonus = int(bonus_value)

    total = base_points + off_peak_bonus
    desc = f"Earned {earn_percent}% on order of Rs.{order_amount}"
    if off_peak_bonus > 0:
        desc += f" (+{off_peak_bonus} off-peak bonus)"

    return {
        "base_points": base_points,
        "off_peak_bonus": off_peak_bonus,
        "total_points": total,
        "description": desc,
        "off_peak_message": off_peak_msg if off_peak_bonus > 0 else None,
    }



def build_pos_loyalty_blob(customer: dict, settings: dict) -> dict:
    """CR-001C-LX Phase LX-A (2026-05-22): compose the POS-facing `loyalty` blob.

    Single source of truth for `GET /pos/customers/{id}`,
    `GET /pos/customers/{id}/loyalty`, and the `points_value` field in
    `POST /pos/customer-lookup`.

    Returns STRICTLY 6 keys per LX-A-#7 (replacement, not additive):
        tier, tier_label, total_points, ratio_per_point, points_value,
        loyalty_enabled.

    Pre-LX keys (points_monetary_value, redemption_value_per_point,
    next_tier, points_to_next_tier, wallet_balance, earn_rate_percent)
    are intentionally NOT returned.
    """
    # Local import to avoid circular dependency (core.helpers imports from
    # core.loyalty for the calculate_tier shim).
    from core.helpers import get_redemption_value_for_tier

    safe_settings = settings or {}
    tier = customer.get("tier", "Bronze")
    total_points = customer.get("total_points", 0)
    ratio_per_point = get_redemption_value_for_tier(tier, safe_settings)
    points_value = round(total_points * ratio_per_point, 2)
    loyalty_enabled = bool(safe_settings.get("loyalty_enabled", False))

    return {
        "tier": tier,
        "tier_label": f"{tier} Member",
        "total_points": total_points,
        "ratio_per_point": ratio_per_point,
        "points_value": points_value,
        "loyalty_enabled": loyalty_enabled,
    }


# ============================================================================
# CR-001C-LR Correction (2026-05-23): shared loyalty redemption helpers.
#
# These two functions are the single source of truth for the calculator side
# (compute_max_redeemable) and the commit side (redeem_loyalty_points) of
# loyalty redemption. They are called by:
#
#   • routers/pos.py::pos_max_redeemable          (calculator)
#   • routers/pos.py::pos_loyalty_redeem          (standalone commit — testing)
#   • routers/pos.py::pos_order_webhook           (commit at final order payload)
#   • routers/pos.py::pos_payment_received        (legacy commit path)
#
# This eliminates the class of bug where the cap shown to the cashier
# diverges from the points actually deducted at commit.
# ============================================================================


def compute_max_redeemable(customer: dict, settings: dict | None, bill_amount: float) -> dict:
    """Compute the maximum loyalty points a customer may redeem on a bill.

    Pure (no DB writes). Tier-aware. Honors loyalty_enabled and
    `min_redemption_points`, `max_redemption_percent`, `max_redemption_amount`.

    Returns a dict with keys:
        ok: bool
        code: None | "LOYALTY_DISABLED" | "SETTINGS_MISSING" | "BELOW_MIN_REDEMPTION"
        message: str (always set; empty when ok)
        max_points_redeemable: int
        max_discount_value: float
        ratio_per_point: float
        tier: str
        available_points: int
        min_redemption_points: int
        loyalty_enabled: bool
    """
    from core.helpers import get_redemption_value_for_tier

    tier = customer.get("tier", "Bronze") if customer else "Bronze"
    available_points = int(customer.get("total_points", 0)) if customer else 0

    # SETTINGS_MISSING — do NOT use hardcoded fallbacks. Mirrors LR.
    if not settings:
        return {
            "ok": False,
            "code": "SETTINGS_MISSING",
            "message": "Loyalty settings not configured for this restaurant.",
            "max_points_redeemable": 0,
            "max_discount_value": 0.0,
            "ratio_per_point": 0.0,
            "tier": tier,
            "available_points": available_points,
            "min_redemption_points": 0,
            "loyalty_enabled": False,
        }

    loyalty_enabled = bool(settings.get("loyalty_enabled", False))
    if not loyalty_enabled:
        return {
            "ok": False,
            "code": "LOYALTY_DISABLED",
            "message": "Loyalty program is currently disabled.",
            "max_points_redeemable": 0,
            "max_discount_value": 0.0,
            "ratio_per_point": 0.0,
            "tier": tier,
            "available_points": available_points,
            "min_redemption_points": int(settings.get("min_redemption_points", 0) or 0),
            "loyalty_enabled": False,
        }

    ratio_per_point = float(get_redemption_value_for_tier(tier, settings))
    min_redemption = int(settings.get("min_redemption_points", 0) or 0)

    # BELOW_MIN_REDEMPTION
    if min_redemption > 0 and available_points < min_redemption:
        return {
            "ok": False,
            "code": "BELOW_MIN_REDEMPTION",
            "message": f"Minimum {min_redemption} points required. Customer has {available_points}.",
            "max_points_redeemable": 0,
            "max_discount_value": 0.0,
            "ratio_per_point": ratio_per_point,
            "tier": tier,
            "available_points": available_points,
            "min_redemption_points": min_redemption,
            "loyalty_enabled": True,
        }

    # Three caps: percent of bill, hard ₹ cap, points×ratio.
    max_percent = float(settings.get("max_redemption_percent", 100.0) or 100.0)
    max_amount = float(settings.get("max_redemption_amount", 999999.0) or 999999.0)

    max_by_percent = (float(bill_amount) * max_percent) / 100.0 if bill_amount and bill_amount > 0 else 0.0
    max_by_cap = max_amount
    max_by_points = available_points * ratio_per_point

    max_discount = min(max_by_percent, max_by_cap, max_by_points)
    max_points = int(max_discount / ratio_per_point) if ratio_per_point > 0 else 0
    max_points = max(0, min(max_points, available_points))
    max_discount_value = round(max_points * ratio_per_point, 2)

    return {
        "ok": True,
        "code": None,
        "message": "",
        "max_points_redeemable": max_points,
        "max_discount_value": max_discount_value,
        "ratio_per_point": ratio_per_point,
        "tier": tier,
        "available_points": available_points,
        "min_redemption_points": min_redemption,
        "loyalty_enabled": True,
    }


async def redeem_loyalty_points(
    db,
    user_id: str,
    customer: dict,
    settings: dict | None,
    points_to_redeem: int,
    order_id: str,
    order_total: float,
    idempotency_key: str,
) -> dict:
    """Shared redeem helper. Single source of truth for the commit side.

    Performs:
      • idempotency lookup (replay or IDEMPOTENCY_CONFLICT)
      • SETTINGS_MISSING / LOYALTY_DISABLED / CUSTOMER_NOT_FOUND / INVALID_POINTS
        / BELOW_MIN_REDEMPTION / ORDER_ID_REQUIRED / IDEMPOTENCY_KEY_REQUIRED
        / INSUFFICIENT_POINTS guards
      • auto-cap via compute_max_redeemable (Q-LR6, owner-approved)
      • customer mutation: $set total_points, $inc total_points_redeemed
        (NO tier change — Q-LR1)
      • points_transactions row insert (positive points, transaction_type="redeem")
      • best-effort WhatsApp "points_redeemed" trigger (non-blocking)

    Returns a dict:
        {
          ok: bool,
          status: "committed" | "replayed" | "rejected",
          code: <None | ErrorCode>,
          message: str,
          data: { ...response payload identical to /loyalty/redeem... },
        }

    Caller is responsible for translating this into the HTTP envelope
    (POSResponse).  This helper does NOT raise — all failures are returned
    in the result dict so the order-webhook caller can decide whether to
    hard-fail the order (Q-CORR-2) or auto-cap silently.
    """
    import uuid
    import asyncio
    from datetime import datetime, timezone
    from core.helpers import get_redemption_value_for_tier

    # ---- 0a. ORDER_ID_REQUIRED ----
    if not order_id or not str(order_id).strip():
        return _rej("ORDER_ID_REQUIRED", "order_id is required for POS billing redeem.")

    # ---- 0b. IDEMPOTENCY_KEY_REQUIRED ----
    if not idempotency_key or not str(idempotency_key).strip():
        return _rej("IDEMPOTENCY_KEY_REQUIRED", "idempotency_key is required.")

    # ---- 0c. INVALID_POINTS ----
    if not isinstance(points_to_redeem, int) or points_to_redeem <= 0:
        return _rej("INVALID_POINTS", "points_to_redeem must be a positive integer.")

    # ---- 0d. Idempotency lookup (BEFORE business validation) ----
    existing_tx = await db.points_transactions.find_one({
        "user_id": user_id,
        "idempotency_key": idempotency_key,
        "transaction_type": "redeem",
    })
    if existing_tx:
        existing_customer = existing_tx.get("customer_id")
        existing_order = existing_tx.get("order_id")
        existing_points = existing_tx.get("points", 0)
        req_customer_id = (customer or {}).get("id")
        if (
            existing_customer != req_customer_id
            or existing_order != order_id
            or existing_points != points_to_redeem
        ):
            return {
                "ok": False,
                "status": "rejected",
                "code": "IDEMPOTENCY_CONFLICT",
                "message": "idempotency_key was previously used with different parameters.",
                "data": {
                    "error": {
                        "code": "IDEMPOTENCY_CONFLICT",
                        "message": "idempotency_key was previously used with different parameters.",
                        "existing": {
                            "customer_id": existing_customer,
                            "order_id": existing_order,
                            "points": existing_points,
                        },
                    }
                },
            }
        # Exact replay → return original recorded result without double-deducting.
        replay_cust = await db.customers.find_one({"id": req_customer_id, "user_id": user_id})
        replay_ratio = existing_tx.get("ratio_per_point", 0)
        return {
            "ok": True,
            "status": "replayed",
            "code": None,
            "message": "Points redeemed successfully (idempotent replay)",
            "data": {
                "customer_id": req_customer_id,
                "points_redeemed": existing_tx.get("points", 0),
                "ratio_per_point": replay_ratio,
                "redeemed_value": existing_tx.get("redeemed_value", 0),
                "remaining_points": existing_tx.get("balance_after", 0),
                "remaining_points_value": round(
                    existing_tx.get("balance_after", 0) * (replay_ratio or 0), 2
                ),
                "tier": (replay_cust or {}).get("tier", "Bronze"),
                "total_points_redeemed": (replay_cust or {}).get("total_points_redeemed", 0),
                "transaction_id": existing_tx.get("id", ""),
                "idempotent": True,
            },
        }

    # ---- 1. SETTINGS_MISSING / 2. LOYALTY_DISABLED ----
    if not settings:
        return _rej("SETTINGS_MISSING", "Loyalty settings not configured.")
    if not settings.get("loyalty_enabled", False):
        return _rej("LOYALTY_DISABLED", "Loyalty program is currently disabled.")

    # ---- 3. CUSTOMER_NOT_FOUND ----
    if not customer:
        return _rej("CUSTOMER_NOT_FOUND", "Customer not found for this restaurant.")

    available_points = int(customer.get("total_points", 0))
    customer_tier = customer.get("tier", "Bronze")

    # ---- 4. min_redemption_points ----
    min_redemption = int(settings.get("min_redemption_points", 0) or 0)
    if min_redemption > 0 and available_points < min_redemption:
        return _rej(
            "BELOW_MIN_REDEMPTION",
            f"Minimum {min_redemption} points required. Customer has {available_points}.",
            extra={"min_redemption_points": min_redemption, "available_points": available_points},
        )
    if min_redemption > 0 and points_to_redeem < min_redemption:
        return _rej(
            "BELOW_MIN_REDEMPTION",
            f"Minimum {min_redemption} points per redemption. Requested {points_to_redeem}.",
            extra={"min_redemption_points": min_redemption},
        )

    # ---- 5. Tier-aware ratio + auto-cap via shared calculator ----
    cap = compute_max_redeemable(customer, settings, order_total)
    if not cap["ok"]:
        # Should only hit here if settings/loyalty_enabled changed between checks.
        return _rej(cap["code"] or "INSUFFICIENT_POINTS", cap["message"])
    ratio_per_point = cap["ratio_per_point"]
    max_redeemable_points = cap["max_points_redeemable"]
    actual_points = min(points_to_redeem, max_redeemable_points)

    # ---- 6. INSUFFICIENT_POINTS (after auto-cap nothing is redeemable) ----
    if actual_points <= 0 or available_points < actual_points:
        return _rej(
            "INSUFFICIENT_POINTS",
            f"Customer has {available_points} points. Max redeemable: {max_redeemable_points}.",
            extra={
                "available_points": available_points,
                "max_redeemable_points": max_redeemable_points,
            },
        )

    # ---- 7. Compute, write customer, write PT row ----
    redeemed_value = round(actual_points * ratio_per_point, 2)
    new_balance = available_points - actual_points
    new_total_redeemed = int(customer.get("total_points_redeemed", 0)) + actual_points
    tx_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Customer mutation — NO tier change (Q-LR1).
    await db.customers.update_one(
        {"id": customer["id"]},
        {
            "$set": {"total_points": new_balance},
            "$inc": {"total_points_redeemed": actual_points},
        },
    )

    tx_doc = {
        "id": tx_id,
        "user_id": user_id,
        "customer_id": customer["id"],
        "order_id": order_id,
        "points": actual_points,
        "transaction_type": "redeem",
        "description": f"Redeemed {actual_points} pts (Rs.{redeemed_value}) on order {order_id}",
        "bill_amount": order_total,
        "balance_after": new_balance,
        "redeemed_value": redeemed_value,
        "ratio_per_point": ratio_per_point,
        "idempotency_key": idempotency_key,
        "points_expired": False,
        "created_at": now,
    }
    await db.points_transactions.insert_one(tx_doc)

    # ---- 8. Best-effort WhatsApp trigger (non-blocking) ----
    try:
        from core.whatsapp import trigger_whatsapp_event
        updated_customer = {**customer, "total_points": new_balance, "tier": customer_tier}
        asyncio.create_task(
            trigger_whatsapp_event(
                db,
                user_id,
                "points_redeemed",
                updated_customer,
                {
                    "points_redeemed": actual_points,
                    "points_balance": new_balance,
                    "redeemed_value": redeemed_value,
                },
            )
        )
    except Exception:
        # WA trigger is best-effort; never block redemption on it.
        pass

    return {
        "ok": True,
        "status": "committed",
        "code": None,
        "message": "Points redeemed successfully",
        "data": {
            "customer_id": customer["id"],
            "points_redeemed": actual_points,
            "ratio_per_point": ratio_per_point,
            "redeemed_value": redeemed_value,
            "remaining_points": new_balance,
            "remaining_points_value": round(new_balance * ratio_per_point, 2),
            "tier": customer_tier,
            "total_points_redeemed": new_total_redeemed,
            "transaction_id": tx_id,
        },
    }


def _rej(code: str, message: str, extra: dict | None = None) -> dict:
    """Internal helper to build a rejected-redeem result dict."""
    err = {"code": code, "message": message}
    if extra:
        err.update(extra)
    return {
        "ok": False,
        "status": "rejected",
        "code": code,
        "message": message,
        "data": {"error": err},
    }
