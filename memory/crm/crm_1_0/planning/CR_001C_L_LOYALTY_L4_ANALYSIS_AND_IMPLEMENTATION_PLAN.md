# CR-001C-L Loyalty L4 — Analysis & Implementation Plan

**Module:** CR-001C-L (Loyalty) — Phase L4
**Date:** 2026-05-23
**Status:** `cr001c_loyalty_l4_analysis_waiting_owner_approval`

---

## 0. Pre-State

| Completed Phase | Status |
|---|---|
| L1 — shared loyalty helper | ✅ |
| L2 — realtime POS loyalty | ✅ |
| L3 — migration clean-slate + real validation (Jeh's Nest + R689) | ✅ |
| BUG-L3-001 — naive timestamp fix | ✅ closed |
| LX-A — POS loyalty API contract | ✅ GREEN-LIGHT |
| LF-MERGE — single `loyalty_enabled` flag | ✅ |

L4 scope: Manual redeem, birthday bonus cron, anniversary bonus cron, datetime safety.

---

## 1. Manual Redeem — Current Behavior

**Entry point:** `POST /api/points/transaction` in `routers/points.py:19-95`

When `tx_data.transaction_type == "redeem"` (line 32):

```
current_points = customer.total_points                     # line 29
if current_points < tx_data.points → 400 Insufficient     # line 33-34
new_balance = current_points - tx_data.points              # line 35
new_tier = calculate_tier(new_balance, settings)           # line 39
$set total_points = new_balance                            # line 41-42
$set tier = new_tier                                       # line 43
$set last_visit = now                                      # line 44
→ insert points_transaction doc                            # line 54-66
→ fire WhatsApp points_redeemed trigger                    # line 72-77
```

### DEFECT-L4-R1: `total_points_redeemed` not incremented

The redeem path sets `total_points` and `tier` but **never increments `total_points_redeemed`**. This breaks the balance identity:

```
total_points = total_points_earned − expired − total_points_redeemed
```

After a redeem, `total_points` decreases but `total_points_redeemed` stays at 0. The identity breaks.

**Fix:** Add `$inc total_points_redeemed` by `tx_data.points` alongside the `$set`.

### DEFECT-L4-R2: `get_redemption_value_for_tier(...)` not used

The manual redeem endpoint does not use the tier-aware `get_redemption_value_for_tier(tier, settings)` helper from LX-A. The frontend (or POS caller) must know the monetary value independently. The endpoint accepts raw `points` and `description` without computing the ₹ value.

This is an **architectural decision, not a bug** — the endpoint is a low-level "deduct N points" operation. The monetary value is computed by the POS frontend using the `/loyalty` endpoint's `ratio_per_point`. However, the endpoint **should** respect the `min_redemption_points` and `max_redemption_percent` / `max_redemption_amount` guardrails from settings.

**Current state:** No min/max validation on redeem. Customer can redeem 1 point if they have it.

**Question for owner (Q-L4-1):** Should L4 add server-side min/max redemption validation to the manual redeem endpoint? Or is the POS/frontend responsible for these guardrails?

### DEFECT-L4-R3: `total_points_earned` not incremented for earn-type transactions

For `transaction_type == "earn"` (line 36-37), `total_points` is updated via `new_balance = current_points + tx_data.points`, but `total_points_earned` is **never incremented**. Only the POS realtime path (L2, `pos.py:1264`) does `$inc total_points_earned`.

The manual `POST /api/points/transaction` earn path (used by the CRM admin UI) silently diverges from the POS path.

**Fix:** Add `$inc total_points_earned` for earn transactions.

---

## 2. Birthday Bonus — Current Behavior

**Entry point:** `core/loyalty_jobs.py:16-98` (`run_birthday_bonus`)

Flow:
```
if not birthday_bonus_enabled → return 0                           # line 20-21
For each customer with dob:
  Parse dob → birthday_this_year                                   # line 43-47
  Check if today within [bday − days_before, bday + days_after]    # line 49-52
  Dedup: skip if last_birthday_bonus_year == current_year           # line 53-54
  new_points = current_points + bonus_points                       # line 56
  $set total_points = new_points                                   # line 58-60
  $set last_birthday_bonus_year = current_year                     # line 60
  Insert PT doc (transaction_type = "bonus")                       # line 62-73
  Fire WhatsApp birthday trigger                                   # line 84-88
```

### DEFECT-L4-B1: `total_points_earned` not incremented

Birthday bonus adds to `total_points` but does **not** increment `total_points_earned`. This breaks the identity:

```
total_points_earned should include all awarded points (earn + bonus)
```

After birthday bonus: `total_points` increases but `total_points_earned` stays the same. If the customer later redeems, `total_points_redeemed` (if fixed by L4-R1) could exceed `total_points_earned`, creating a nonsensical negative.

**Fix:** Add `$inc total_points_earned` by `bonus_points` in the same `update_one`.

### DEFECT-L4-B2: Tier not recomputed after bonus

The birthday bonus increases `total_points` but does **not** recompute `tier`. A customer at 480 Bronze points receiving 100 birthday bonus would have 580 points but remain Bronze (Silver threshold = 500).

**Fix:** After `new_points = current_points + bonus_points`, call `calculate_tier(new_points, settings)` and include `"tier": new_tier` in the `$set`.

### OK-L4-B3: Dedup is correct

`last_birthday_bonus_year == current_year` prevents double-awarding within the same year. ✅

---

## 3. Anniversary Bonus — Current Behavior

**Entry point:** `core/loyalty_jobs.py:101-183` (`run_anniversary_bonus`)

Structurally identical to birthday bonus. Same defects apply.

### DEFECT-L4-A1: `total_points_earned` not incremented

Same as DEFECT-L4-B1. Copy-paste code.

**Fix:** Add `$inc total_points_earned` by `bonus_points`.

### DEFECT-L4-A2: Tier not recomputed after bonus

Same as DEFECT-L4-B2.

**Fix:** `calculate_tier(new_points, settings)` + `$set tier`.

### OK-L4-A3: Dedup is correct

`last_anniversary_bonus_year == current_year`. ✅

---

## 4. Missing Counter Updates — Summary Table

| Code Path | `total_points` | `total_points_earned` | `total_points_redeemed` | `tier` recompute |
|---|---|---|---|---|
| **POS realtime earn** (`pos.py:1253`) | ✅ `$set` | ✅ `$inc` (L2) | N/A | ✅ |
| **Migration recalc** (`migration.py:408`) | ✅ `$set` | ✅ `$set` (L3) | N/A | ✅ |
| **Manual earn** (`points.py:37`) | ✅ `$set` | ❌ **MISSING** | N/A | ✅ |
| **Manual redeem** (`points.py:35`) | ✅ `$set` | N/A | ❌ **MISSING** | ✅ |
| **Birthday bonus** (`loyalty_jobs.py:58`) | ✅ `$set` | ❌ **MISSING** | N/A | ❌ **MISSING** |
| **Anniversary bonus** (`loyalty_jobs.py:143`) | ✅ `$set` | ❌ **MISSING** | N/A | ❌ **MISSING** |
| **Points expiry** (`loyalty_jobs.py:321`) | ✅ `$set` | N/A | N/A | ✅ |

---

## 5. Datetime Safety Findings

### RISK-DT-1: `loyalty_jobs.py:211` — `lr_date` naive risk (P2, Low blast)

```python
lr_date = datetime.fromisoformat(last_reminder.replace("Z", "+00:00"))
    if isinstance(last_reminder, str) else last_reminder
```

If `last_reminder` is a naive ISO string (e.g. from an older code path), `.replace("Z", "+00:00")` is a no-op and `lr_date` stays naive. The subsequent `lr_date.year` / `lr_date.month` comparison (line 212) works on naive datetimes, so this is **not a comparison-type bug** (no tz-aware vs naive compare). Blast radius is limited to: if the naive date is in a different UTC day than local, the month-dedup could misjudge by 1 day.

**Severity:** P2 — low blast. No comparison with tz-aware datetime.
**Fix:** Add `if lr_date.tzinfo is None: lr_date = lr_date.replace(tzinfo=timezone.utc)` after line 211. Same pattern as BUG-L3-001 fix.

### RISK-DT-2: `loyalty_jobs.py:229` — `tx_date` naive risk (P1, Medium blast)

```python
tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00"))
    if isinstance(tx["created_at"], str) else tx["created_at"]
```

This is the **same pattern as BUG-L3-001** — MyGenie-sourced `created_at` is a naive ISO string. `tx_date` will be naive. Line 230 compares:

```python
if expiry_cutoff <= tx_date <= reminder_cutoff:
```

Both `expiry_cutoff` and `reminder_cutoff` are derived from `datetime.now(timezone.utc)` (tz-aware). **This WILL raise `TypeError`** if `tx_date` is naive.

The `except Exception: continue` on line 235 silently swallows it — exactly the same silent failure pattern as BUG-L3-001.

**Severity:** P1 — same class of bug as BUG-L3-001. Expiry reminders will silently fail for customers whose PT rows have naive `created_at` timestamps.
**Fix:** Add naive-to-UTC coercion after line 229:
```python
if tx_date.tzinfo is None:
    tx_date = tx_date.replace(tzinfo=timezone.utc)
```

### RISK-DT-3: `loyalty_jobs.py:289` — String comparison for expiry cutoff (P2, Correctness risk)

```python
"created_at": {"$lt": expiry_cutoff_str}
```

`run_points_expiry` compares `created_at` as a **string** against an ISO-formatted cutoff string. This works correctly **only if all `created_at` values are ISO-formatted strings** and in the same timezone format. Naive strings (`"2025-10-04 15:31:22"`) will compare lexicographically against `"2025-11-24T10:30:00+00:00"` — the space-vs-T and missing timezone suffix could cause incorrect ordering.

**Severity:** P2 — works for tz-aware ISO strings but may misorder naive strings.
**Fix:** No code fix in L4 (the runtime expiry job has narrower scope than migration). Document for L5 consideration. The migration L3 code already handles this correctly at the document level.

### RISK-DT-4: `routers/points.py:176-179` — Already fixed

```python
tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00"))
if tx_date.tzinfo is None:
    tx_date = tx_date.replace(tzinfo=timezone.utc)
```

`get_expiring_points` already has the naive-to-UTC coercion (lines 178-179). ✅ No action needed.

---

## 6. `get_redemption_value_for_tier(...)` Usage Analysis

| Code Path | Uses `get_redemption_value_for_tier`? | Notes |
|---|---|---|
| `build_pos_loyalty_blob` (LX-A) | ✅ Yes | Computes `ratio_per_point` and `points_value` for POS read endpoints |
| `POST /api/points/transaction` (manual redeem) | ❌ No | Accepts raw `points` count. Does not compute monetary value server-side. |
| POS write-path (`pos.py`) | ❌ No (not needed) | POS deducts from wallet, not points-to-rupees conversion |
| Birthday/anniversary bonus | N/A | These award points, not compute monetary values |

**Assessment:** The POS read endpoint already returns `ratio_per_point` and `points_value` via `build_pos_loyalty_blob`. The POS frontend uses these values to compute how many points to redeem for a given ₹ discount. The manual redeem endpoint then receives the point count and deducts.

**No missing integration of `get_redemption_value_for_tier` — the architecture is: POS reads value → POS frontend computes → CRM deducts points.**

**Question for owner (Q-L4-2):** Should the manual redeem endpoint also return `redemption_value_used` (rupees per point at time of redemption) in the PT doc for audit trail? Currently PT docs don't record the exchange rate.

---

## 7. Exact Files & Lines to Change

### Bundle 1: Manual redeem counter fix (`routers/points.py`)

| Line(s) | Current | Change |
|---|---|---|
| 41-44 | `update_data = {"total_points": new_balance, "tier": new_tier, "last_visit": ...}` | After line 44, add: `if tx_data.transaction_type == "redeem": update_data["total_points_redeemed"] = customer.get("total_points_redeemed", 0) + tx_data.points` |
| 47-49 | earn path only updates `total_spent` and `total_visits` | After the earn block, add: `if tx_data.transaction_type == "earn": update_data["total_points_earned"] = customer.get("total_points_earned", 0) + tx_data.points` |

**Alternative (cleaner):** Use `$inc` for `total_points_redeemed` / `total_points_earned` instead of `$set` to avoid read-then-write race conditions. This requires splitting the `update_one` into `$set` + `$inc` using a combined update document (same pattern as POS L2 at `pos.py:1262-1264`).

### Bundle 2: Birthday bonus counter + tier fix (`core/loyalty_jobs.py`)

| Line(s) | Current | Change |
|---|---|---|
| 58-60 | `$set {"total_points": new_points, "last_birthday_bonus_year": current_year}` | Add to `$set`: `"tier": calculate_tier(new_points, settings)`. Change to combined `$set` + `$inc {"total_points_earned": bonus_points}`. |

### Bundle 3: Anniversary bonus counter + tier fix (`core/loyalty_jobs.py`)

| Line(s) | Current | Change |
|---|---|---|
| 143-145 | Same as birthday | Same fix: `$set tier`, `$inc total_points_earned`. |

### Bundle 4: Datetime safety (`core/loyalty_jobs.py`)

| Line(s) | Risk ID | Change |
|---|---|---|
| After 211 | RISK-DT-1 | Add `if lr_date.tzinfo is None: lr_date = lr_date.replace(tzinfo=timezone.utc)` |
| After 229 | RISK-DT-2 | Add `if tx_date.tzinfo is None: tx_date = tx_date.replace(tzinfo=timezone.utc)` |
| 235 | RISK-DT-2 | Narrow `except Exception` to `except (ValueError, TypeError)` — same principle as BUG-L3-001 |

---

## 8. Files Touched Summary

| File | Bundles | Estimated diff |
|---|---|---|
| `backend/routers/points.py` | B1 | +8 / −2 |
| `backend/core/loyalty_jobs.py` | B2, B3, B4 | +20 / −6 |

**Files NOT touched:**
- `core/loyalty.py` — no change
- `core/helpers.py` — no change
- `models/schemas.py` — no change
- `routers/pos.py` — no change (L2 already correct)
- `routers/migration.py` — no change (L3 already correct)
- Frontend — no change

---

## 9. QA Matrix

### Static QA (harness)

| # | Section | Assertions | Covers |
|---|---|---|---|
| QA-1 | Manual redeem: `$set total_points`, `$inc total_points_redeemed`, tier recompute | 4 | B1 / DEFECT-L4-R1 |
| QA-2 | Manual earn: `$inc total_points_earned` present | 2 | B1 / DEFECT-L4-R3 |
| QA-3 | Birthday bonus: `$inc total_points_earned`, `$set tier`, dedup preserved | 4 | B2 / DEFECT-L4-B1, B2 |
| QA-4 | Anniversary bonus: same as QA-3 | 4 | B3 / DEFECT-L4-A1, A2 |
| QA-5 | DT safety: naive-to-UTC coercion present at lines 211, 229 | 2 | B4 / RISK-DT-1, DT-2 |
| QA-6 | DT safety: `except` clause narrowed at line 235 | 1 | B4 / RISK-DT-2 |
| QA-7 | Source invariant: POS L2 `$inc total_points_earned` unchanged | 1 | Regression |
| QA-8 | Source invariant: Migration L3 `$set total_points_earned` unchanged | 1 | Regression |
| QA-9 | Source invariant: BUG-L3-001 fix markers preserved | 2 | Regression |
| QA-10 | LX-A regression: `build_pos_loyalty_blob` strict 6-key | 1 | Regression |
| QA-11 | LF-MERGE regression: `clean_slate = loyalty_enabled_flag` in migration.py | 1 | Regression |
| **Total** | | **~23** | |

### Live smoke (optional, post-implementation)

If owner is willing to manually award a birthday/anniversary bonus or trigger a manual redeem on a test customer, the agent can verify counter correctness in the DB.

---

## 10. Owner Questions

### Q-L4-1: Server-side redemption guardrails

Should L4 add server-side enforcement of `min_redemption_points`, `max_redemption_percent`, and `max_redemption_amount` to the manual redeem endpoint? Currently the endpoint accepts any point count ≥ 1 with only an "insufficient points" check. The POS frontend could enforce these, but a server-side check would prevent bypass.

**Recommendation:** Yes, add validation. Two lines of code, prevents inconsistent redemptions.

### Q-L4-2: Record exchange rate on redeem PT docs

Should the redeem PT doc include `redemption_value` (₹ per point at time of redemption) for audit trail? Currently only `points` and `balance_after` are stored, not the rupee value.

**Recommendation:** Nice-to-have, not blocking. Can defer to L5.

### Q-L4-3: `total_points_earned` for bonus type

Should birthday/anniversary bonus points count toward `total_points_earned`? The current `total_points_earned` was defined in L3 as "total lifetime points earned including expired." Bonus points are a different category (gifted, not earned on orders).

**Recommendation:** Yes, include. The balance identity requires `total_points ≤ total_points_earned − total_points_redeemed` to always hold. If bonus points increase `total_points` without growing `total_points_earned`, the identity breaks the moment any redeem happens. POS realtime already counts first-visit bonus toward `total_points_earned` (see `pos.py:636`).

**If owner disagrees:** An alternative is a separate `total_bonus_points` counter, but this adds schema complexity for marginal value.

---

## 11. Recommended Implementation Bundle

### Priority order (all in one PR):

1. **B1 — Manual transaction counters** (`routers/points.py`): `$inc total_points_redeemed` on redeem, `$inc total_points_earned` on earn.
2. **B2 — Birthday bonus counters + tier** (`core/loyalty_jobs.py`): `$inc total_points_earned`, `$set tier`.
3. **B3 — Anniversary bonus counters + tier** (`core/loyalty_jobs.py`): Same.
4. **B4 — Datetime safety** (`core/loyalty_jobs.py`): Naive-to-UTC coercion + narrow `except`.

### Out of scope for L4:

- Redemption min/max validation (deferred to owner answer on Q-L4-1)
- Redemption exchange rate audit trail (Q-L4-2, defer to L5)
- `run_points_expiry` string comparison fix (RISK-DT-3, defer to L5)
- Any wallet/coupon changes
- Any frontend changes
- Any prod deploy

### Estimated size:

- 2 files touched
- ~28 lines changed
- ~23 QA assertions
- No schema change, no DB migration, no env change

---

## 12. Status

`cr001c_loyalty_l4_analysis_waiting_owner_approval`

Awaiting owner answers on Q-L4-1 through Q-L4-3, then proceed to implementation.
