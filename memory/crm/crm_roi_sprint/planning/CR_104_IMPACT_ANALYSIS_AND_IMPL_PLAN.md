# CR-104 — Impact Analysis + Implementation Plan: Feedback Bonus Award
**Date**: 2026-10-09 · **Role**: Planning Agent · **Source**: Intake `discovery/SESSION_2026_10_09_INTAKE_CR103_CR104_BUG031_BUG033.md` §2 · **Risk**: HIGH (§14 loyalty write — modifies `total_points` on customer) · **Status**: 🟡 IA in progress — owner decisions Q1/Q2 pending · **No code changed.**

---

## 1. Problem

`feedback_bonus_enabled` and `feedback_bonus_points` are fully configurable fields in `loyalty_settings` (40/41 tenants have `feedback_bonus_enabled: True`; r689 = 50 points). They appear in the loyalty-rules response (`GET /scan/loyalty-rules/{rid}`) with the note "informational only — nothing awards it." The `POST /scan/feedback` route (CR-096) increments `feedback_count` but never awards points.

**Result:** Restaurant owners configured feedback bonuses expecting customers to earn points for leaving feedback. Nothing has been awarded. Zero `points_transactions` docs with a feedback bonus exist in the DB.

---

## 2. Live evidence (read-only 2026-10-09)

| Fact | Value |
|---|---|
| Tenants with `feedback_bonus_enabled: True` | 40 / 41 |
| r689 `feedback_bonus_points` | 50 |
| Existing `points_transactions` with `transaction_type:"feedback_bonus"` | **0** |
| r689 customers with `feedback_count > 0` | 2 |
| `feedback_count` is tracked? | ✅ Yes — `$inc feedback_count` already done in CR-096 |

---

## 3. Where the award must go

`scan.py` `submit_feedback` route (lines 811–815). The `if customer_id:` block already increments `feedback_count`. The bonus award goes right after:

```python
    if customer_id:
        await db.customers.update_one(
            {"id": customer_id},
            {"$set": {"last_rating": data.rating}, "$inc": {"feedback_count": 1}},
        )
        # CR-104: feedback bonus award goes HERE (after existing update)
```

**Scope constraint:** Award only on the **token path** (Case A — authenticated customer). Reasons:
- Phone-linked (Case C/D): customer is resolved but not verified to have just interacted; anonymous feedback can't receive points
- Token path: customer is definitively the one submitting

---

## 4. Pattern to follow — first_visit_bonus (pos.py:840)

```python
if first_visit_bonus > 0:
    await db.points_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "customer_id": customer_id,
        "points": first_visit_bonus,
        "transaction_type": "bonus",
        "description": "First visit bonus - Welcome reward",
        "bill_amount": None,
        "balance_after": first_visit_bonus,
        "created_at": now,
    })
```

Same shape for feedback bonus. `transaction_type: "bonus"` (consistent with first_visit_bonus).

---

## 5. Owner questions

| Q | Question | Recommendation |
|---|---|---|
| **Q1** | **Which paths award?** (a) token path only · (b) token + phone-linked (Case C/D) | **(a) token only** — authenticated customer, no ambiguity |
| **Q2** | **Idempotency / frequency**: (a) award on every feedback submission · (b) once per order (if `order_id` present) · (c) once per day per customer · (d) once-ever per customer | **(a) every feedback** — simplest; restaurant controls via `feedback_bonus_enabled` toggle; typically diners submit once per visit |

---

## 6. Implementation Plan (pending Q1/Q2 approval)

### E1 — `routers/scan.py` — add bonus award after `feedback_count +1` (~20 lines)

```python
    if customer_id:
        await db.customers.update_one(
            {"id": customer_id},
            {"$set": {"last_rating": data.rating}, "$inc": {"feedback_count": 1}},
        )
        # CR-104: feedback bonus award (token path only — Q1=a)
        if identity_source == "token":
            settings = await db.loyalty_settings.find_one({"user_id": rid}, {"_id": 0})
            if (settings
                    and settings.get("loyalty_enabled")
                    and settings.get("feedback_bonus_enabled")
                    and (settings.get("feedback_bonus_points") or 0) > 0):
                bonus_pts = int(settings["feedback_bonus_points"])
                cust_doc = await db.customers.find_one({"id": customer_id}, {"_id": 0, "total_points": 1})
                balance_after = (cust_doc.get("total_points") or 0) + bonus_pts
                await db.points_transactions.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": rid,
                    "customer_id": customer_id,
                    "points": bonus_pts,
                    "transaction_type": "bonus",
                    "description": "Feedback bonus",
                    "bill_amount": None,
                    "balance_after": balance_after,
                    "created_at": now,
                })  # CR-104
                await db.customers.update_one(
                    {"id": customer_id},
                    {"$inc": {"total_points": bonus_pts, "total_points_earned": bonus_pts}},
                )  # CR-104
```

**Notes on the implementation:**
- `loyalty_settings` fetch: 1 extra DB read on token path only. For non-token paths this block never runs (zero overhead).
- `total_points_earned` also incremented (same as first_visit_bonus pattern in pos.py:1060)
- `transaction_type: "bonus"` — consistent with other bonuses; analytics can group by description for breakdown

### Files

**WILL change**: `routers/scan.py` (~20 lines in submit_feedback)
**WILL NOT touch**: `core/coupon.py` · `models/schemas.py` · `loyalty_settings` collection (read-only) · `feedback` collection (write already done by CR-096) · any test files (add new test to existing `test_cr096_feedback.py`)

---

## 7. Verification matrix

| V | Check | Expected |
|---|---|---|
| V1 | Submit feedback with token (r689, `feedback_bonus_enabled:True`) | `customers.total_points` += 50 |
| V2 | `points_transactions` doc created | `transaction_type:"bonus"`, `description:"Feedback bonus"`, `points:50` |
| V3 | Submit feedback on `feedback_bonus_disabled` tenant | No bonus txn (skip) |
| V4 | Anonymous feedback (no token) | No bonus txn (skip) |
| V5 | Phone-linked feedback (Case C, no token) | No bonus txn (skip — token path only) |
| V6 | Existing CR-096 test suite (`test_cr096_feedback.py`) | All PASS (bonus is additive, tests check `feedback_id` and `linked`, not points) |

---

## 8. Risk (§14)

- Writes to `customers.total_points` and inserts into `points_transactions`
- **MEDIUM** blast: only token path, only when `loyalty_enabled + feedback_bonus_enabled`, only if bonus_pts > 0
- Regression: existing CR-096 tests don't check `total_points` — they will PASS unchanged
- Full loyalty regression (`test_cr089_skip_otp`, `test_cr093_lookup`, `test_cr096_feedback`) must be run after implementation

---

```
Planning complete: CR-104
Stage: IA + Implementation Plan (combined)
Code reality: NONE (feedback bonus write never existed)
Risk: HIGH §14 (writes total_points; mitigated by loyalty_enabled + feedback_bonus_enabled guards)
Files WILL change: routers/scan.py (~20 lines)
Files WILL NOT touch: schemas.py · coupon.py · loyalty_settings · frontend
Owner decisions: Q1 (token-only vs token+phone) · Q2 (every vs per-order vs once-ever)
Docs: planning/CR_104_IMPACT_ANALYSIS_AND_IMPL_PLAN.md
Next: owner answers Q1/Q2 → "choose implementation role for CR-104" → implement
```
