# CR-080 — Implementation Plan
## POS Loyalty & Wallet Management

**Date**: 2026-08-06
**Role**: Planning Agent
**Risk**: MEDIUM
**Effort**: ~2.5 hrs
**Impact Analysis**: `planning/CR_080_IMPACT_ANALYSIS.md`
**Gate**: Owner approved (MEDIUM risk, new file only — financial logic inlined from existing helpers)

---

## Pre-Flight Checks

```bash
# Confirm pos_loyalty.py does not exist
ls /app/backend/routers/pos_loyalty.py 2>/dev/null && echo "EXISTS - STOP" || echo "OK"

# Confirm build_pos_loyalty_blob importable (used in L-1 helper)
cd /app/backend && python3 -c "from core.loyalty import build_pos_loyalty_blob; print('PASS')"

# Confirm calculate_tier importable (used in L-2 bonus tier update)
cd /app/backend && python3 -c "from core.helpers import calculate_tier; print('PASS')"

# Confirm existing pos loyalty endpoint (regression anchor)
grep -n "pos_customer_loyalty\|/loyalty" /app/backend/routers/pos.py | head -5
```

---

## Files WILL Change

| File | Type | Change |
|---|---|---|
| `routers/pos_loyalty.py` | **NEW** | ~210 LOC — 5 endpoints |
| `backend/server.py` | EDIT | +2 lines (import + include_router after pos_coupons) |

## Files WILL NOT Change

`routers/points.py` · `routers/wallet.py` · `core/loyalty.py` · `models/schemas.py` · `routers/pos.py` · all frontend

---

## Critical Design Decisions (from Impact Analysis)

### Decision A: Inline bonus/credit logic — do NOT call CRM helpers directly

`create_points_transaction` (`points.py:20`) uses `get_current_user` as a FastAPI dependency — it cannot be called from a `verify_pos_auth` context. We replicate only the **bonus branch** (~25 LOC) inline.

Same for `create_wallet_transaction` (`wallet.py:14`).

### Decision B: Add `wallet_enabled` guard in L-4

`wallet.py:create_wallet_transaction` does NOT check `wallet_enabled`. The POS wrapper must add this guard.

### Decision C: Bonus points cap = 1,000 (Q2=b)

Enforced at the POS wrapper before any DB write. The CRM admin path (`POST /points/transaction`) remains uncapped.

---

## Edit 1 — Create `routers/pos_loyalty.py`

**File**: `/app/backend/routers/pos_loyalty.py` (NEW)

```python
"""
CR-080: POS Loyalty & Wallet Management API
Five endpoints for loyalty settings, points history, bonus award,
wallet history, and wallet credit.
Auth: verify_pos_auth (X-API-Key).

Endpoints:
  GET  /api/pos/loyalty/settings                         L-1 read loyalty settings
  GET  /api/pos/customers/{id}/points-history            L-3 points transaction log
  POST /api/pos/customers/{id}/points/award              L-2 award bonus points (cap: 1000)
  GET  /api/pos/customers/{id}/wallet-history            L-5 wallet transaction log
  POST /api/pos/customers/{id}/wallet/credit             L-4 credit wallet at POS counter

Design notes:
  - create_points_transaction (points.py) and create_wallet_transaction (wallet.py)
    use get_current_user — cannot call directly. Bonus/credit logic inlined here.
  - wallet_enabled guard added in L-4 (absent from wallet.py helper).
  - Bonus points capped at 1,000 per award (Q2=b). CRM admin path uncapped.
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
    Read loyalty settings for POS display.
    Returns POS-relevant subset: earn %, tier thresholds, enabled flags.
    Excludes: lifecycle thresholds, campaign limits, VIP auto-promote settings.
    """
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = default_loyalty_settings(user["id"])

    return POSResponse(
        success=True,
        message="Loyalty settings",
        data={
            "loyalty_enabled":          settings.get("loyalty_enabled", False),
            "wallet_enabled":           settings.get("wallet_enabled", False),
            "coupon_enabled":           settings.get("coupon_enabled", False),
            "bronze_earn_percent":      settings.get("bronze_earn_percent", 5.0),
            "silver_earn_percent":      settings.get("silver_earn_percent", 7.0),
            "gold_earn_percent":        settings.get("gold_earn_percent", 10.0),
            "platinum_earn_percent":    settings.get("platinum_earn_percent", 15.0),
            "tier_silver_min":          settings.get("tier_silver_min", 500),
            "tier_gold_min":            settings.get("tier_gold_min", 1500),
            "tier_platinum_min":        settings.get("tier_platinum_min", 5000),
            "redemption_value":         settings.get("redemption_value", 1.0),
            "min_redemption_points":    settings.get("min_redemption_points", 50),
            "off_peak_bonus_enabled":   settings.get("off_peak_bonus_enabled", False),
            "off_peak_start_time":      settings.get("off_peak_start_time", "14:00"),
            "off_peak_end_time":        settings.get("off_peak_end_time", "17:00"),
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
    """Full points transaction log for a customer."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0, "name": 1, "total_points": 1})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    transactions = await db.points_transactions.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)

    # Normalise transaction_type / description fields (legacy rows use 'type'/'reason')
    for tx in transactions:
        tx["transaction_type"] = tx.get("transaction_type") or tx.get("type", "unknown")
        tx["description"]      = tx.get("description") or tx.get("reason", "")

    return POSResponse(
        success=True,
        message=f"{len(transactions)} transaction(s)",
        data={
            "customer_id":    customer_id,
            "customer_name":  customer.get("name", ""),
            "current_balance": customer.get("total_points", 0),
            "transactions":   transactions,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# L-2: POST /api/pos/customers/{customer_id}/points/award
# Inline bonus branch (create_points_transaction uses get_current_user — not callable here)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/customers/{customer_id}/points/award", response_model=POSResponse)
async def pos_award_points(  # CR-080 L-2
    customer_id: str,
    payload: dict,
    user: dict = Depends(verify_pos_auth),
):
    """
    Manually award bonus points to a customer (service recovery, complimentary gift).
    Cap: 1,000 points per transaction (Q2=b).
    Requires loyalty_enabled = true.
    Fires bonus_points + points_earned WhatsApp events (async).
    """
    points      = payload.get("points")
    description = payload.get("description", "Bonus points awarded at POS")
    # idempotency_key accepted for audit but not server-enforced in Phase 1
    # idempotency_key = payload.get("idempotency_key")

    # Validation
    if not isinstance(points, int) or points <= 0:
        return POSResponse(success=False, message="points must be a positive integer", data=None)
    if points > _BONUS_CAP:
        return POSResponse(success=False, message=f"Exceeds maximum award of {_BONUS_CAP} points per transaction", data=None)

    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = default_loyalty_settings(user["id"])

    if not settings.get("loyalty_enabled", False):
        return POSResponse(success=False, message="Loyalty program is not enabled", data=None)

    # ── Inline bonus branch (mirrors points.py:87–170) ────────────────────────
    now             = datetime.now(timezone.utc).isoformat()
    old_tier        = customer.get("tier", "Bronze")
    current_points  = customer.get("total_points", 0)
    new_balance     = current_points + points
    new_tier        = calculate_tier(new_balance, settings)

    await db.customers.update_one(
        {"id": customer_id},
        {"$set": {"total_points": new_balance, "tier": new_tier},
         "$inc": {"total_points_earned": points}}
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

    updated_customer = {**customer, "total_points": new_balance, "tier": new_tier}

    # WhatsApp events (async — do not await)
    asyncio.create_task(trigger_whatsapp_event(
        db, user["id"], "bonus_points", updated_customer,
        {
            "bonus_points":     points,
            "points_balance":   new_balance,
            "description":      description,
            "idempotency_key":  f"{tx_id}_bonus_points",
            "reference_type":   "points_tx",
            "reference_id":     tx_id,
        }
    ))
    asyncio.create_task(trigger_points_earned_event(
        db, user["id"], updated_customer, points, "bonus", new_balance,
        extra={"idempotency_key": f"{tx_id}_points_earned", "reference_type": "points_tx", "reference_id": tx_id}
    ))
    # ─────────────────────────────────────────────────────────────────────────

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
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0, "name": 1, "wallet_balance": 1})
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
# Inline credit branch (create_wallet_transaction uses get_current_user — not callable here)
# Also adds wallet_enabled guard (absent from wallet.py helper).
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/customers/{customer_id}/wallet/credit", response_model=POSResponse)
async def pos_wallet_credit(  # CR-080 L-4
    customer_id: str,
    payload: dict,
    user: dict = Depends(verify_pos_auth),
):
    """
    Credit customer wallet at POS counter (cash top-up, gift load, etc.).
    Requires: wallet_enabled = true, payment_method (Q3=a).
    Fires wallet_credit WhatsApp event (async).
    """
    amount         = payload.get("amount")
    description    = payload.get("description", "Wallet top-up at POS")
    payment_method = payload.get("payment_method", "")
    # idempotency_key = payload.get("idempotency_key")  # logged, not enforced Phase 1

    # Validation
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return POSResponse(success=False, message="amount must be a positive number", data=None)

    if amount <= 0:
        return POSResponse(success=False, message="amount must be positive", data=None)
    if not payment_method or not payment_method.strip():
        return POSResponse(success=False, message="payment_method is required (cash / card / upi)", data=None)

    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]})
    if not customer:
        return POSResponse(success=False, message="Customer not found", data=None)

    # wallet_enabled guard (absent from wallet.py helper — added here)
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    if not settings.get("wallet_enabled", False):
        return POSResponse(success=False, message="Wallet feature is not enabled", data=None)

    # ── Inline credit branch (mirrors wallet.py:14–107) ───────────────────────
    now             = datetime.now(timezone.utc).isoformat()
    current_balance = float(customer.get("wallet_balance", 0) or 0)
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
        "payment_method":   payment_method.strip(),
        "balance_after":    new_balance,
        "created_at":       now,
    }
    await db.wallet_transactions.insert_one(tx_doc)

    updated_customer = {**customer, "wallet_balance": new_balance}

    # WhatsApp event (async — do not await)
    asyncio.create_task(trigger_whatsapp_event(
        db, user["id"], "wallet_credit", updated_customer,
        {
            "amount":           amount,
            "wallet_balance":   new_balance,
            "payment_method":   payment_method.strip(),
            "transaction_id":   tx_id,
            "description":      description,
            "idempotency_key":  f"{tx_id}_wallet_credit",
            "reference_type":   "wallet_tx",
            "reference_id":     tx_id,
        }
    ))
    # ─────────────────────────────────────────────────────────────────────────

    return POSResponse(
        success=True,
        message=f"Wallet credited ₹{amount}",
        data={
            "transaction_id":  tx_id,
            "customer_id":     customer_id,
            "amount_credited": amount,
            "new_balance":     new_balance,
            "payment_method":  payment_method.strip(),
        },
    )
```

### Self-test Edit 1

```bash
cd /app/backend && python3 -c "
from routers.pos_loyalty import router
routes = [(r.methods, r.path) for r in router.routes]
print('routes:'); [print(' ', m, p) for m,p in routes]
assert any('/pos/loyalty/settings' in p for _,p in routes), 'Missing settings'
assert any('points-history' in p for _,p in routes), 'Missing points-history'
assert any('points/award' in p for _,p in routes), 'Missing award'
assert any('wallet-history' in p for _,p in routes), 'Missing wallet-history'
assert any('wallet/credit' in p for _,p in routes), 'Missing wallet/credit'
print('PASS: all 5 routes present')
"
```

---

## Edit 2 — Update `backend/server.py`

**File**: `/app/backend/server.py`

### Change 2a — Import line (line 16)

```python
# BEFORE
from routers import auth, customers, points, wallet, coupons, pos_coupons, feedback, whatsapp, pos, pos_reports, migration, analytics, scan, menu, suggestions, invoices, campaigns

# AFTER
from routers import auth, customers, points, wallet, coupons, pos_coupons, pos_loyalty, feedback, whatsapp, pos, pos_reports, migration, analytics, scan, menu, suggestions, invoices, campaigns
```

### Change 2b — Include router (after pos_coupons line)

```python
# BEFORE
api_router.include_router(pos_coupons.router)  # CR-081

# AFTER
api_router.include_router(pos_coupons.router)   # CR-081
api_router.include_router(pos_loyalty.router)   # CR-080
```

### Self-test Edit 2

```bash
sudo supervisorctl restart backend && sleep 5
tail -5 /var/log/supervisor/backend.err.log
# Must show "Application startup complete"
```

---

## Full Verification Matrix (11 checks)

```bash
API_URL="https://vendor-crm-preview-1.preview.emergentagent.com"
KEY="dp_live_HdEvMSha7Y67iSBMtN5nskuYzFc4HGe7zQgpWGBvxEY"
CUST_ID="1779d4fc-7161-4407-ac8c-cce30beb3e53"

echo "=== V1: GET loyalty settings ==="
curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/loyalty/settings" \
  | python3 -c "
import sys,json; d=json.load(sys.stdin); data=d.get('data',{})
for f in ['loyalty_enabled','bronze_earn_percent','tier_silver_min']:
    assert f in data, f'Missing: {f}'
print('PASS loyalty_enabled=', data['loyalty_enabled'], 'bronze=', data['bronze_earn_percent'], '%')
"

echo "=== V2: GET points history ==="
curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/customers/$CUST_ID/points-history?limit=5" \
  | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('PASS transactions=', len(d['data']['transactions']), 'balance=', d['data']['current_balance'] if d['success'] else 'FAIL: '+str(d))
"

echo "=== V3: Award bonus points (valid — 100 pts) ==="
OLD_BAL=$(curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/customers/$CUST_ID/points-history?limit=1" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['current_balance'])")
echo "Balance before award: $OLD_BAL"
curl -s -X POST "$API_URL/api/pos/customers/$CUST_ID/points/award" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"points": 100, "description": "Test bonus from plan", "idempotency_key": "plan_test_001"}' \
  | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('PASS new_balance=', d['data']['new_balance'], 'tier=', d['data']['new_tier'] if d['success'] else 'FAIL: '+str(d))
"

echo "=== V4: Award over cap (1001 pts) ==="
curl -s -X POST "$API_URL/api/pos/customers/$CUST_ID/points/award" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"points": 1001, "description": "Should fail"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS blocked' if not d['success'] else 'FAIL: should have been blocked')"

echo "=== V5: Award 0 or negative ==="
curl -s -X POST "$API_URL/api/pos/customers/$CUST_ID/points/award" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"points": -50, "description": "invalid"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS blocked' if not d['success'] else 'FAIL')"

echo "=== V6: Award — customer not found ==="
curl -s -X POST "$API_URL/api/pos/customers/nonexistent-id/points/award" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"points": 50, "description": "test"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if not d['success'] else 'FAIL')"

echo "=== V7: GET wallet history ==="
curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/customers/$CUST_ID/wallet-history?limit=5" \
  | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('PASS balance=', d['data']['current_balance'], 'txns=', len(d['data']['transactions']) if d['success'] else 'FAIL: '+str(d))
"

echo "=== V8: Wallet credit (valid — ₹200 cash) ==="
curl -s -X POST "$API_URL/api/pos/customers/$CUST_ID/wallet/credit" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"amount": 200.0, "description": "Test top-up", "payment_method": "cash", "idempotency_key": "wallet_test_001"}' \
  | python3 -c "
import sys,json; d=json.load(sys.stdin)
if d['success']:
    print('PASS new_balance=', d['data']['new_balance'], 'method=', d['data']['payment_method'])
else:
    # wallet may be disabled on this tenant — acceptable
    print('INFO (wallet may be disabled):', d['message'])
"

echo "=== V9: Wallet credit — missing payment_method ==="
curl -s -X POST "$API_URL/api/pos/customers/$CUST_ID/wallet/credit" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"amount": 100.0, "description": "No method"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS blocked' if not d['success'] else 'FAIL: should have been blocked')"

echo "=== V10: Wallet credit — negative amount ==="
curl -s -X POST "$API_URL/api/pos/customers/$CUST_ID/wallet/credit" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"amount": -50.0, "payment_method": "cash"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS blocked' if not d['success'] else 'FAIL')"

echo "=== V11: Existing GET /pos/customers/{id}/loyalty unchanged (regression) ==="
curl -s -H "X-API-Key: $KEY" "$API_URL/api/pos/customers/$CUST_ID/loyalty" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d['success'] else 'FAIL: regression broken')"
```

---

## Exit Gate Checklist

```
1. [ ] routers/pos_loyalty.py created
2. [ ] server.py import + include_router added
3. [ ] python3 import self-test passes (5 routes)
4. [ ] Backend startup clean
5. [ ] V1–V11 curl probes pass (V8 INFO acceptable if wallet disabled on tenant)
6. [ ] Existing GET /pos/customers/{id}/loyalty still works (V11)
7. [ ] Registry + QA handover updated
```
