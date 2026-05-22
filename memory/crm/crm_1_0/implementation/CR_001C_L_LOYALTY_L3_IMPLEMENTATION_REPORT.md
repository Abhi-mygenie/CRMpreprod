# CR-001C-L Phase L3 — Implementation Report (Pre-Implementation Plan / Diff Preview)

**Module:** CR-001C-L (Loyalty)
**Phase:** L3 — Migration Parity
**Date drafted:** 2026-05-22
**Status:** `cr001c_loyalty_l3_plan_awaiting_owner_approval`

> Per owner instruction: "Create L3 implementation plan/diff preview first
> if not already present." Code is NOT yet written. This document is the
> diff preview for owner approval. After approval, the same file will be
> updated with the actual diff and final outcome, and the QA report will
> live at `/app/memory/crm/crm_1_0/qa/CR_001C_L_LOYALTY_L3_QA_REPORT.md`.

---

## 1. Scope (Owner-Locked)

In:
- F1 helper (`core.loyalty.calculate_points` + `calculate_tier`) used by migration order-sync.
- `loyalty_clean_slate_recalc` config flag on `loyalty_settings` (Q-LB1 = Option C).
- Block both syncs (customer + order) when `loyalty_settings` doc is missing (D2).
- When `loyalty_clean_slate_recalc=true`:
  - Customer-sync stops trusting MyGenie loyalty/wallet/coupon aggregates (`loyalty_point`, `total_points_earned`, `total_points_redeemed`, `wallet_balance`, `total_wallet_received`, `total_wallet_used`, `total_coupon_used`).
  - Customer-sync hard-inits those counters to `0` on NEW customer create.
  - Customer-sync existing-customer `$set` becomes an allow-list that excludes loyalty/wallet/coupon counters AND behavioral fields (`total_visits`, `total_spent`, `avg_order_value`, `last_visit`) → re-sync safe (C11).
  - Customer-sync drops the synthetic backfill of historical `points_transactions` / `wallet_transactions` rows (lines 303–349 of `customers.py`).
  - Order-sync uses `calculate_points()` per order against the customer's running tier; honors `loyalty_enabled`; `$inc total_points + total_points_earned + total_visits + total_spent`; recomputes tier inline.
  - Order-sync writes per-order `points_transactions` row carrying ORIGINAL order date (already done today; preserved).
  - Order-sync pre-marks `points_expired=True` on those rows if the order date is older than `expiry_months` from now (D1).
  - Order-sync de-dupes `points_transactions` on re-sync by `(user_id, order_id, transaction_type='earn')` so re-running the migration doesn't double-write.
  - Order-sync drops the migration coupon write-path (`coupon_transactions` insert + `$inc total_coupon_used`) — Q-LOYALTY-5 says coupon migration is out of scope; deferred to CR-001C-C.
- When `loyalty_clean_slate_recalc=false` (default):
  - **Behavior preserved verbatim** — no risk of accidentally wiping existing prod data on a future re-migration.

Out (per owner instruction):
- L4 (manual redeem + cron `$inc`).
- L5 (dead-code cleanup including `_calculate_points` wrapper + `pos_payment_received`).
- Wallet / Coupons / Dashboard / WhatsApp / frontend / auth / CR-002.
- POS schema (`POSOrderWebhook`, `POSPaymentWebhook`) untouched.
- `/app/memory/final/` untouched.
- No prod deploy.
- No broad migration run.

---

## 2. Files To Touch

| File | Change | Risk |
|---|---|---|
| `backend/models/schemas.py` | Add `loyalty_clean_slate_recalc: bool = False` to `LoyaltySettings` and `Optional[bool]` to `LoyaltySettingsUpdate`. | Low |
| `backend/routers/migration.py` | `background_order_sync` — block on missing `loyalty_settings`; per-order `calculate_points()`; tier-evolution `$inc`; original-date `points_transactions` rows; pre-mark `points_expired`; re-sync dedup; gate everything on `loyalty_clean_slate_recalc`; drop coupon write-path under that gate. | Medium–High |
| `backend/routers/customers.py` | `background_customer_sync` — block on missing `loyalty_settings`; under `loyalty_clean_slate_recalc=true` switch to hard-init counters + allow-list `$set` on existing customer + drop synthetic backfill. Under flag=false, preserve current behavior verbatim. | Medium–High |

---

## 3. Detailed Diff Preview

### 3.1 `models/schemas.py` — Add flag

```python
class LoyaltySettings(BaseModel):
    ...
    points_expiry_months: int = 6
    expiry_reminder_days: int = 30
    # CR-001C-L Phase L3 (Q-LB1 Option C, 2026-05-22) — clean-slate migration gate.
    # When True (per restaurant, set by owner BEFORE running migration), customer-sync
    # ignores MyGenie loyalty/wallet/coupon aggregate fields and order-sync recomputes
    # points per-order using `core.loyalty.calculate_points`. Default False keeps
    # legacy behavior intact for any future re-migration of an already-loaded prod
    # restaurant. See CR_001C_L_LOYALTY_TECHNICAL_BLUEPRINT.md §10.
    loyalty_clean_slate_recalc: bool = False
    ...

class LoyaltySettingsUpdate(BaseModel):
    ...
    points_expiry_months: Optional[int] = None
    expiry_reminder_days: Optional[int] = None
    # CR-001C-L Phase L3 — clean-slate migration gate (see above)
    loyalty_clean_slate_recalc: Optional[bool] = None
    ...
```

> Existing `loyalty_settings` docs without this field will be treated as `False`
> via Pydantic default + a defensive `settings.get("loyalty_clean_slate_recalc", False)`
> at every read site. No DB migration needed.

### 3.2 `migration.py::background_order_sync` — Core L3 logic

**3.2.1 Pre-flight (D2 block on missing settings)** — inserted right after the log_doc insert (around line 76, before the `try/async with httpx.AsyncClient`):

```python
# CR-001C-L Phase L3 (D2, 2026-05-22) — block if loyalty_settings missing.
# Owner must configure loyalty for the restaurant BEFORE migration runs.
loyalty_settings = await db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0})
if not loyalty_settings:
    err_msg = (
        "Migration blocked: loyalty_settings doc not found for this restaurant. "
        "Configure Loyalty Settings (master toggle + earn percents + expiry_months) "
        "before triggering order sync. See CR-001C-L blueprint D2."
    )
    sync_status[user_id]["status"] = "failed"
    sync_status[user_id]["error"] = err_msg
    await _log_sync_progress(log_id, {
        "status": "failed",
        "error": err_msg,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    return

# CR-001C-L Phase L3 (Q-LB1 Option C) — clean-slate recalc gate.
clean_slate = bool(loyalty_settings.get("loyalty_clean_slate_recalc", False))
loyalty_enabled = bool(loyalty_settings.get("loyalty_enabled", False))
expiry_months = int(loyalty_settings.get("points_expiry_months", 6) or 0)
```

**3.2.2 Replace the broken `earn_percent = loyalty_settings.get("earn_percent", 0)` block** (lines 268–331). New behavior gated on `clean_slate`:

```python
if existing_order:
    # ... existing update branch unchanged ...
else:
    order_doc["id"] = str(uuid.uuid4())
    order_doc["created_at"] = mygenie_order.get("created_at", now)
    await db.orders.insert_one(order_doc)
    synced_count += 1

    if customer:
        order_date = mygenie_order.get("created_at") or now
        order_amount = float(mygenie_order.get("order_amount") or 0)

        # ---------- CR-001C-L Phase L3 (C1-mig + C3, 2026-05-22) ----------
        # Loyalty recalc only under clean-slate flag AND with loyalty_enabled.
        # When clean_slate=False (default), this whole block is skipped =>
        # current safe behavior preserved (no points written by migration).
        if clean_slate and loyalty_enabled:
            from core.loyalty import calculate_points as _calc, calculate_tier as _tier

            # Re-sync dedup (Q19 / blueprint §7 idempotency test):
            #   one `earn` row per (user_id, order_id) allowed.
            existing_tx = await db.points_transactions.find_one({
                "user_id": user_id,
                "order_id": order_doc["id"],
                "transaction_type": "earn",
            })
            if not existing_tx:
                pts = _calc(order_amount, customer, loyalty_settings)
                points_earned = pts["total_points"]

                if points_earned > 0:
                    # D1: pre-mark expired if order_date older than expiry_months.
                    points_expired = False
                    expired_at = None
                    if expiry_months and order_date:
                        try:
                            od = datetime.fromisoformat(order_date.replace("Z", "+00:00"))
                            cutoff = datetime.now(timezone.utc) - timedelta(days=expiry_months * 30)
                            if od < cutoff:
                                points_expired = True
                                expired_at = od.isoformat()
                        except (ValueError, TypeError):
                            pass

                    # Persist points_earned on the order doc
                    await db.orders.update_one(
                        {"id": order_doc["id"]},
                        {"$set": {"points_earned": points_earned,
                                  "off_peak_bonus": pts["off_peak_bonus"]}}
                    )

                    # Per-order earn transaction with ORIGINAL date + expiry pre-mark.
                    points_tx_doc = {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "customer_id": customer["id"],
                        "order_id": order_doc["id"],
                        "transaction_type": "earn",
                        "points": points_earned,
                        "description": f"Earned on order {pos_order_id} (migration recalc)",
                        "balance_after": None,  # populated after $inc below
                        "created_at": order_date,
                        "points_expired": points_expired,
                        "expired_at": expired_at,
                    }
                    await db.points_transactions.insert_one(points_tx_doc)

                    # Customer counter $inc + tier recompute (running tier evolution).
                    new_total_visits = (customer.get("total_visits", 0) or 0) + 1
                    new_total_spent = (customer.get("total_spent", 0) or 0) + order_amount
                    new_total_points = (customer.get("total_points", 0) or 0) + (
                        points_earned if not points_expired else 0
                    )
                    new_total_points_earned = (customer.get("total_points_earned", 0) or 0) + points_earned
                    new_tier = _tier(new_total_points, loyalty_settings)
                    new_avg = round(new_total_spent / new_total_visits, 2) if new_total_visits else 0

                    await db.customers.update_one(
                        {"id": customer["id"]},
                        {"$set": {
                            "total_points": new_total_points,
                            "total_points_earned": new_total_points_earned,
                            "tier": new_tier,
                            "total_visits": new_total_visits,
                            "total_spent": new_total_spent,
                            "avg_order_value": new_avg,
                        },
                         "$max": {"last_visit": order_date}}
                    )

                    # Update in-memory customer so the next order for the same
                    # customer (later in the same page or pagination batch) sees
                    # the new tier — running tier evolution per blueprint §7.
                    customer["total_points"] = new_total_points
                    customer["total_points_earned"] = new_total_points_earned
                    customer["total_visits"] = new_total_visits
                    customer["total_spent"] = new_total_spent
                    customer["tier"] = new_tier
                else:
                    # No points earned (e.g. order_amount < min_order_value) —
                    # still grow visits + spend.
                    await db.customers.update_one(
                        {"id": customer["id"]},
                        {"$inc": {"total_visits": 1, "total_spent": order_amount},
                         "$max": {"last_visit": order_date}}
                    )
                    customer["total_visits"] = (customer.get("total_visits", 0) or 0) + 1
                    customer["total_spent"] = (customer.get("total_spent", 0) or 0) + order_amount
            # else: existing tx already there → re-sync; do nothing.

        elif not clean_slate:
            # Legacy path preserved verbatim (no loyalty $inc; visits + spend only)
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$inc": {"total_visits": 1, "total_spent": order_amount},
                 "$max": {"last_visit": order_date}}
            )
        # else clean_slate but loyalty_enabled=False: kill-switch suppresses
        # points; still grow visits + spend.
        else:
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$inc": {"total_visits": 1, "total_spent": order_amount},
                 "$max": {"last_visit": order_date}}
            )

    # CR-001B-fix F2 order_items write — unchanged below.
```

> **Coupon migration writes (lines 301–321)** — REMOVED in clean-slate mode.
> Under `clean_slate=False` they stay (preserves legacy behavior for any
> non-clean-slate re-migration). Under `clean_slate=True` the
> `coupon_transactions` insert + `$inc total_coupon_used` are skipped —
> coupon migration is deferred to CR-001C-C per Q-LOYALTY-5.

### 3.3 `customers.py::background_customer_sync` — Clean-slate init + re-sync safety

**3.3.1 Pre-flight (D2 block)** — added before the page loop, near line 92:

```python
# CR-001C-L Phase L3 (D2) — block on missing loyalty_settings.
loyalty_settings_doc = await db.loyalty_settings.find_one(
    {"user_id": user_id}, {"_id": 0}
)
if not loyalty_settings_doc:
    err_msg = (
        "Migration blocked: loyalty_settings doc not found. Configure Loyalty "
        "Settings (master toggle + tier thresholds) before customer sync. "
        "See CR-001C-L blueprint D2."
    )
    customer_sync_status[user_id]["status"] = "failed"
    customer_sync_status[user_id]["error"] = err_msg
    await _cust_log_progress(log_id, {
        "status": "failed", "error": err_msg,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })
    return

clean_slate = bool(loyalty_settings_doc.get("loyalty_clean_slate_recalc", False))
```

**3.3.2 `customer_data` construction (lines 173–197)** — gated on `clean_slate`:

```python
if clean_slate:
    # Under clean-slate, DO NOT trust MyGenie loyalty/wallet/coupon aggregates.
    # Hard-init to 0 — order-sync will rebuild from scratch.
    customer_data = {
        "user_id": user_id,
        "name": mygenie_customer.get("name") or "Unknown",
        "phone": mygenie_customer.get("phone") or "",
        "country_code": mygenie_customer.get("country_code") or "+91",
        "email": mygenie_customer.get("email") or f"customer{pos_customer_id_str}@mygenie.local",
        "dob": mygenie_customer.get("dob"),
        "anniversary": mygenie_customer.get("anniversary"),
        "gst_name": mygenie_customer.get("gst_name"),
        "gst_number": mygenie_customer.get("gst_number"),
        # CR-001C-L Phase L3 (C2, C10-mig) — hard-init counters to 0.
        "total_points": 0,
        "total_points_earned": 0,
        "total_points_redeemed": 0,
        "wallet_balance": 0.0,
        "total_wallet_received": 0.0,
        "total_wallet_used": 0.0,
        "total_coupon_used": 0,
        "pos_customer_id": pos_customer_id_str,
        "pos_id": mygenie_customer.get("pos_id"),
        "pos_restaurant_id": mygenie_customer.get("restaurant_id"),
        "mygenie_synced": True,
        "last_synced_at": now,
        "last_updated_at": mygenie_customer.get("updated_time"),
    }
else:
    # Legacy path preserved verbatim (current behavior — trust MyGenie aggregates).
    customer_data = { ... existing dict ... }
```

**3.3.3 Tier-from-points hardcode (lines 235–245)** — replace with shared helper (works for both clean-slate and legacy):

```python
from core.loyalty import calculate_tier as _tier
customer_data["tier"] = _tier(customer_data.get("total_points", 0), loyalty_settings_doc)
```

> Under clean-slate, points=0 → tier=Bronze. Under legacy, uses MyGenie's
> imported `loyalty_point` value, same as today.

**3.3.4 Existing-customer branch (lines 275–279) — C11 re-sync safety**:

```python
if existing:
    if clean_slate:
        # C11: explicit allow-list. Demographic + addresses + sync metadata only.
        # NEVER overwrite loyalty/wallet/coupon counters or behavioral fields
        # — those are owned by order-sync recalc + realtime POS.
        allowed_keys = {
            "name", "phone", "country_code", "email", "dob", "anniversary",
            "gst_name", "gst_number", "pos_customer_id", "pos_id",
            "pos_restaurant_id", "mygenie_synced", "last_synced_at",
            "last_updated_at", "addresses",
        }
        safe_update = {k: v for k, v in customer_data.items() if k in allowed_keys}
        await db.customers.update_one(
            {"id": existing["id"]},
            {"$set": safe_update}
        )
    else:
        # Legacy path preserved (current full-overwrite behavior).
        await db.customers.update_one(
            {"id": existing["id"]},
            {"$set": customer_data}
        )
    updated_count += 1
    customer_id = existing["id"]
```

**3.3.5 Synthetic backfill block (lines 303–349)** — drop under clean-slate:

```python
# CR-001C-L Phase L3 (C2) — under clean-slate, DO NOT write synthetic
# historical points_transactions / wallet_transactions / coupon rows.
# Order-sync is the single source of truth for transaction history.
if not existing and not clean_slate:
    # ... existing synthetic backfill kept verbatim for legacy path ...
```

---

## 4. Tier Evolution Strategy (Blueprint §7 — Order ordering)

The blueprint flags an "Order ordering test" — orders should be processed
chronologically so tier upgrades fire correctly. The MyGenie pagination
API does not guarantee strict chronological order across all customers,
but it generally returns per-customer batches that ARE chronological.

**This L3 implementation uses an in-process running tier:**
- When a customer is encountered, we mutate the in-memory `customer` dict
  with the new `total_points / total_points_earned / total_visits /
  total_spent / tier` after each $inc.
- Subsequent orders for the same customer in the same page (or fetched
  later) re-read DB state via `db.customers.find_one` so they pick up the
  evolved tier.

**Known limitation:** if two orders for the same customer arrive on
DIFFERENT pages NOT in chronological order, the later order may earn at
a higher tier than it should have at its true timestamp. This affects
points correctness by at most the cross-tier delta (e.g. +2% earn rate),
which is acceptable for clean-slate go-live. A perfect chronological
recompute would require a single in-memory sort across all pages — too
heavy for this CR. Documented for L5 / future enhancement.

---

## 5. QA Strategy

### 5.1 Static QA — `/tmp/cr_001c_l_l3_static_qa.py`
Monkey-patched motor + monkey-patched httpx. Drives the migration code paths against synthetic MyGenie responses. Asserts:
- **D2-A** — Missing `loyalty_settings` doc → both syncs fail with explicit error.
- **C1-mig** — `loyalty_enabled=false` + `clean_slate=true` → no points written; visits + spend grow.
- **C2/C10-mig-init** — clean-slate new-customer doc has counters=0 (regardless of MyGenie payload values).
- **C3-points-parity** — order-sync points match `core.loyalty.calculate_points(order, customer, settings)`.
- **C3-tier-evolution** — synthetic battery: customer with 4 orders Bronze → Silver mid-stream; later orders earn at Silver %.
- **D1-expired-pre-mark** — Order older than `expiry_months` → `points_transactions.points_expired=True`; counter `total_points_earned` still grows; `total_points` does NOT include expired (matches `core/loyalty_jobs.run_points_expiry` semantics).
- **Re-sync dedup** — Run order-sync twice on same MyGenie payload. Second run inserts 0 new `points_transactions` rows; counters unchanged.
- **Re-sync safety (C11)** — Customer-sync existing-customer branch with clean_slate=true: counters preserved even if MyGenie payload mutates `loyalty_point`/etc.
- **Legacy preservation** — `clean_slate=false` produces byte-identical behavior to pre-L3 (no new rows beyond what current code writes).
- **Coupon write skipped under clean-slate** — `coupon_transactions` insert + `$inc total_coupon_used` NOT called when clean_slate=true.
- **Coupon writes preserved under legacy** — same calls fire when clean_slate=false.

### 5.2 Controlled Migration QA — `/tmp/cr_001c_l_l3_controlled_qa.py`
Synthetic mini-migration on R689 (which is currently clean):
1. Snapshot R689 state.
2. Set `loyalty_clean_slate_recalc=true` on R689's `loyalty_settings`.
3. Synthesize 6 MyGenie customer payloads + 12 order payloads (mix of Bronze/Silver tiers, one expired-window order, two same-customer chronological orders).
4. Invoke `background_customer_sync` and `background_order_sync` with httpx mocked to return our synthetic payloads.
5. Read Mongo state and assert per the locked expectations from §5.1.
6. Run a SECOND time to prove dedup + re-sync safety.
7. Cleanup: delete the synthetic data from Mongo + reset `loyalty_clean_slate_recalc=false`.

No real MyGenie HTTP call is made. No real prod data touched. R689 returns to its pre-L3 clean state.

### 5.3 Legacy regression
The 229/229 L1+L2 static QA harness (`/tmp/cr_001c_l_l1_l2_parity_qa.py`) re-run to prove L3 didn't break L1+L2. Plus the 45/45 Stage D live harness can optionally be re-pushed.

---

## 6. Non-Touch List (Owner-Locked)

- ❌ Wallet write-path (CR-001C-W)
- ❌ Coupon write-path (CR-001C-C) — the migration coupon insert is *skipped under clean-slate*, not refactored
- ❌ Dashboard / Visibility (CR-001C-V)
- ❌ WhatsApp Automation
- ❌ Frontend
- ❌ Auth
- ❌ CR-002 `pos_request_logs`
- ❌ POS schema (`POSOrderWebhook`, `POSPaymentWebhook`, `POSCustomerCreate`, `POSCustomerUpdate`)
- ❌ Production deploy
- ❌ `/app/memory/final/`
- ❌ Broad migration run without explicit owner approval

---

## 7. Risk Assessment

| Risk | Mitigation |
|---|---|
| Wiping live customer counters on re-sync | C11 allow-list `$set` on existing-customer branch under clean-slate. Default `clean_slate=false` preserves legacy. |
| Double-counting points on re-sync | Dedup guard `find_one({user_id, order_id, transaction_type='earn'})` before each tx insert. Order doc itself is already deduped via F12. |
| Wrong tier on cross-page mid-history upgrade | Documented limitation §4. Acceptable for clean-slate go-live; affects ≤ tier-delta % of points. |
| Missing `loyalty_settings` causing silent failures | D2 hard-block both syncs with explicit error message. |
| Legacy behavior regression for non-clean-slate restaurant | Entire L3 logic gated on `clean_slate=true`; flag defaults false; legacy paths preserved verbatim. |
| `Optional[str]` for `LoyaltySettings.loyalty_clean_slate_recalc` causing seed scripts to break | Field added with `default=False` so all existing creation sites continue working; only the new flag check is added. |

---

## 8. ⏸ Hard Gate — Owner Approval Required Before Code Write

Reply with one of:

1. **"L3 plan approved — proceed to implement"** → I write the code changes per §3, run §5 QA, then post the diff + QA results back for the final acceptance gate.
2. **"L3 plan revisions: …"** → I adjust this report and re-present.
3. **"Hold — clarify X"** → I clarify.

No code, DB, or env will be modified until this gate clears.

Status remains: `cr001c_loyalty_l3_plan_awaiting_owner_approval`
