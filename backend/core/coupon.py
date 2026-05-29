"""
CR-001C-C — Coupon V1 central service module.

Responsibilities:
  * Pure discount math (`compute_coupon_discount`).
  * Single-source-of-truth validation (`validate_coupon_for_customer`)
    used by `available`, `validate`, and the final-order recording path.
  * Eligibility listing (`list_available_coupons`).
  * Final-commit recording (`record_coupon_usage_for_order`) — idempotent
    on `(user_id, order_id)`, mirrors the CR-001C-LR pattern.
  * Index bootstrap (`ensure_coupon_indexes`) wired from server lifespan.

Frozen owner decisions applied:
  * Q1 = A — ORDER_FLAT + ORDER_PERCENTAGE only.
  * Q2 = C — stack-with-loyalty only if `coupon.stackable_with_loyalty=True`.
  * Q3 = D — wallet ignored.
  * Q4 = B — usage recorded only at final `/api/pos/orders`.
  * Q5 = C — POS sends actual amount; CRM is guardrail, POS is source of truth.
  * Q6 = B — V1 = flat/percentage; item/category V2; BOGO/happy-hour V3.

Variance tolerance (Addendum A.4):
  abs(pos - crm) <= max(COUPON_VARIANCE_ABS_TOLERANCE,
                        COUPON_VARIANCE_REL_TOLERANCE * crm)
  (₹1.00 absolute OR 1% relative — whichever is greater).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta, time as _dtime
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tunables (Addendum A.4)
# ---------------------------------------------------------------------------
COUPON_VARIANCE_ABS_TOLERANCE = 1.00  # ₹ — absolute slack
COUPON_VARIANCE_REL_TOLERANCE = 0.01  # 1% relative slack

# CR-001C-C V3-A — product-default timezone (per OQ-V3-5 fallback chain step 3).
COUPON_DEFAULT_TIMEZONE = "Asia/Kolkata"

# Canonical V1 discount types.
_CANONICAL_FLAT = "flat"
_CANONICAL_PERCENTAGE = "percentage"
_V1_SUPPORTED_DISCOUNT_TYPES = {_CANONICAL_FLAT, _CANONICAL_PERCENTAGE}

# Canonical V1 coupon types.
_V1_SUPPORTED_COUPON_TYPES = {"order", "order_flat", "order_percentage"}

# CR-001C-C V2 — discount_scope discriminator (composes with discount_type).
_SCOPE_ORDER = "order"
_SCOPE_ITEM = "item"
_SCOPE_CATEGORY = "category"
_V2_SUPPORTED_SCOPES = {_SCOPE_ORDER, _SCOPE_ITEM, _SCOPE_CATEGORY}


def resolve_discount_scope(coupon: dict) -> str:
    """V2 scope resolver. V1 rows without `discount_scope` resolve to 'order'."""
    raw = (coupon or {}).get("discount_scope")
    if raw:
        rs = str(raw).strip().lower()
        if rs in _V2_SUPPORTED_SCOPES:
            return rs
    # Backward compat — accept legacy `coupon_type` carrying "item"/"category".
    ct = (coupon or {}).get("coupon_type")
    if ct:
        ct_l = str(ct).strip().lower()
        if ct_l in _V2_SUPPORTED_SCOPES:
            return ct_l
        if ct_l in {"item_flat", "item_percentage"}:
            return _SCOPE_ITEM
        if ct_l in {"category_flat", "category_percentage"}:
            return _SCOPE_CATEGORY
    return _SCOPE_ORDER


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------
def normalize_coupon_type(coupon_type: Optional[str]) -> str:
    """Map any legacy/new alias to canonical scope.
    Returns "order" | "item" | "category".
    CR-001C-C V2: accepts item/category in addition to V1 order types.
    """
    if not coupon_type:
        return "order"
    ct = str(coupon_type).strip().lower()
    if ct in _V1_SUPPORTED_COUPON_TYPES:
        return "order"
    if ct in {"item", "item_flat", "item_percentage"}:
        return "item"
    if ct in {"category", "category_flat", "category_percentage"}:
        return "category"
    raise ValueError(f"Coupon type not supported: {coupon_type}")


def _normalize_discount_type(discount_type: Optional[str]) -> str:
    if not discount_type:
        raise ValueError("Coupon missing discount_type")
    dt = str(discount_type).strip().lower()
    # Accept POS aliases for forward compat.
    aliases = {
        "flat": _CANONICAL_FLAT,
        "order_flat": _CANONICAL_FLAT,
        "fixed": _CANONICAL_FLAT,
        "percentage": _CANONICAL_PERCENTAGE,
        "order_percentage": _CANONICAL_PERCENTAGE,
        "percent": _CANONICAL_PERCENTAGE,
    }
    canon = aliases.get(dt)
    if canon not in _V1_SUPPORTED_DISCOUNT_TYPES:
        raise ValueError(f"Unsupported discount_type for V1: {discount_type}")
    return canon


def compute_coupon_discount(coupon: dict, order_total: float) -> float:
    """Pure calculator. Returns the discount amount rounded to 2 decimals."""
    discount_type = _normalize_discount_type(coupon.get("discount_type"))
    value = float(coupon.get("discount_value") or 0.0)
    order_total = float(order_total or 0.0)

    if discount_type == _CANONICAL_FLAT:
        discount = min(value, order_total)
    else:  # percentage
        discount = (order_total * value) / 100.0
        max_disc = coupon.get("max_discount")
        if max_disc is not None:
            try:
                discount = min(discount, float(max_disc))
            except (TypeError, ValueError):
                pass

    return round(max(0.0, discount), 2)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso_lte(a: Optional[str], b: Optional[str]) -> bool:
    """Safe ISO string compare; if either side missing → returns True (skip check)."""
    if not a or not b:
        return True
    return a <= b


def _resolve_validity_window(coupon: dict) -> tuple[Optional[str], Optional[str]]:
    """Read both legacy and new field names. ISO strings."""
    start = coupon.get("start_date") or coupon.get("valid_from")
    end = (
        coupon.get("end_date")
        or coupon.get("valid_until")
        or coupon.get("expires_at")
    )
    return start, end


# ---------------------------------------------------------------------------
# CR-001C-C V2 — cart-line matching helpers
# ---------------------------------------------------------------------------
def _to_str(v) -> str:
    return "" if v is None else str(v).strip()


def _norm(v) -> str:
    return _to_str(v).casefold()


def _str_in_set(value, candidates) -> bool:
    """String-exact membership after coercing both sides to str."""
    if value is None or not candidates:
        return False
    target = _to_str(value)
    return any(_to_str(c) == target for c in candidates)


def _norm_in_set(value, candidates) -> bool:
    """Case-insensitive normalized membership."""
    if value is None or not candidates:
        return False
    target = _norm(value)
    return any(_norm(c) == target for c in candidates)


def _line_matches_item_scope(line: dict, coupon: dict) -> bool:
    """V2 item-scope matching priority: food_id (1) → item_id (2)."""
    elig_food = coupon.get("eligible_food_ids")
    elig_item = coupon.get("eligible_item_ids")
    if elig_food and _str_in_set(line.get("food_id"), elig_food):
        return True
    if elig_item and _str_in_set(line.get("item_id"), elig_item):
        return True
    return False


def _line_matches_category_scope(line: dict, coupon: dict) -> bool:
    """V2 category-scope matching priority:
        1. category_id exact
        2. category_name normalized
        3. item_category fallback against both id-like and name-like.
    """
    elig_ids = coupon.get("eligible_category_ids")
    elig_names = coupon.get("eligible_category_names")

    if elig_ids and _str_in_set(line.get("category_id"), elig_ids):
        return True
    if elig_names and _norm_in_set(line.get("category_name"), elig_names):
        return True
    ic = line.get("item_category")
    if ic is not None:
        if elig_ids and _str_in_set(ic, elig_ids):
            return True
        if elig_names and _norm_in_set(ic, elig_names):
            return True
    return False


def _line_is_excluded(line: dict, coupon: dict) -> bool:
    excluded_items = coupon.get("excluded_item_ids") or []
    excluded_cats = coupon.get("excluded_category_ids") or []
    if excluded_items and (
        _str_in_set(line.get("item_id"), excluded_items)
        or _str_in_set(line.get("food_id"), excluded_items)
    ):
        return True
    if excluded_cats and (
        _str_in_set(line.get("category_id"), excluded_cats)
        or _str_in_set(line.get("item_category"), excluded_cats)
    ):
        return True
    return False


def _line_contribution(line: dict, max_applicable_qty: Optional[int]) -> Optional[float]:
    """Compute a line's contribution to eligible_subtotal.
    Returns None if the line lacks valid pricing (silently dropped by caller).
    """
    qty_raw = line.get("quantity")
    try:
        qty = int(qty_raw) if qty_raw is not None else 1
    except (TypeError, ValueError):
        qty = 1
    if qty <= 0:
        qty = 1

    capped_qty = qty
    if max_applicable_qty is not None:
        try:
            cap = int(max_applicable_qty)
            if cap >= 0:
                capped_qty = min(qty, cap)
        except (TypeError, ValueError):
            pass

    unit_price = line.get("unit_price")
    try:
        up = float(unit_price) if unit_price is not None else None
    except (TypeError, ValueError):
        up = None

    line_total = line.get("line_total")
    try:
        lt = float(line_total) if line_total is not None else None
    except (TypeError, ValueError):
        lt = None

    if up is not None and up >= 0:
        return round(capped_qty * up, 2)
    # Fallback to line_total (already represents qty * unit_price on POS side).
    if lt is not None and lt >= 0:
        if max_applicable_qty is not None and qty > 0:
            # Scale line_total by the per-line cap.
            return round(lt * (capped_qty / qty), 2)
        return round(lt, 2)
    # Silently drop invalid lines.
    return None


def _select_cheapest_or_highest(eligible: list[dict], coupon: dict) -> list[dict]:
    """Apply apply_to_cheapest_item / apply_to_highest_item restrictions."""
    if not eligible:
        return eligible
    cheapest = bool(coupon.get("apply_to_cheapest_item", False))
    highest = bool(coupon.get("apply_to_highest_item", False))
    if cheapest and not highest:
        ranked = sorted(
            eligible,
            key=lambda ln: (float(ln.get("unit_price") or float(ln.get("line_total") or 0.0))),
        )
        return [ranked[0]]
    if highest and not cheapest:
        ranked = sorted(
            eligible,
            key=lambda ln: (float(ln.get("unit_price") or float(ln.get("line_total") or 0.0))),
            reverse=True,
        )
        return [ranked[0]]
    return eligible


def _compute_v2_discount(
    coupon: dict,
    scope: str,
    items: Optional[list[dict]],
) -> dict:
    """V2 cart-aware discount computation.

    Returns:
      {"ok": True, "computed_discount": float, "eligible_subtotal": float,
       "matched_food_ids": list, "matched_item_ids": list,
       "matched_category_ids": list, "matched_category_names": list}
    or {"ok": False, "error": {"code", "field", "detail"}}.
    """
    if scope == _SCOPE_ORDER:
        # Should not be called for order scope. Caller guards this.
        return {"ok": False, "error": {"code": "INACTIVE", "field": "discount_scope", "detail": "Order-scope must not call _compute_v2_discount"}}

    if items is None or len(items) == 0:
        err_code = (
            "MISSING_ITEMS_FOR_ITEM_COUPON"
            if scope == _SCOPE_ITEM
            else "MISSING_ITEMS_FOR_CATEGORY_COUPON"
        )
        return {
            "ok": False,
            "error": {"code": err_code, "field": "items", "detail": "items[] required for this coupon scope"},
        }

    matcher = _line_matches_item_scope if scope == _SCOPE_ITEM else _line_matches_category_scope
    eligible: list[dict] = []
    for ln in items:
        if not isinstance(ln, dict):
            continue
        if not matcher(ln, coupon):
            continue
        if _line_is_excluded(ln, coupon):
            continue
        eligible.append(ln)

    # CR-006 fix: check min_item_qty on FULL eligible pool BEFORE cheapest/highest narrowing.
    # Previously, _select_cheapest_or_highest reduced eligible to 1 item first, then
    # min_item_qty check ran on that narrowed set and always failed for qty >= 2.
    min_qty = coupon.get("min_item_qty")
    if min_qty is not None:
        try:
            mq = int(min_qty)
            full_eligible_qty = 0
            for ln in eligible:
                try:
                    lq = int(ln.get("quantity") or 1)
                except (TypeError, ValueError):
                    lq = 1
                full_eligible_qty += max(0, lq)
            if full_eligible_qty < mq:
                return {
                    "ok": False,
                    "error": {
                        "code": "MIN_ITEM_QTY_NOT_MET",
                        "field": "min_item_qty",
                        "detail": f"Minimum eligible quantity is {mq}",
                    },
                }
        except (TypeError, ValueError):
            pass

    eligible = _select_cheapest_or_highest(eligible, coupon)

    max_qty = coupon.get("max_applicable_qty")
    eligible_qty_total = 0
    eligible_subtotal = 0.0
    matched_food_ids: list = []
    matched_item_ids: list = []
    matched_category_ids: list = []
    matched_category_names: list = []

    for ln in eligible:
        contrib = _line_contribution(ln, max_qty)
        if contrib is None or contrib <= 0:
            continue
        eligible_subtotal += contrib
        try:
            ln_qty = int(ln.get("quantity") or 1)
        except (TypeError, ValueError):
            ln_qty = 1
        if max_qty is not None:
            try:
                ln_qty = min(ln_qty, int(max_qty))
            except (TypeError, ValueError):
                pass
        eligible_qty_total += max(0, ln_qty)
        fid = ln.get("food_id")
        if fid:
            matched_food_ids.append(_to_str(fid))
        iid = ln.get("item_id")
        if iid:
            matched_item_ids.append(_to_str(iid))
        cid = ln.get("category_id") or ln.get("item_category")
        if cid:
            matched_category_ids.append(_to_str(cid))
        cname = ln.get("category_name")
        if cname:
            matched_category_names.append(_to_str(cname))

    eligible_subtotal = round(eligible_subtotal, 2)

    if eligible_subtotal <= 0:
        err_code = (
            "NO_ELIGIBLE_ITEMS_IN_CART"
            if scope == _SCOPE_ITEM
            else "NO_ELIGIBLE_CATEGORY_IN_CART"
        )
        return {
            "ok": False,
            "error": {"code": err_code, "field": "items", "detail": "No eligible cart lines for this coupon"},
        }

    # Apply flat / percentage formula onto eligible_subtotal.
    try:
        discount_type = _normalize_discount_type(coupon.get("discount_type"))
    except ValueError as exc:
        return {"ok": False, "error": {"code": "INACTIVE", "field": "discount_type", "detail": str(exc)}}

    value = float(coupon.get("discount_value") or 0.0)
    if discount_type == _CANONICAL_FLAT:
        discount = min(value, eligible_subtotal)
    else:  # percentage
        discount = eligible_subtotal * value / 100.0
        max_disc = coupon.get("max_discount")
        if max_disc is not None:
            try:
                discount = min(discount, float(max_disc))
            except (TypeError, ValueError):
                pass
    discount = round(max(0.0, discount), 2)

    return {
        "ok": True,
        "computed_discount": discount,
        "eligible_subtotal": eligible_subtotal,
        "matched_food_ids": list(dict.fromkeys(matched_food_ids)),
        "matched_item_ids": list(dict.fromkeys(matched_item_ids)),
        "matched_category_ids": list(dict.fromkeys(matched_category_ids)),
        "matched_category_names": list(dict.fromkeys(matched_category_names)),
    }


# ---------------------------------------------------------------------------
# CR-001C-C V3-B — BOGO / Buy-X-Get-Y engine
#
# Locked owner decisions (Path Alpha, Addendum D, 2026-02):
#   Q1=D full BOGO + BXGY with free/%/flat get benefit.
#   Q2=A get item must already be in cart (no auto-add).
#   Q3=A free cheapest eligible unit (default; apply_to_highest_item overrides).
#   Q4=A include different-item BXGY now.
#   Q5=C benefit types free / percentage / flat.
#   Q6=C allow_repeat field, default True.
#   Q7=A support max_applications cap (not an error code, just a cap).
#   Q8=B return total discount + benefit_items summary (no per-line allocation).
#   Q9=A final-order failure is non-blocking; coupon_usage skipped, order persists.
#   Q10=A time-window pre-check (V3-A Step 4) composes automatically.
#   Q11=B return pos_instruction only on missing-requirement failures.
#
# Internal offer_type values handled by the V3-B branch:
#   "bogo" / "buy_x_get_y" / "bxg" — all run the V3-B engine.
# Other offer_type values ("simple", "nth_item", "free_item", "combo") fall
# through to the existing V1/V2/V3-A dispatch path.
# ---------------------------------------------------------------------------
_V3B_OFFER_TYPES = {"bogo", "bxg", "buy_x_get_y"}
_V3B_BENEFIT_TYPES = {"free", "percentage", "flat"}

# ---------------------------------------------------------------------------
# CR-001C-C V3-C — Every-Nth item engine constants.
#
# Locked owner decisions (Path Alpha, Addendum E, 2026-02):
#   Q1=D full V3-C: item + category every-Nth, free/%/flat, repeat + caps.
#   Q2=A Every-Nth = floor(eligible_total / N) on QUANTITY (POS line sequence
#        is NEVER consulted; consistent with auditability and fairness).
#   Q3=A free cheapest eligible unit (apply_to_highest_item overrides).
#   Q4=C benefit types free / percentage / flat.
#   Q5=C allow_repeat field default True.
#   Q6=A support max_applications cap (NOT an error).
#   Q7=A include category-level every-Nth.
#   Q8=B total discount + benefit_items summary (no per-line allocation).
#   Q9=A final-order failure non-blocking; coupon_usage skipped.
#   Q10=A V3-A time-window pre-check composes automatically.
#   Q11=B pos_instruction only on missing-requirement failures.
#
# Accepted offer_type aliases (all normalize to canonical "nth_item"):
#   "nth_item" / "every_nth" / "every_nth_item"
# ---------------------------------------------------------------------------
_V3C_OFFER_TYPES = {"nth_item", "every_nth", "every_nth_item"}
_V3C_BENEFIT_TYPES = {"free", "percentage", "flat"}


def _v3b_normalize_offer_type(raw) -> Optional[str]:
    """Map a coupon's stored offer_type to one of {"bogo","bxg"} or None
    when the coupon is not a V3-B coupon. `"buy_x_get_y"` aliases `"bxg"`.
    """
    if not raw:
        return None
    o = str(raw).strip().lower()
    if o == "bogo":
        return "bogo"
    if o in {"bxg", "buy_x_get_y"}:
        return "bxg"
    return None


def _v3b_get_buy_lists(coupon: dict) -> dict:
    return {
        "food_ids": coupon.get("buy_food_ids") or [],
        "item_ids": coupon.get("buy_item_ids") or [],
        "category_ids": coupon.get("buy_category_ids") or [],
        "category_names": coupon.get("buy_category_names") or [],
    }


def _v3b_get_get_lists(coupon: dict) -> dict:
    return {
        "food_ids": coupon.get("get_food_ids") or [],
        "item_ids": coupon.get("get_item_ids") or [],
        "category_ids": coupon.get("get_category_ids") or [],
        "category_names": coupon.get("get_category_names") or [],
    }


def _v3b_lists_empty(d: dict) -> bool:
    return not (d["food_ids"] or d["item_ids"] or d["category_ids"] or d["category_names"])


def _v3b_line_matches_lists(line: dict, lists: dict) -> bool:
    """Generic line→list matcher reusing V2 priorities:
    food_id (1) → item_id (2) → category_id (3) → category_name (4).
    """
    if not isinstance(line, dict):
        return False
    if lists["food_ids"] and _str_in_set(line.get("food_id"), lists["food_ids"]):
        return True
    if lists["item_ids"] and _str_in_set(line.get("item_id"), lists["item_ids"]):
        return True
    if lists["category_ids"] and (
        _str_in_set(line.get("category_id"), lists["category_ids"])
        or _str_in_set(line.get("item_category"), lists["category_ids"])
    ):
        return True
    if lists["category_names"] and (
        _norm_in_set(line.get("category_name"), lists["category_names"])
        or _norm_in_set(line.get("item_category"), lists["category_names"])
    ):
        return True
    return False


def _v3b_line_unit_price(line: dict) -> Optional[float]:
    """Return per-unit price, falling back to line_total / quantity."""
    try:
        up = line.get("unit_price")
        if up is not None:
            f = float(up)
            if f >= 0:
                return round(f, 2)
    except (TypeError, ValueError):
        pass
    try:
        lt = line.get("line_total")
        qty_raw = line.get("quantity")
        qty = int(qty_raw) if qty_raw is not None else 1
        if qty <= 0:
            qty = 1
        if lt is not None:
            f = float(lt)
            if f >= 0:
                return round(f / qty, 2)
    except (TypeError, ValueError):
        pass
    return None


def _v3b_expand_units(lines: list) -> list:
    """Expand each matched cart line into per-unit micro-rows.
    Lines with invalid pricing are silently dropped (consistent with V2).
    """
    units: list = []
    for ln in lines:
        if not isinstance(ln, dict):
            continue
        up = _v3b_line_unit_price(ln)
        if up is None or up < 0:
            continue
        try:
            qty = int(ln.get("quantity") or 1)
        except (TypeError, ValueError):
            qty = 1
        if qty <= 0:
            qty = 1
        for _ in range(qty):
            units.append({
                "food_id": _to_str(ln.get("food_id")) or None,
                "item_id": _to_str(ln.get("item_id")) or None,
                "name": _to_str(ln.get("name")) or None,
                "unit_price": float(up),
                "category_id": _to_str(ln.get("category_id")) or None,
                "category_name": _to_str(ln.get("category_name")) or None,
            })
    return units


def _v3b_summarise_lines(lines: list) -> list:
    """Aggregate matched lines into {food_id,item_id,name,matched_quantity}."""
    by_key: dict = {}
    for ln in lines:
        if not isinstance(ln, dict):
            continue
        try:
            qty = int(ln.get("quantity") or 1)
        except (TypeError, ValueError):
            qty = 1
        if qty <= 0:
            qty = 1
        key = (
            _to_str(ln.get("food_id")) or None,
            _to_str(ln.get("item_id")) or None,
            _to_str(ln.get("name")) or None,
        )
        if key not in by_key:
            by_key[key] = {
                "food_id": key[0], "item_id": key[1], "name": key[2],
                "matched_quantity": 0,
            }
        by_key[key]["matched_quantity"] += qty
    return list(by_key.values())


def _v3b_validate_config(coupon: dict, offer_type: str) -> Optional[dict]:
    """Validate V3-B coupon configuration. Returns error dict or None."""
    # buy / get quantities — must be positive integers.
    try:
        buy_q = int(coupon.get("buy_quantity") or 0)
        get_q = int(coupon.get("get_quantity") or 0)
    except (TypeError, ValueError):
        return {
            "ok": False,
            "error": {
                "code": "BXGY_CONFIG_INVALID", "field": "buy_quantity",
                "detail": "buy_quantity / get_quantity must be integers ≥ 1",
            },
        }
    if buy_q < 1 or get_q < 1:
        return {
            "ok": False,
            "error": {
                "code": "BXGY_CONFIG_INVALID", "field": "buy_quantity",
                "detail": "buy_quantity / get_quantity must both be ≥ 1",
            },
        }

    # Benefit type — must be free / percentage / flat.
    gdt = (coupon.get("get_discount_type") or "free").strip().lower()
    if gdt not in _V3B_BENEFIT_TYPES:
        return {
            "ok": False,
            "error": {
                "code": "UNSUPPORTED_BENEFIT_TYPE", "field": "get_discount_type",
                "detail": f"Benefit type {gdt!r} not supported (allowed: free / percentage / flat)",
            },
        }
    # percentage / flat require a positive get_discount_value.
    if gdt in ("percentage", "flat"):
        gv = coupon.get("get_discount_value")
        try:
            gvf = float(gv) if gv is not None else None
        except (TypeError, ValueError):
            gvf = None
        if gvf is None or gvf <= 0:
            return {
                "ok": False,
                "error": {
                    "code": "BXGY_CONFIG_INVALID", "field": "get_discount_value",
                    "detail": f"get_discount_value required and > 0 for {gdt} benefit",
                },
            }

    # At least one buy-side eligibility list (buy_* OR legacy eligible_*) must
    # be configured, otherwise the coupon would match every cart line.
    bl = _v3b_get_buy_lists(coupon)
    has_legacy = bool(
        coupon.get("eligible_food_ids") or coupon.get("eligible_item_ids")
        or coupon.get("eligible_category_ids") or coupon.get("eligible_category_names")
    )
    if _v3b_lists_empty(bl) and not has_legacy:
        return {
            "ok": False,
            "error": {
                "code": "BXGY_CONFIG_INVALID", "field": "buy_food_ids",
                "detail": "At least one buy-side eligibility list (buy_food_ids / buy_item_ids / buy_category_ids / buy_category_names) is required",
            },
        }
    return None


def _v3b_resolve_buy_lists(coupon: dict) -> dict:
    """Return effective buy-side lists. Falls back to V2 `eligible_*` when
    `buy_*` is empty (allows BOGO to reuse V2 fixture conventions).
    """
    bl = _v3b_get_buy_lists(coupon)
    if not _v3b_lists_empty(bl):
        return bl
    return {
        "food_ids": coupon.get("eligible_food_ids") or [],
        "item_ids": coupon.get("eligible_item_ids") or [],
        "category_ids": coupon.get("eligible_category_ids") or [],
        "category_names": coupon.get("eligible_category_names") or [],
    }


def _v3b_resolve_get_lists(coupon: dict, buy_lists: dict, same_item: bool) -> dict:
    """Return effective get-side lists. For same-item BOGO/BXG, get lists
    default to buy lists when not explicitly set."""
    gl = _v3b_get_get_lists(coupon)
    if not _v3b_lists_empty(gl):
        return gl
    if same_item:
        return dict(buy_lists)
    return gl  # empty — caller will produce NO_ELIGIBLE_GET_ITEMS_IN_CART


def _v3b_match_lines_by_lists(items: list, lists: dict, coupon: dict) -> list:
    """Filter cart lines by `lists`, also dropping V2-excluded lines."""
    out: list = []
    for ln in items:
        if not isinstance(ln, dict):
            continue
        if not _v3b_line_matches_lists(ln, lists):
            continue
        if _line_is_excluded(ln, coupon):
            continue
        out.append(ln)
    return out


def _v3b_select_get_units(
    candidates: list, units_needed: int, coupon: dict,
) -> list:
    """Q3=A default: free cheapest. apply_to_highest_item overrides to highest."""
    if units_needed <= 0 or not candidates:
        return []
    highest = bool(coupon.get("apply_to_highest_item", False))
    cheapest = bool(coupon.get("apply_to_cheapest_item", False))
    # Default behavior (neither flag set) → cheapest, per Q3=A.
    reverse = bool(highest and not cheapest)
    ordered = sorted(candidates, key=lambda u: float(u["unit_price"]), reverse=reverse)
    return ordered[:units_needed]


def _v3b_apply_caps(applications: int, coupon: dict) -> int:
    """Apply allow_repeat (default True) and max_applications caps."""
    if applications <= 0:
        return 0
    allow_repeat = coupon.get("allow_repeat")
    # Default True when missing / None.
    if allow_repeat is False:
        applications = min(applications, 1)
    max_apps = coupon.get("max_applications")
    if max_apps is not None:
        try:
            cap = int(max_apps)
            if cap >= 1:
                applications = min(applications, cap)
        except (TypeError, ValueError):
            pass
    return applications


def _v3b_compute_discount(
    coupon: dict, offer_type: str, items: Optional[list],
) -> dict:
    """Core V3-B engine. Returns success dict with discount or error dict.

    Success keys:
      ok, computed_discount, eligible_subtotal, applied_applications,
      benefit_items, buy_match_summary, get_match_summary,
      same_item_required, offer_type, get_discount_type.
    Error keys (Q11=B: pos_instruction echoed only on missing-requirement codes):
      ok=False, error={code,field,detail}, pos_instruction (optional).
    """
    # Cart presence.
    if items is None or len(items) == 0:
        out = {
            "ok": False,
            "error": {
                "code": "MISSING_ITEMS_FOR_BXGY_COUPON",
                "field": "items",
                "detail": "BOGO/BXGY coupons require items[] at validate time (no auto-add).",
            },
        }
        inst = coupon.get("pos_instruction")
        if inst:
            out["pos_instruction"] = str(inst)
        return out

    # Config sanity.
    cfg_err = _v3b_validate_config(coupon, offer_type)
    if cfg_err is not None:
        return cfg_err

    buy_q = int(coupon.get("buy_quantity") or 1)
    get_q = int(coupon.get("get_quantity") or 1)
    # Same-item rule:
    #   1. explicit flag wins,
    #   2. else: when get_* lists not configured AND offer_type == "bogo" → same-item,
    #   3. else: different-item.
    same_item_flag = coupon.get("same_item_required")
    buy_lists = _v3b_resolve_buy_lists(coupon)
    get_lists_raw = _v3b_get_get_lists(coupon)
    if same_item_flag is None:
        same_item = (offer_type == "bogo") and _v3b_lists_empty(get_lists_raw)
    else:
        same_item = bool(same_item_flag)

    get_lists = _v3b_resolve_get_lists(coupon, buy_lists, same_item)

    # Match cart lines.
    buy_lines = _v3b_match_lines_by_lists(items, buy_lists, coupon)
    if not buy_lines:
        out = {
            "ok": False,
            "error": {
                "code": "NO_ELIGIBLE_BUY_ITEMS_IN_CART", "field": "buy_food_ids",
                "detail": "Cart contains no items eligible for the buy requirement.",
            },
        }
        inst = coupon.get("pos_instruction")
        if inst:
            out["pos_instruction"] = str(inst)
        return out

    if same_item:
        get_lines = buy_lines
    else:
        get_lines = _v3b_match_lines_by_lists(items, get_lists, coupon)
        if not get_lines:
            out = {
                "ok": False,
                "error": {
                    "code": "NO_ELIGIBLE_GET_ITEMS_IN_CART", "field": "get_food_ids",
                    "detail": "Cart contains no items eligible to receive the benefit. Auto-add not allowed.",
                },
            }
            inst = coupon.get("pos_instruction")
            if inst:
                out["pos_instruction"] = str(inst)
            return out

    buy_units_all = _v3b_expand_units(buy_lines)
    get_units_all = _v3b_expand_units(get_lines)

    # Compute applications.
    if same_item:
        total = len(buy_units_all)
        group = buy_q + get_q
        if total < group:
            out = {
                "ok": False,
                "error": {
                    "code": "BUY_REQUIREMENT_NOT_MET", "field": "buy_quantity",
                    "detail": f"Need {group - total} more eligible item(s) to qualify.",
                },
            }
            inst = coupon.get("pos_instruction")
            if inst:
                out["pos_instruction"] = str(inst)
            return out
        applications = total // group
    else:
        buy_total = len(buy_units_all)
        get_total = len(get_units_all)
        if buy_total < buy_q:
            out = {
                "ok": False,
                "error": {
                    "code": "BUY_REQUIREMENT_NOT_MET", "field": "buy_quantity",
                    "detail": f"Add {buy_q - buy_total} more eligible buy item(s) to qualify.",
                },
            }
            inst = coupon.get("pos_instruction")
            if inst:
                out["pos_instruction"] = str(inst)
            return out
        if get_total < get_q:
            out = {
                "ok": False,
                "error": {
                    "code": "GET_REQUIREMENT_NOT_MET", "field": "get_quantity",
                    "detail": f"Add {get_q - get_total} more eligible get item(s) to redeem benefit.",
                },
            }
            inst = coupon.get("pos_instruction")
            if inst:
                out["pos_instruction"] = str(inst)
            return out
        applications = min(buy_total // buy_q, get_total // get_q)

    applications = _v3b_apply_caps(applications, coupon)
    if applications <= 0:
        # Caps reduced to 0 — treat as buy-not-met.
        out = {
            "ok": False,
            "error": {
                "code": "BUY_REQUIREMENT_NOT_MET", "field": "buy_quantity",
                "detail": "Application caps reduced eligibility to zero.",
            },
        }
        inst = coupon.get("pos_instruction")
        if inst:
            out["pos_instruction"] = str(inst)
        return out

    free_units_needed = applications * get_q

    # Candidate pool for selection.
    if same_item:
        # Unified pool; select from all eligible buy_units.
        candidates = list(buy_units_all)
    else:
        candidates = list(get_units_all)

    selected = _v3b_select_get_units(candidates, free_units_needed, coupon)
    if not selected:
        # Defensive — shouldn't happen because applications > 0 implies enough units.
        out = {
            "ok": False,
            "error": {
                "code": "GET_REQUIREMENT_NOT_MET", "field": "get_quantity",
                "detail": "Unable to select benefit units.",
            },
        }
        inst = coupon.get("pos_instruction")
        if inst:
            out["pos_instruction"] = str(inst)
        return out

    # Compute discount.
    gdt = (coupon.get("get_discount_type") or "free").strip().lower()
    try:
        gv = float(coupon.get("get_discount_value") or 0.0)
    except (TypeError, ValueError):
        gv = 0.0

    bi_map: dict = {}
    total_discount = 0.0
    for u in selected:
        up = float(u["unit_price"])
        if gdt == "free":
            line_disc = up
        elif gdt == "percentage":
            line_disc = round(up * gv / 100.0, 2)
            if line_disc > up:
                line_disc = up
        else:  # flat
            line_disc = min(gv, up)
        line_disc = max(0.0, round(line_disc, 2))
        total_discount += line_disc
        key = (u.get("food_id"), u.get("item_id"), u.get("name"))
        if key not in bi_map:
            bi_map[key] = {
                "food_id": u.get("food_id"),
                "item_id": u.get("item_id"),
                "name": u.get("name"),
                "quantity": 0,
                "unit_price": up,
                "line_discount": 0.0,
            }
        bi_map[key]["quantity"] += 1
        bi_map[key]["line_discount"] += line_disc

    # Coupon-level max_discount ceiling (Q5: V1 carry-over).
    max_disc = coupon.get("max_discount")
    if max_disc is not None:
        try:
            mdc = float(max_disc)
            if total_discount > mdc:
                # Scale benefit_items proportionally so summary reflects the cap.
                scale = mdc / total_discount if total_discount > 0 else 0.0
                for v in bi_map.values():
                    v["line_discount"] = round(v["line_discount"] * scale, 2)
                total_discount = mdc
        except (TypeError, ValueError):
            pass

    total_discount = round(max(0.0, total_discount), 2)
    eligible_subtotal = round(sum(float(u["unit_price"]) for u in selected), 2)

    benefit_items = [
        {
            "food_id": v["food_id"], "item_id": v["item_id"], "name": v["name"],
            "quantity": int(v["quantity"]),
            "unit_price": round(float(v["unit_price"]), 2),
            "line_discount": round(float(v["line_discount"]), 2),
        }
        for v in bi_map.values()
    ]

    return {
        "ok": True,
        "computed_discount": total_discount,
        "eligible_subtotal": eligible_subtotal,
        "applied_applications": int(applications),
        "benefit_items": benefit_items,
        "buy_match_summary": _v3b_summarise_lines(buy_lines),
        "get_match_summary": _v3b_summarise_lines(get_lines) if not same_item else [],
        "same_item_required": bool(same_item),
        "offer_type": offer_type,
        "get_discount_type": gdt,
        "max_applications": coupon.get("max_applications"),
        "allow_repeat": coupon.get("allow_repeat") if coupon.get("allow_repeat") is not None else True,
    }


def _v3c_normalize_offer_type(raw) -> Optional[str]:
    """Canonicalize V3-C offer_type aliases. Returns "nth_item" for any of
    {"nth_item", "every_nth", "every_nth_item"}; otherwise None.
    """
    if not raw:
        return None
    o = str(raw).strip().lower()
    if o in _V3C_OFFER_TYPES:
        return "nth_item"
    return None


def _v3c_resolve_eligibility_lists(coupon: dict) -> dict:
    """Single eligibility pool for Every-Nth. Reuses V2 fields."""
    return {
        "food_ids": coupon.get("eligible_food_ids") or [],
        "item_ids": coupon.get("eligible_item_ids") or [],
        "category_ids": coupon.get("eligible_category_ids") or [],
        "category_names": coupon.get("eligible_category_names") or [],
    }


def _v3c_resolve_benefit_type(coupon: dict) -> str:
    """Prefer `nth_discount_type`, fall back to V3-B `get_discount_type`,
    default to `"free"`."""
    raw = coupon.get("nth_discount_type") or coupon.get("get_discount_type") or "free"
    return str(raw).strip().lower()


def _v3c_resolve_benefit_value(coupon: dict) -> Optional[float]:
    """Prefer `nth_discount_value`, fall back to V3-B `get_discount_value`."""
    raw = coupon.get("nth_discount_value")
    if raw is None:
        raw = coupon.get("get_discount_value")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _v3c_validate_config(coupon: dict) -> Optional[dict]:
    """Validate Every-Nth coupon configuration at runtime. Returns error dict or None."""
    # nth_item_number must be int ≥ 2.
    try:
        n = int(coupon.get("nth_item_number") or 0)
    except (TypeError, ValueError):
        return {
            "ok": False,
            "error": {
                "code": "EVERY_NTH_CONFIG_INVALID", "field": "nth_item_number",
                "detail": "nth_item_number must be an integer ≥ 2",
            },
        }
    if n < 2:
        return {
            "ok": False,
            "error": {
                "code": "EVERY_NTH_CONFIG_INVALID", "field": "nth_item_number",
                "detail": "nth_item_number must be ≥ 2 (Nth=1 is meaningless).",
            },
        }

    # Benefit type must be free / percentage / flat.
    bt = _v3c_resolve_benefit_type(coupon)
    if bt not in _V3C_BENEFIT_TYPES:
        return {
            "ok": False,
            "error": {
                "code": "UNSUPPORTED_NTH_BENEFIT_TYPE", "field": "nth_discount_type",
                "detail": f"Benefit type {bt!r} not supported (allowed: free / percentage / flat).",
            },
        }
    # percentage / flat require a positive nth_discount_value.
    if bt in ("percentage", "flat"):
        bv = _v3c_resolve_benefit_value(coupon)
        if bv is None or bv <= 0:
            return {
                "ok": False,
                "error": {
                    "code": "EVERY_NTH_CONFIG_INVALID", "field": "nth_discount_value",
                    "detail": f"nth_discount_value required and > 0 for {bt} benefit.",
                },
            }

    # At least one eligibility list must be configured.
    el = _v3c_resolve_eligibility_lists(coupon)
    if not (el["food_ids"] or el["item_ids"] or el["category_ids"] or el["category_names"]):
        return {
            "ok": False,
            "error": {
                "code": "EVERY_NTH_CONFIG_INVALID", "field": "eligible_food_ids",
                "detail": "At least one eligibility list (eligible_food_ids / eligible_item_ids / eligible_category_ids / eligible_category_names) is required.",
            },
        }
    return None


def _v3c_compute_discount(coupon: dict, items: Optional[list]) -> dict:
    """Core V3-C engine. Returns success dict or error dict.

    Math: applications = floor(eligible_total_qty / nth_item_number), then
    capped by max_applications and allow_repeat. Benefit units selected from
    the eligible pool (cheapest by default; apply_to_highest_item overrides).
    Per-unit benefit math reuses V3-B semantics:
      free → unit_price
      percentage → min(unit_price × v / 100, unit_price)
      flat → min(v, unit_price)
    """
    # Cart presence.
    if items is None or len(items) == 0:
        out = {
            "ok": False,
            "error": {
                "code": "MISSING_ITEMS_FOR_EVERY_NTH_COUPON", "field": "items",
                "detail": "Every-Nth coupons require items[] at validate time (no auto-add).",
            },
        }
        inst = coupon.get("pos_instruction")
        if inst:
            out["pos_instruction"] = str(inst)
        return out

    # Config sanity.
    cfg_err = _v3c_validate_config(coupon)
    if cfg_err is not None:
        return cfg_err

    n = int(coupon.get("nth_item_number") or 0)
    el = _v3c_resolve_eligibility_lists(coupon)

    # Match cart lines (reuses V3-B helper); honor V2 excluded lists.
    matched_lines: list = []
    for ln in items:
        if not isinstance(ln, dict):
            continue
        if not _v3b_line_matches_lists(ln, el):
            continue
        if _line_is_excluded(ln, coupon):
            continue
        matched_lines.append(ln)

    if not matched_lines:
        out = {
            "ok": False,
            "error": {
                "code": "NO_ELIGIBLE_NTH_ITEMS_IN_CART", "field": "eligible_food_ids",
                "detail": "Cart contains no items eligible for this every-Nth offer.",
            },
        }
        inst = coupon.get("pos_instruction")
        if inst:
            out["pos_instruction"] = str(inst)
        return out

    units = _v3b_expand_units(matched_lines)
    eligible_total = len(units)

    if eligible_total < n:
        out = {
            "ok": False,
            "error": {
                "code": "NTH_REQUIREMENT_NOT_MET", "field": "nth_item_number",
                "detail": f"Add {n - eligible_total} more eligible item(s) to qualify.",
            },
        }
        inst = coupon.get("pos_instruction")
        if inst:
            out["pos_instruction"] = str(inst)
        return out

    applications = eligible_total // n
    applications = _v3b_apply_caps(applications, coupon)
    if applications <= 0:
        out = {
            "ok": False,
            "error": {
                "code": "NTH_REQUIREMENT_NOT_MET", "field": "nth_item_number",
                "detail": "Application caps reduced eligibility to zero.",
            },
        }
        inst = coupon.get("pos_instruction")
        if inst:
            out["pos_instruction"] = str(inst)
        return out

    # Select `applications` benefit units (1 per application). V3-B helper
    # honors apply_to_cheapest_item (default cheapest) / apply_to_highest_item.
    selected = _v3b_select_get_units(units, applications, coupon)

    # Compute discount.
    bt = _v3c_resolve_benefit_type(coupon)
    bv = _v3c_resolve_benefit_value(coupon) or 0.0
    bi_map: dict = {}
    total_discount = 0.0
    for u in selected:
        up = float(u["unit_price"])
        if bt == "free":
            line_disc = up
        elif bt == "percentage":
            line_disc = round(up * bv / 100.0, 2)
            if line_disc > up:
                line_disc = up
        else:  # flat
            line_disc = min(bv, up)
        line_disc = max(0.0, round(line_disc, 2))
        total_discount += line_disc
        key = (u.get("food_id"), u.get("item_id"), u.get("name"))
        if key not in bi_map:
            bi_map[key] = {
                "food_id": u.get("food_id"),
                "item_id": u.get("item_id"),
                "name": u.get("name"),
                "quantity": 0, "unit_price": up, "line_discount": 0.0,
            }
        bi_map[key]["quantity"] += 1
        bi_map[key]["line_discount"] += line_disc

    # Coupon-level max_discount ceiling, scaling benefit_items proportionally.
    max_disc = coupon.get("max_discount")
    if max_disc is not None:
        try:
            mdc = float(max_disc)
            if total_discount > mdc:
                scale = mdc / total_discount if total_discount > 0 else 0.0
                for v in bi_map.values():
                    v["line_discount"] = round(v["line_discount"] * scale, 2)
                total_discount = mdc
        except (TypeError, ValueError):
            pass

    total_discount = round(max(0.0, total_discount), 2)
    eligible_subtotal = round(sum(float(u["unit_price"]) for u in selected), 2)

    benefit_items = [
        {
            "food_id": v["food_id"], "item_id": v["item_id"], "name": v["name"],
            "quantity": int(v["quantity"]),
            "unit_price": round(float(v["unit_price"]), 2),
            "line_discount": round(float(v["line_discount"]), 2),
        }
        for v in bi_map.values()
    ]

    return {
        "ok": True,
        "computed_discount": total_discount,
        "eligible_subtotal": eligible_subtotal,
        "applied_applications": int(applications),
        "benefit_items": benefit_items,
        "eligible_match_summary": _v3b_summarise_lines(matched_lines),
        "offer_type": "nth_item",
        "nth_item_number": n,
        "nth_discount_type": bt,
        "nth_discount_value": (
            _v3c_resolve_benefit_value(coupon) if bt in ("percentage", "flat") else None
        ),
        "max_applications": coupon.get("max_applications"),
        "allow_repeat": coupon.get("allow_repeat") if coupon.get("allow_repeat") is not None else True,
    }


def build_eligible_match_hint(coupon: dict) -> Optional[dict]:
    """Hint for POS UX. Returns None for plain order-scope coupons.

    CR-001C-C V3-B: BOGO/BXG coupons return a {"buy": {...}, "get": {...}}
    shape (Q8=B — informational summary, not allocation).

    CR-001C-C V3-C: Every-Nth coupons return a {"kind":"nth_item",
    "nth_item_number":N, "eligibility":{...}, "nth_discount_type":..,
    "nth_discount_value":..} shape.
    """
    # CR-001C-C V3-C — Every-Nth hint (precedence over V3-B because nth_item is
    # its own offer_type, never returned by _v3b_normalize_offer_type).
    if _v3c_normalize_offer_type(coupon.get("offer_type")) is not None:
        el = _v3c_resolve_eligibility_lists(coupon)

        def _hint(lists):
            if lists["food_ids"]:
                return {"type": "food_ids", "values": [_to_str(x) for x in lists["food_ids"]]}
            if lists["item_ids"]:
                return {"type": "item_ids", "values": [_to_str(x) for x in lists["item_ids"]]}
            if lists["category_names"]:
                return {"type": "category_names", "values": [_to_str(x) for x in lists["category_names"]]}
            if lists["category_ids"]:
                return {"type": "category_ids", "values": [_to_str(x) for x in lists["category_ids"]]}
            return {"type": "any", "values": []}

        return {
            "kind": "nth_item",
            "nth_item_number": int(coupon.get("nth_item_number") or 0) or None,
            "eligibility": _hint(el),
            "nth_discount_type": coupon.get("nth_discount_type") or coupon.get("get_discount_type") or "free",
            "nth_discount_value": coupon.get("nth_discount_value")
            if coupon.get("nth_discount_value") is not None
            else coupon.get("get_discount_value"),
        }

    offer_type = _v3b_normalize_offer_type(coupon.get("offer_type"))
    if offer_type is not None:
        bl = _v3b_resolve_buy_lists(coupon)
        same_item_flag = coupon.get("same_item_required")
        if same_item_flag is None:
            same_item = (offer_type == "bogo") and _v3b_lists_empty(_v3b_get_get_lists(coupon))
        else:
            same_item = bool(same_item_flag)
        gl = _v3b_resolve_get_lists(coupon, bl, same_item)

        def _hint(lists):
            if lists["food_ids"]:
                return {"type": "food_ids", "values": [_to_str(x) for x in lists["food_ids"]]}
            if lists["item_ids"]:
                return {"type": "item_ids", "values": [_to_str(x) for x in lists["item_ids"]]}
            if lists["category_names"]:
                return {"type": "category_names", "values": [_to_str(x) for x in lists["category_names"]]}
            if lists["category_ids"]:
                return {"type": "category_ids", "values": [_to_str(x) for x in lists["category_ids"]]}
            return {"type": "any", "values": []}

        return {
            "kind": offer_type,
            "buy_quantity": int(coupon.get("buy_quantity") or 1),
            "get_quantity": int(coupon.get("get_quantity") or 1),
            "buy": _hint(bl),
            "get": _hint(gl) if not same_item else _hint(bl),
            "same_item_required": bool(same_item),
            "get_discount_type": (coupon.get("get_discount_type") or "free"),
            "get_discount_value": coupon.get("get_discount_value"),
        }
    scope = resolve_discount_scope(coupon)
    if scope == _SCOPE_ITEM:
        if coupon.get("eligible_food_ids"):
            return {"type": "food_ids", "values": [_to_str(x) for x in coupon["eligible_food_ids"]]}
        if coupon.get("eligible_item_ids"):
            return {"type": "item_ids", "values": [_to_str(x) for x in coupon["eligible_item_ids"]]}
        return {"type": "item_ids", "values": []}
    if scope == _SCOPE_CATEGORY:
        if coupon.get("eligible_category_names"):
            return {"type": "category_names", "values": [_to_str(x) for x in coupon["eligible_category_names"]]}
        if coupon.get("eligible_category_ids"):
            return {"type": "category_ids", "values": [_to_str(x) for x in coupon["eligible_category_ids"]]}
        return {"type": "category_ids", "values": []}
    return None


# ---------------------------------------------------------------------------
# CR-001C-C V3-A — time-window / happy-hour helpers
# ---------------------------------------------------------------------------
def _v3a_parse_hhmm(s: Optional[str]) -> Optional[_dtime]:
    if not s or not isinstance(s, str):
        return None
    try:
        hh, mm = s.split(":", 1)
        return _dtime(int(hh), int(mm))
    except (ValueError, TypeError):
        return None


def _v3a_load_zoneinfo(name: Optional[str]):
    """Returns a ZoneInfo or None when name absent/invalid (does NOT raise)."""
    if not name:
        return None
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(str(name))
    except Exception as exc:  # noqa: BLE001 — defensive at read time
        logger.warning("coupon_timezone_unresolvable name=%s err=%s", name, exc)
        return None


async def _v3a_resolve_effective_tz_no_coupon(db, user_id: str) -> tuple:
    """Resolve user-level timezone fallback (Steps 2-4 of _v3a_resolve_effective_tz).
    Used as a precomputed input for list_available_coupons to avoid N+1 user lookups.
    The per-coupon `timezone` override (Step 1) stays inline at the call site —
    no DB hit, just a string parse.
    Returns (ZoneInfo, tz_name_str, tz_fallback_marker_or_None).
    """
    user_doc = None
    if db is not None and user_id:
        try:
            user_doc = await db.users.find_one(
                {"id": user_id}, {"_id": 0, "settings": 1}
            )
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.warning("coupon_user_lookup_failed user_id=%s err=%s", user_id, exc)
    if user_doc:
        rtz_name = ((user_doc.get("settings") or {}).get("timezone")) or None
        rtz = _v3a_load_zoneinfo(rtz_name)
        if rtz is not None:
            return rtz, str(rtz_name), None
    default_tz = _v3a_load_zoneinfo(COUPON_DEFAULT_TIMEZONE)
    if default_tz is not None:
        return default_tz, COUPON_DEFAULT_TIMEZONE, None
    logger.warning("coupon_timezone_fallback_to_utc")
    return timezone.utc, "UTC", "utc"


async def _v3a_resolve_effective_tz(db, coupon: dict, user_id: str) -> tuple:
    """Resolve timezone per OQ-V3-5 chain:
        1. coupon.timezone
        2. users.settings.timezone (restaurant doc)
        3. COUPON_DEFAULT_TIMEZONE ("Asia/Kolkata")
        4. UTC with tz_fallback="utc"
    Returns (ZoneInfo, tz_name_str, tz_fallback_marker_or_None).
    """
    # Step 1
    tz = _v3a_load_zoneinfo(coupon.get("timezone"))
    if tz is not None:
        return tz, str(coupon.get("timezone")), None
    # Step 2
    user_doc = None
    if db is not None and user_id:
        try:
            user_doc = await db.users.find_one(
                {"id": user_id}, {"_id": 0, "settings": 1}
            )
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.warning("coupon_user_lookup_failed user_id=%s err=%s", user_id, exc)
    if user_doc:
        rtz_name = ((user_doc.get("settings") or {}).get("timezone")) or None
        rtz = _v3a_load_zoneinfo(rtz_name)
        if rtz is not None:
            return rtz, str(rtz_name), None
    # Step 3
    default_tz = _v3a_load_zoneinfo(COUPON_DEFAULT_TIMEZONE)
    if default_tz is not None:
        return default_tz, COUPON_DEFAULT_TIMEZONE, None
    # Step 4
    logger.warning("coupon_timezone_fallback_to_utc")
    return timezone.utc, "UTC", "utc"


def _v3a_has_window(coupon: dict) -> bool:
    """True if the coupon defines either valid_days or a complete daily window."""
    vd = coupon.get("valid_days")
    has_days = bool(vd) and len(list(vd)) > 0
    s = _v3a_parse_hhmm(coupon.get("start_time"))
    e = _v3a_parse_hhmm(coupon.get("end_time"))
    has_time = (s is not None) and (e is not None)
    return has_days or has_time


def _v3a_compute_next_window_start(coupon: dict, now_local: datetime, tz_obj) -> Optional[str]:
    """Walk forward up to 8 days to find the next window start. Returns ISO UTC or None.
    Honors end_date if set (returns None if next start is after expiry)."""
    vd = list(coupon.get("valid_days") or [])
    s = _v3a_parse_hhmm(coupon.get("start_time"))
    end_iso = coupon.get("end_date") or coupon.get("valid_until") or coupon.get("expires_at")

    for offset in range(0, 8):
        candidate_local_date = (now_local + timedelta(days=offset)).date()
        weekday = candidate_local_date.weekday()
        if vd and weekday not in vd:
            continue
        start_time_obj = s if s is not None else _dtime(0, 0)
        candidate_local_dt = datetime.combine(candidate_local_date, start_time_obj, tzinfo=tz_obj)
        if candidate_local_dt <= now_local:
            continue  # today's window already started
        if end_iso:
            try:
                if candidate_local_dt.astimezone(timezone.utc).isoformat() > end_iso:
                    logger.info("coupon_window_after_expiry code=%s", coupon.get("code"))
                    return None
            except Exception:  # noqa: BLE001
                pass
        return candidate_local_dt.astimezone(timezone.utc).isoformat()
    return None


def _v3a_is_within_time_window(
    coupon: dict, now_utc: datetime, tz_obj, tz_name: str, tz_fallback: Optional[str],
    pos_supplied_order_time: Optional[str] = None,
) -> tuple[bool, dict]:
    """Returns (within_window, status_dict).
    `status_dict` is always emitted (per OQ-V3A-1).
    """
    now_local = now_utc.astimezone(tz_obj)
    has_days = bool(coupon.get("valid_days"))
    s = _v3a_parse_hhmm(coupon.get("start_time"))
    e = _v3a_parse_hhmm(coupon.get("end_time"))
    has_time = (s is not None) and (e is not None)

    status: dict = {
        "configured": has_days or has_time,
        "within_window": True,
        "server_time_used": now_local.isoformat(),
        "tz": tz_name,
        "tz_fallback": tz_fallback,
        "valid_days": list(coupon.get("valid_days") or []) if has_days else None,
        "start_time": coupon.get("start_time") if has_time else None,
        "end_time": coupon.get("end_time") if has_time else None,
        "next_window_start": None,
        "pos_supplied_order_time": pos_supplied_order_time,
    }

    if not status["configured"]:
        return True, status

    now_time = now_local.time()
    overnight = has_time and (e <= s)

    # Step 1: valid_days
    if has_days:
        if overnight and now_time < e:
            window_owning_day = (now_local.weekday() - 1) % 7
        else:
            window_owning_day = now_local.weekday()
        if window_owning_day not in coupon["valid_days"]:
            status["within_window"] = False
            status["next_window_start"] = _v3a_compute_next_window_start(coupon, now_local, tz_obj)
            return False, status

    # Step 2: daily time window
    if has_time:
        if not overnight:
            within_today = (s <= now_time < e)
        else:
            within_today = (now_time >= s) or (now_time < e)
        if not within_today:
            status["within_window"] = False
            status["next_window_start"] = _v3a_compute_next_window_start(coupon, now_local, tz_obj)
            return False, status

    return True, status


# ---------------------------------------------------------------------------
# Validation — single source of truth
# ---------------------------------------------------------------------------
async def validate_coupon_for_customer(
    db,
    *,
    user_id: str,
    code: str,
    customer_id: str,
    order_total: float,
    channel: str = "pos",
    loyalty_points_used: float = 0.0,
    items: Optional[list[dict]] = None,
    skip_cart_validation: bool = False,
    now_iso: Optional[str] = None,
    pos_supplied_order_time: Optional[str] = None,
    # CR-POS-PERF-1: optional precomputed inputs (used only by list_available_coupons
    # to amortise DB roundtrips across many coupons). Defaults preserve existing
    # behaviour for all 5 other call sites (POS validate / orders commit /
    # /pos/loyalty/redeem / /pos/max-redeemable / free-item dispatch).
    _precomputed_coupon: Optional[dict] = None,
    _precomputed_usage_count: Optional[int] = None,
    _precomputed_user_tz: Optional[tuple] = None,
) -> dict:
    """
    Returns either:
      {"ok": True, "coupon": <doc>, "computed_discount": <float | None>,
       "discount_scope": <str>, "eligible_subtotal": <float | None>,
       "matched_food_ids": [...], "matched_item_ids": [...],
       "matched_category_ids": [...], "matched_category_names": [...]}
    or:
      {"ok": False, "error": {"code": <str>, "field": <str|None>, "detail": <str>}}

    CR-001C-C V2: `items` is required for item/category-scope coupons unless
    `skip_cart_validation=True` (used by `list_available_coupons`).
    """
    now_iso = now_iso or _now_iso()
    code_upper = (code or "").strip().upper()

    if not code_upper:
        return {
            "ok": False,
            "error": {"code": "INVALID_CODE", "field": "code", "detail": "Coupon code is required"},
        }

    coupon = _precomputed_coupon if _precomputed_coupon is not None else await db.coupons.find_one(
        {"user_id": user_id, "code": code_upper},
        {"_id": 0},
    )
    if not coupon:
        return {
            "ok": False,
            "error": {"code": "INVALID_CODE", "field": "code", "detail": f"Invalid coupon code: {code_upper}"},
        }

    if not coupon.get("is_active", True):
        return {
            "ok": False,
            "error": {"code": "INACTIVE", "field": "is_active", "detail": "Coupon is inactive"},
        }

    start, end = _resolve_validity_window(coupon)
    if start and now_iso < start:
        return {
            "ok": False,
            "error": {"code": "INACTIVE", "field": "start_date", "detail": f"Coupon not yet active (starts {start})"},
        }
    if end and now_iso > end:
        return {
            "ok": False,
            "error": {"code": "EXPIRED", "field": "end_date", "detail": f"Coupon expired on {end}"},
        }

    # CR-001C-C V3-A — time-window / happy-hour pre-check.
    tw_status: Optional[dict] = None
    if _v3a_has_window(coupon):
        # CR-POS-PERF-1: prefer per-coupon timezone (no DB), then precomputed
        # user_tz tuple from the bulk caller, else fall back to per-call DB lookup.
        coupon_tz_override = _v3a_load_zoneinfo(coupon.get("timezone"))
        if coupon_tz_override is not None:
            tz_obj = coupon_tz_override
            tz_name = str(coupon.get("timezone"))
            tz_fallback = None
        elif _precomputed_user_tz is not None:
            tz_obj, tz_name, tz_fallback = _precomputed_user_tz
        else:
            tz_obj, tz_name, tz_fallback = await _v3a_resolve_effective_tz(db, coupon, user_id)
        now_utc = datetime.now(timezone.utc)
        within, tw_status = _v3a_is_within_time_window(
            coupon, now_utc, tz_obj, tz_name, tz_fallback, pos_supplied_order_time,
        )
        if not within:
            return {
                "ok": False,
                "error": {
                    "code": "OUTSIDE_TIME_WINDOW",
                    "field": "time_window",
                    "detail": (
                        f"Coupon not valid at current local time {tw_status['server_time_used']} ({tw_status['tz']})"
                    ),
                },
                "time_window_status": tw_status,
            }
    else:
        # Per OQ-V3A-1, emit a uniform status block even when no window configured.
        tw_status = {
            "configured": False,
            "within_window": True,
            "server_time_used": None,
            "tz": None,
            "tz_fallback": None,
            "valid_days": None,
            "start_time": None,
            "end_time": None,
            "next_window_start": None,
            "pos_supplied_order_time": pos_supplied_order_time,
        }

    usage_limit = coupon.get("usage_limit")
    total_used = int(coupon.get("total_used") or 0)
    if usage_limit and total_used >= int(usage_limit):
        return {
            "ok": False,
            "error": {"code": "USAGE_LIMIT_REACHED", "field": "usage_limit", "detail": "Coupon usage limit reached"},
        }

    per_user_limit = int(coupon.get("per_user_limit") or 1)
    if customer_id:
        # CR-POS-PERF-1: bulk caller may pass the already-aggregated count
        # (covers both user_id-tagged + legacy rows). Avoids 2 DB hits per coupon.
        if _precomputed_usage_count is not None:
            total_per_user = int(_precomputed_usage_count)
        else:
            per_user_count = await db.coupon_usage.count_documents(
                {"user_id": user_id, "coupon_id": coupon["id"], "customer_id": customer_id}
            )
            # Backward compat — legacy rows lack user_id; also count by coupon_id+customer_id.
            legacy_count = await db.coupon_usage.count_documents(
                {"coupon_id": coupon["id"], "customer_id": customer_id, "user_id": {"$exists": False}}
            )
            total_per_user = per_user_count + legacy_count
        if total_per_user >= per_user_limit:
            return {
                "ok": False,
                "error": {
                    "code": "CUSTOMER_USAGE_LIMIT_REACHED",
                    "field": "per_user_limit",
                    "detail": "Customer has already used this coupon the maximum times",
                },
            }

    min_order = float(coupon.get("min_order_value") or 0.0)
    if float(order_total or 0.0) < min_order:
        return {
            "ok": False,
            "error": {
                "code": "MIN_ORDER_NOT_MET",
                "field": "min_order_value",
                "detail": f"Minimum order value is Rs.{min_order}",
            },
        }

    channels = coupon.get("applicable_channels") or ["delivery", "takeaway", "dine_in", "pos"]
    # CR-001C-L-FIX: normalize POS channel aliases (e.g. "dinein" → "dine_in")
    _channel_aliases = {"dinein": "dine_in", "dine-in": "dine_in", "take_away": "takeaway", "take-away": "takeaway"}
    normalized_channel = _channel_aliases.get(channel, channel) if channel else channel
    if normalized_channel and normalized_channel not in channels:
        return {
            "ok": False,
            "error": {"code": "CHANNEL_NOT_VALID", "field": "applicable_channels", "detail": f"Coupon not valid for channel {normalized_channel}"},
        }

    specific = coupon.get("specific_users")
    if specific and customer_id not in specific:
        return {
            "ok": False,
            "error": {"code": "CUSTOMER_NOT_ELIGIBLE", "field": "specific_users", "detail": "Coupon not valid for this customer"},
        }

    stackable = bool(coupon.get("stackable_with_loyalty", False))
    if (loyalty_points_used or 0) > 0 and not stackable:
        return {
            "ok": False,
            "error": {
                "code": "STACKING_NOT_ALLOWED",
                "field": "stackable_with_loyalty",
                "detail": "Coupon cannot be combined with loyalty points",
            },
        }

    # Validate discount_type is V1-supported.
    # CR-001C-C V3-B / V3-C: BOGO/BXG/every_nth coupons may carry a placeholder
    # discount_type that V1 normalization rejects; skip strict check for them.
    _v3b_ot = _v3b_normalize_offer_type(coupon.get("offer_type"))
    _v3c_ot = _v3c_normalize_offer_type(coupon.get("offer_type"))
    if _v3b_ot is None and _v3c_ot is None:
        try:
            _normalize_discount_type(coupon.get("discount_type"))
        except ValueError as exc:
            return {
                "ok": False,
                "error": {"code": "INACTIVE", "field": "discount_type", "detail": str(exc)},
            }

    # CR-001C-C V2: scope-aware dispatch.
    scope = resolve_discount_scope(coupon)
    base_result = {
        "ok": True,
        "coupon": coupon,
        "discount_scope": scope,
        "matched_food_ids": [],
        "matched_item_ids": [],
        "matched_category_ids": [],
        "matched_category_names": [],
        # CR-001C-C V3-A — additive
        "offer_type": (coupon.get("offer_type") or "simple"),
        "time_window_status": tw_status,
        # CR-001C-C V3-B — additive (populated on V3-B branch)
        "applied_applications": None,
        "benefit_items": [],
        "buy_match_summary": [],
        "get_match_summary": [],
        "same_item_required": None,
        "get_discount_type": None,
        "max_applications": None,
        "allow_repeat": None,
        # CR-001C-C V3-C — additive (populated on V3-C branch)
        "nth_item_number": None,
        "nth_discount_type": None,
        "nth_discount_value": None,
        "eligible_match_summary": [],
    }

    # CR-001C-C V3-C — Every-Nth branch (mirrors V3-B branch shape).
    if _v3c_ot is not None:
        if skip_cart_validation:
            base_result["computed_discount"] = None
            base_result["eligible_subtotal"] = None
            base_result["offer_type"] = "nth_item"
            base_result["nth_item_number"] = coupon.get("nth_item_number")
            base_result["nth_discount_type"] = _v3c_resolve_benefit_type(coupon)
            base_result["nth_discount_value"] = _v3c_resolve_benefit_value(coupon)
            return base_result
        v3c = _v3c_compute_discount(coupon, items)
        if not v3c["ok"]:
            ret = {"ok": False, "error": v3c["error"]}
            if v3c.get("pos_instruction"):
                ret["pos_instruction"] = v3c["pos_instruction"]
            if tw_status is not None:
                ret["time_window_status"] = tw_status
            return ret
        base_result.update({
            "computed_discount": v3c["computed_discount"],
            "eligible_subtotal": v3c["eligible_subtotal"],
            "applied_applications": v3c["applied_applications"],
            "benefit_items": v3c["benefit_items"],
            "eligible_match_summary": v3c["eligible_match_summary"],
            "offer_type": v3c["offer_type"],
            "nth_item_number": v3c["nth_item_number"],
            "nth_discount_type": v3c["nth_discount_type"],
            "nth_discount_value": v3c["nth_discount_value"],
            "max_applications": v3c["max_applications"],
            "allow_repeat": v3c["allow_repeat"],
        })
        return base_result

    # CR-001C-C V3-B — BOGO / Buy-X-Get-Y branch overrides V1/V2 scope compute.
    if _v3b_ot is not None:
        if skip_cart_validation:
            # Listing context — leave compute null and let caller surface
            # requires_cart_validation=True with hint.
            base_result["computed_discount"] = None
            base_result["eligible_subtotal"] = None
            return base_result
        v3b = _v3b_compute_discount(coupon, _v3b_ot, items)
        if not v3b["ok"]:
            ret = {"ok": False, "error": v3b["error"]}
            if v3b.get("pos_instruction"):
                ret["pos_instruction"] = v3b["pos_instruction"]
            # Surface time_window_status alongside V3-B failures for parity with V3-A.
            if tw_status is not None:
                ret["time_window_status"] = tw_status
            return ret
        base_result.update({
            "computed_discount": v3b["computed_discount"],
            "eligible_subtotal": v3b["eligible_subtotal"],
            "applied_applications": v3b["applied_applications"],
            "benefit_items": v3b["benefit_items"],
            "buy_match_summary": v3b["buy_match_summary"],
            "get_match_summary": v3b["get_match_summary"],
            "same_item_required": v3b["same_item_required"],
            "offer_type": v3b["offer_type"],
            "get_discount_type": v3b["get_discount_type"],
            "max_applications": v3b["max_applications"],
            "allow_repeat": v3b["allow_repeat"],
        })
        return base_result

    if scope == _SCOPE_ORDER:
        base_result["computed_discount"] = compute_coupon_discount(coupon, order_total)
        base_result["eligible_subtotal"] = float(order_total or 0.0)
        return base_result

    # Item or category scope.
    if skip_cart_validation:
        # Listing context — caller doesn't have cart. Skip cart math.
        base_result["computed_discount"] = None
        base_result["eligible_subtotal"] = None
        return base_result

    v2 = _compute_v2_discount(coupon, scope, items)
    if not v2["ok"]:
        return v2
    base_result.update({
        "computed_discount": v2["computed_discount"],
        "eligible_subtotal": v2["eligible_subtotal"],
        "matched_food_ids": v2["matched_food_ids"],
        "matched_item_ids": v2["matched_item_ids"],
        "matched_category_ids": v2["matched_category_ids"],
        "matched_category_names": v2["matched_category_names"],
    })
    return base_result


# ---------------------------------------------------------------------------
# Listing — `GET /api/pos/coupons/available`
# ---------------------------------------------------------------------------
async def list_available_coupons(
    db,
    *,
    user_id: str,
    customer_id: str,
    order_total: float,
    channel: str = "pos",
    now_iso: Optional[str] = None,
) -> list[dict]:
    """Returns coupons currently eligible for this customer + order_total.
    CR-001C-C V2: item/category-scope coupons are returned with
    `requires_cart_validation=true` and `expected_discount=null`.
    Order-scope coupons retain V1 behavior with computed preview.

    CR-POS-PERF-1: bulk-prefetch pattern.
      Before: N+1 — each coupon triggered re-fetch of coupon doc + user doc +
              2× coupon_usage count_documents. With 25 coupons + 0 usage rows
              on R689, this cost ~50 wasted DB roundtrips → ~16.7 s.
      After:  3 bulk reads — coupons.find().to_list() + users.find_one() (only
              if any V3-A coupon present) + coupon_usage.aggregate() grouped by
              coupon_id. Loop is DB-free. Target ~0.65 s.
    Response shape is IDENTICAL — verified via jq -S diff. See plan
    /app/memory/crm/crm_1_0/planning/CR_POS_PERF_1_LIST_AVAILABLE_COUPONS_N1_FIX_PLAN.md §0.
    """
    now_iso = now_iso or _now_iso()

    # ── Bulk pre-fetch #1: coupons (replaces the streaming cursor) ──────────
    coupons_docs = await db.coupons.find(
        {"user_id": user_id, "is_active": True}, {"_id": 0}
    ).to_list(length=None)

    # ── Bulk pre-fetch #2: user_tz (only if any V3-A coupon present) ───────
    user_tz_tuple: Optional[tuple] = None
    if any(_v3a_has_window(c) for c in coupons_docs):
        user_tz_tuple = await _v3a_resolve_effective_tz_no_coupon(db, user_id)

    # ── Bulk pre-fetch #3: coupon_usage counts grouped by coupon_id ────────
    # Covers both the regular (user_id-tagged) and legacy (no user_id) rows
    # via a single $or match. Index idx_user_coupon_customer covers the
    # (user_id, coupon_id, customer_id) prefix; legacy rows are rare (~0).
    usage_map: dict[str, int] = {}
    if customer_id:
        pipeline = [
            {"$match": {"customer_id": customer_id, "$or": [
                {"user_id": user_id},
                {"user_id": {"$exists": False}},
            ]}},
            {"$group": {"_id": "$coupon_id", "count": {"$sum": 1}}},
        ]
        async for row in db.coupon_usage.aggregate(pipeline):
            cid = row.get("_id")
            if cid is not None:
                usage_map[cid] = int(row.get("count", 0))

    eligible: list[dict] = []
    for c in coupons_docs:
        v = await validate_coupon_for_customer(
            db,
            user_id=user_id,
            code=c.get("code", ""),
            customer_id=customer_id,
            order_total=order_total,
            channel=channel,
            loyalty_points_used=0.0,
            skip_cart_validation=True,
            now_iso=now_iso,
            _precomputed_coupon=c,
            _precomputed_usage_count=usage_map.get(c.get("id"), 0) if customer_id else None,
            _precomputed_user_tz=user_tz_tuple,
        )
        outside_window = (
            (not v["ok"])
            and (v.get("error") or {}).get("code") == "OUTSIDE_TIME_WINDOW"
        )
        if not v["ok"] and not outside_window:
            continue
        coupon = c  # use original doc when outside_window (v has no `coupon`)
        if v["ok"]:
            coupon = v["coupon"]
        scope = v.get("discount_scope") or resolve_discount_scope(coupon)
        start, end = _resolve_validity_window(coupon)
        v3b_ot = _v3b_normalize_offer_type(coupon.get("offer_type"))
        v3c_ot = _v3c_normalize_offer_type(coupon.get("offer_type"))
        requires_cart = (scope in (_SCOPE_ITEM, _SCOPE_CATEGORY)) or (v3b_ot is not None) or (v3c_ot is not None)

        # CR-001C-C V3-A: build time_window block per coupon (always emitted).
        tw_status = v.get("time_window_status")
        if outside_window:
            # Status block carried on the error envelope.
            tw_status = v.get("time_window_status") or {}
        configured = bool(tw_status and tw_status.get("configured"))
        time_window_block = {
            "configured": configured,
            "within_window_now": bool(tw_status.get("within_window")) if configured else True,
            "valid_days": tw_status.get("valid_days") if configured else None,
            "start_time": tw_status.get("start_time") if configured else None,
            "end_time": tw_status.get("end_time") if configured else None,
            "tz": tw_status.get("tz") if configured else None,
            "tz_fallback": tw_status.get("tz_fallback") if configured else None,
            "next_window_start": tw_status.get("next_window_start") if configured else None,
        }

        # For outside-window coupons we still compute informational expected_discount
        # for order-scope ("you'd save ₹X from 3 PM"). For item/category scopes the
        # cart-aware compute stays gated by requires_cart_validation.
        if outside_window and scope == _SCOPE_ORDER and v3b_ot is None and v3c_ot is None:
            expected_discount = compute_coupon_discount(coupon, order_total)
            final_amount_preview = round(float(order_total or 0.0) - float(expected_discount or 0.0), 2)
        elif requires_cart:
            expected_discount = None
            final_amount_preview = None
        else:
            expected_discount = v.get("computed_discount")
            final_amount_preview = round(float(order_total or 0.0) - float(expected_discount or 0.0), 2)

        eligible.append(
            {
                "id": coupon["id"],
                "code": coupon["code"],
                "title": coupon.get("title") or coupon.get("description"),
                "coupon_type": coupon.get("coupon_type", "order"),
                "discount_scope": scope,
                "discount_type": coupon["discount_type"],
                "discount_value": coupon["discount_value"],
                "min_order_value": coupon.get("min_order_value", 0.0),
                "max_discount": coupon.get("max_discount"),
                "expected_discount": expected_discount,
                "final_amount_preview": final_amount_preview,
                "requires_cart_validation": requires_cart,
                "eligible_match_hint": build_eligible_match_hint(coupon),
                "stackable_with_loyalty": bool(coupon.get("stackable_with_loyalty", False)),
                "valid_from": start,
                "valid_until": end,
                # CR-001C-C V3-A additions
                "offer_type": (coupon.get("offer_type") or "simple"),
                "time_window": time_window_block,
                # CR-001C-C V3-B additions (None / empty when not a V3-B coupon)
                "buy_quantity": coupon.get("buy_quantity"),
                "get_quantity": coupon.get("get_quantity"),
                "get_discount_type": coupon.get("get_discount_type"),
                "get_discount_value": coupon.get("get_discount_value"),
                "max_applications": coupon.get("max_applications"),
                "allow_repeat": coupon.get("allow_repeat"),
                "same_item_required": coupon.get("same_item_required"),
                "pos_instruction": coupon.get("pos_instruction"),
                # CR-001C-C V3-C additions
                "nth_item_number": coupon.get("nth_item_number"),
                "nth_discount_type": coupon.get("nth_discount_type"),
                "nth_discount_value": coupon.get("nth_discount_value"),
            }
        )
    return eligible


# ---------------------------------------------------------------------------
# Final-commit recording (idempotent on (user_id, order_id))
# ---------------------------------------------------------------------------
def _within_tolerance(pos_sent: float, crm_computed: float) -> bool:
    abs_tol = max(COUPON_VARIANCE_ABS_TOLERANCE, COUPON_VARIANCE_REL_TOLERANCE * max(crm_computed, 0.0))
    return abs(float(pos_sent) - float(crm_computed)) <= abs_tol


async def record_coupon_usage_for_order(
    db,
    *,
    user_id: str,
    restaurant_id: Optional[str],
    customer_id: str,
    code: str,
    order_id: str,
    pos_order_id: Optional[str],
    order_total: float,
    coupon_discount_from_pos: float,
    channel: str = "pos",
    source: str = "pos_orders",
    loyalty_points_used: float = 0.0,
    coupon_title: Optional[str] = None,
    coupon_type: Optional[str] = None,
    items: Optional[list[dict]] = None,
    now_iso: Optional[str] = None,
) -> dict:
    """
    Final-commit recording. Returns:
      {"ok": True, "recorded": True, "usage_id": str, "idempotent_replay": False, ...}
      {"ok": True, "recorded": False, "idempotent_replay": True, ...} on replay
      {"ok": False, "error": {...}, "recorded": False} on validation failure
    Never raises. Caller is responsible for not blocking the order on failure.

    CR-001C-C V2: `items` is required for item/category-scope coupons.
    """
    now_iso = now_iso or _now_iso()
    code_upper = (code or "").strip().upper()

    if not code_upper:
        logger.warning(
            "coupon_missing_code_at_final_order user_id=%s order_id=%s pos_order_id=%s",
            user_id, order_id, pos_order_id,
        )
        return {"ok": False, "recorded": False, "error": {"code": "INVALID_CODE", "field": "code", "detail": "Coupon code missing"}}

    if not order_id:
        return {"ok": False, "recorded": False, "error": {"code": "INVALID_CODE", "field": "order_id", "detail": "order_id required for idempotency"}}

    if float(coupon_discount_from_pos or 0.0) == 0.0:
        logger.warning(
            "coupon_zero_discount_skipped user_id=%s order_id=%s pos_order_id=%s code=%s",
            user_id, order_id, pos_order_id, code_upper,
        )
        return {"ok": False, "recorded": False, "error": {"code": "INACTIVE", "field": "coupon_discount", "detail": "POS-sent coupon_discount is 0; not recorded"}}

    # Optional coupon_type guardrail — V2 now accepts order/item/category.
    if coupon_type:
        try:
            normalize_coupon_type(coupon_type)
        except ValueError as exc:
            logger.warning(
                "coupon_invalid_type user_id=%s order_id=%s code=%s coupon_type=%s detail=%s",
                user_id, order_id, code_upper, coupon_type, str(exc),
            )
            return {
                "ok": False,
                "recorded": False,
                "error": {"code": "INACTIVE", "field": "coupon_type", "detail": str(exc)},
            }

    # Server-side guardrail validation — cart-aware for V2 scopes.
    v = await validate_coupon_for_customer(
        db,
        user_id=user_id,
        code=code_upper,
        customer_id=customer_id,
        order_total=order_total,
        channel=channel,
        loyalty_points_used=loyalty_points_used,
        items=items,
        now_iso=now_iso,
    )
    if not v["ok"]:
        err = v["error"]
        logger.warning(
            "coupon_validation_failed_at_final_order user_id=%s pos_order_id=%s order_id=%s "
            "customer_id=%s coupon_code=%s error_code=%s error_field=%s reason=%s",
            user_id, pos_order_id, order_id, customer_id, code_upper,
            err.get("code"), err.get("field"), err.get("detail"),
        )
        ret = {"ok": False, "recorded": False, "error": err}
        # CR-001C-C V3-A — surface time_window_status when present.
        if v.get("time_window_status") is not None:
            ret["time_window_status"] = v["time_window_status"]
        # CR-001C-C V3-B — surface pos_instruction (Q11=B: failure-only).
        if v.get("pos_instruction"):
            ret["pos_instruction"] = v["pos_instruction"]
        return ret

    coupon = v["coupon"]
    crm_computed = v["computed_discount"]
    pos_sent = round(float(coupon_discount_from_pos or 0.0), 2)
    scope = v.get("discount_scope", "order")
    eligible_subtotal = v.get("eligible_subtotal")
    # CR-001C-C V3-A — pull snapshot from validation result.
    v3a_offer_type = (v.get("offer_type") or "simple")
    v3a_tw_status = v.get("time_window_status")
    # CR-001C-C V3-B — pull bxgy snapshot from validation result (None when not V3-B).
    v3b_applied_apps = v.get("applied_applications")
    v3b_benefit_items = v.get("benefit_items") or []
    v3b_buy_summary = v.get("buy_match_summary") or []
    v3b_get_summary = v.get("get_match_summary") or []
    v3b_same_item = v.get("same_item_required")
    v3b_get_disc_type = v.get("get_discount_type")
    v3b_max_apps = v.get("max_applications")
    v3b_allow_repeat = v.get("allow_repeat")
    # CR-001C-C V3-C — pull every-Nth snapshot.
    v3c_nth_num = v.get("nth_item_number")
    v3c_nth_dtype = v.get("nth_discount_type")
    v3c_nth_dvalue = v.get("nth_discount_value")
    v3c_elig_match = v.get("eligible_match_summary") or []

    if crm_computed is not None and not _within_tolerance(pos_sent, crm_computed):
        logger.warning(
            "coupon_amount_variance user_id=%s pos_order_id=%s order_id=%s code=%s "
            "scope=%s pos_sent=%s crm_computed=%s",
            user_id, pos_order_id, order_id, code_upper, scope, pos_sent, crm_computed,
        )
    discount_mismatch = bool(
        crm_computed is not None and not _within_tolerance(pos_sent, crm_computed)
    )

    # Idempotent upsert keyed on (user_id, order_id).
    usage_id = str(uuid.uuid4())
    usage_doc = {
        "id": usage_id,
        "user_id": user_id,
        "restaurant_id": restaurant_id,
        "customer_id": customer_id,
        "coupon_id": coupon["id"],
        "coupon_code": code_upper,
        "coupon_title": coupon_title or coupon.get("title") or coupon.get("description"),
        "coupon_type": scope,  # CR-001C-C V2: denormalize scope
        "discount_scope": scope,
        "order_id": order_id,
        "pos_order_id": pos_order_id,
        "order_total": round(float(order_total or 0.0), 2),
        "coupon_discount": pos_sent,
        "crm_computed_discount": crm_computed,
        "discount_type": coupon.get("discount_type"),
        "discount_value": coupon.get("discount_value"),
        "channel": channel,
        "source": source,
        # V2 eligibility audit trail.
        "eligible_subtotal": eligible_subtotal,
        "eligible_food_ids": v.get("matched_food_ids") or [],
        "eligible_item_ids": v.get("matched_item_ids") or [],
        "eligible_category_ids": v.get("matched_category_ids") or [],
        "eligible_category_names": v.get("matched_category_names") or [],
        # Legacy compat fields.
        "order_value": round(float(order_total or 0.0), 2),
        "discount_applied": pos_sent,
        "used_at": now_iso,
        "created_at": now_iso,
        # CR-001C-C V3-A — additive
        "offer_type": v3a_offer_type,
        "time_window_status": v3a_tw_status,
        # CR-001C-C V3-B — additive (only populated when validation ran the V3-B branch)
        "buy_quantity": coupon.get("buy_quantity"),
        "get_quantity": coupon.get("get_quantity"),
        "applied_applications": v3b_applied_apps,
        "benefit_items": v3b_benefit_items,
        "buy_match_summary": v3b_buy_summary,
        "get_match_summary": v3b_get_summary,
        "same_item_required": v3b_same_item,
        "get_discount_type": v3b_get_disc_type,
        "max_applications": v3b_max_apps,
        "allow_repeat": v3b_allow_repeat,
        "pos_instruction": coupon.get("pos_instruction"),
        "computed_discount": crm_computed,
        "discount_mismatch": discount_mismatch,
        # CR-001C-C V3-C — additive
        "nth_item_number": v3c_nth_num if v3c_nth_num is not None else coupon.get("nth_item_number"),
        "nth_discount_type": v3c_nth_dtype if v3c_nth_dtype is not None else coupon.get("nth_discount_type"),
        "nth_discount_value": v3c_nth_dvalue if v3c_nth_dvalue is not None else coupon.get("nth_discount_value"),
        "eligible_match_summary": v3c_elig_match,
    }

    result = await db.coupon_usage.update_one(
        {"user_id": user_id, "order_id": order_id},
        {"$setOnInsert": usage_doc},
        upsert=True,
    )

    if result.upserted_id is not None:
        # First insert — increment total_used on coupon + total_coupon_used on customer.
        await db.coupons.update_one({"id": coupon["id"]}, {"$inc": {"total_used": 1}})
        await db.customers.update_one({"id": customer_id, "user_id": user_id}, {"$inc": {"total_coupon_used": 1}})
        return {
            "ok": True,
            "recorded": True,
            "idempotent_replay": False,
            "usage_id": usage_id,
            "coupon_code": code_upper,
            "coupon_discount": pos_sent,
            "crm_computed_discount": crm_computed,
            "discount_scope": scope,
            "eligible_subtotal": eligible_subtotal,
            "offer_type": v3a_offer_type,
            "time_window_status": v3a_tw_status,
            # CR-001C-C V3-B — additive
            "applied_applications": v3b_applied_apps,
            "benefit_items": v3b_benefit_items,
            "buy_match_summary": v3b_buy_summary,
            "get_match_summary": v3b_get_summary,
            "same_item_required": v3b_same_item,
            "get_discount_type": v3b_get_disc_type,
            "discount_mismatch": discount_mismatch,
            # CR-001C-C V3-C — additive
            "nth_item_number": v3c_nth_num if v3c_nth_num is not None else coupon.get("nth_item_number"),
            "nth_discount_type": v3c_nth_dtype if v3c_nth_dtype is not None else coupon.get("nth_discount_type"),
            "nth_discount_value": v3c_nth_dvalue if v3c_nth_dvalue is not None else coupon.get("nth_discount_value"),
            "eligible_match_summary": v3c_elig_match,
        }

    # Replay — fetch existing row.
    existing = await db.coupon_usage.find_one(
        {"user_id": user_id, "order_id": order_id}, {"_id": 0}
    )
    return {
        "ok": True,
        "recorded": False,
        "idempotent_replay": True,
        "usage_id": (existing or {}).get("id"),
        "coupon_code": (existing or {}).get("coupon_code", code_upper),
        "coupon_discount": (existing or {}).get("coupon_discount", pos_sent),
        "crm_computed_discount": (existing or {}).get("crm_computed_discount", crm_computed),
        "discount_scope": (existing or {}).get("discount_scope", scope),
        "eligible_subtotal": (existing or {}).get("eligible_subtotal", eligible_subtotal),
        "offer_type": (existing or {}).get("offer_type", v3a_offer_type),
        "time_window_status": (existing or {}).get("time_window_status", v3a_tw_status),
        # CR-001C-C V3-B — additive
        "applied_applications": (existing or {}).get("applied_applications", v3b_applied_apps),
        "benefit_items": (existing or {}).get("benefit_items", v3b_benefit_items),
        "buy_match_summary": (existing or {}).get("buy_match_summary", v3b_buy_summary),
        "get_match_summary": (existing or {}).get("get_match_summary", v3b_get_summary),
        "same_item_required": (existing or {}).get("same_item_required", v3b_same_item),
        "get_discount_type": (existing or {}).get("get_discount_type", v3b_get_disc_type),
        "discount_mismatch": (existing or {}).get("discount_mismatch", discount_mismatch),
        # CR-001C-C V3-C — additive
        "nth_item_number": (existing or {}).get("nth_item_number", v3c_nth_num),
        "nth_discount_type": (existing or {}).get("nth_discount_type", v3c_nth_dtype),
        "nth_discount_value": (existing or {}).get("nth_discount_value", v3c_nth_dvalue),
        "eligible_match_summary": (existing or {}).get("eligible_match_summary", v3c_elig_match),
    }


# ---------------------------------------------------------------------------
# Index bootstrap
# ---------------------------------------------------------------------------
async def ensure_coupon_indexes(db) -> None:
    """Idempotent index creation. Called from server lifespan."""
    # Unique partial index — (user_id, order_id) idempotency key.
    await db.coupon_usage.create_index(
        [("user_id", 1), ("order_id", 1)],
        unique=True,
        partialFilterExpression={"order_id": {"$type": "string"}},
        name="uniq_user_order_id",
    )
    await db.coupon_usage.create_index(
        [("user_id", 1), ("coupon_id", 1), ("customer_id", 1)],
        name="idx_user_coupon_customer",
    )
    await db.coupon_usage.create_index(
        [("user_id", 1), ("created_at", -1)],
        name="idx_user_created_at",
    )
    # Assert uniqueness on (user_id, code) — should already exist as `uniq_coupon_id`
    # on `id`, plus app-layer guard. Create a defensive compound index if missing.
    try:
        await db.coupons.create_index(
            [("user_id", 1), ("code", 1)],
            unique=True,
            name="uniq_user_code",
        )
    except Exception as exc:  # noqa: BLE001 — idempotent path, log and continue
        logger.info("coupon_index_assert_skipped detail=%s", exc)
