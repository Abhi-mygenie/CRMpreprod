# CR-108 — Impact Analysis + Implementation Plan (combined)
**Date**: 2026-10-09 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_09_INTAKE_CR108_COUPON_CODE_TRAILING_SPACE.md` · **Risk**: LOW (data-only, no code change) · **Status**: ✅ OWNER APPROVED — gate open on "choose implementation role for CR-108" · **No code changed.**

---

## 0. CR classification reminder

CR-108 is a **DATA-only CR** — a single MongoDB `updateMany` command. Zero code files change. No server restart. No QA suite needed — verify with a count query.

---

## 1. Impact Analysis

### Code reality

`validate_coupon_for_customer` (coupon.py:1677):
```python
code_upper = (code or "").strip().upper()   # input stripped ✅
...
await db.coupons.find_one({"user_id": user_id, "code": code_upper})  # exact match ❌
```

The input is stripped before the query. The stored value is **not** stripped before storage. MongoDB string comparison is exact — `"FLAT TODAY"` ≠ `"FLAT TODAY "`. Result: `INVALID_CODE` for a valid coupon.

Same issue applies to `list_available_coupons` (same lookup pattern).

**Root cause location**: data entry — coupons were created via the CRM UI or API with trailing spaces in the `code` field. The create/update routes do not strip the value before storing.

### Live evidence (confirmed during intake probe)

| Code (stored) | Tenant | Active | Usage count |
|---|---|---|---|
| `'TEST HAPPY '` | r689 | ✅ | 0 |
| `'10 PERCENT DISCOUNT '` | r689 | ✅ | 0 |
| `'TEST 20 '` | r689 | ✅ | 1 |
| `'FLAT TODAY '` | r689 | ✅ | 0 |
| `'FLAT DISCOUNT '` | r601 | ✅ | 0 |
| `'PERCENTAGE OFF '` | r601 | ✅ | 0 |
| `'HAPPY HOUR '` | r541 | ✅ | 0 |
| `'50 FF '` | r558 | ✅ | 0 |
| `'40 OFF '` | r558 | ✅ | 2 |
| `'HAPPY HOUR '` | r762 | ✅ | 0 |
| `'NTH '` | r523 | ❌ inactive | 0 |

**Total: 11 coupon docs (10 active, 1 inactive) across 6 tenants.**

### Why usage records are safe

`coupon_usage` documents store `coupon_id` (UUID), not the `code` string. Updating the `code` field in `coupons` collection does NOT break any `coupon_usage` lookup — both before and after the fix, `coupon_usage` is joined by `coupon_id`. ✅ Zero usage data impact.

### Why PROC-001 does not apply

PROC-001 governs structural data changes (customer deduplication, point backfills, order links). This is a cosmetic whitespace trim — strip 1–2 trailing characters from a display string. No relationship data changes, no balances, no loyalty impact.

### Conflict check — none

No open CR touches the `coupons.code` field. CR-081 (POS coupon management CRUD) is implemented; its create/update routes do not strip codes — **a forward fix is needed** (add `.strip().upper()` at storage time) to prevent recurrence. This is noted in §3 below.

---

## 2. Implementation Plan

### Step 1 — Dry run (confirm scope before writing)

```javascript
db.coupons.find(
  { "code": /\s/ },
  { _id: 0, code: 1, user_id: 1, is_active: 1 }
)
// Expected: 11 docs matching the list above
```

### Step 2 — Write (strip whitespace from all coupon codes)

```javascript
db.coupons.updateMany(
  { "code": /\s/ },
  [{ "$set": { "code": { "$trim": { "input": "$code" } } } }]
)
// Expected: { acknowledged: true, matchedCount: 11, modifiedCount: 11 }
```

### Step 3 — Verify

```javascript
db.coupons.find({ "code": /\s/ }).count()
// Expected: 0

// Spot-check: confirm FLAT TODAY is now exactly "FLAT TODAY"
db.coupons.findOne({ "code": "FLAT TODAY" }, { _id: 0, code: 1, user_id: 1 })
// Expected: { code: "FLAT TODAY", user_id: "pos_0001_restaurant_689" }
```

### Step 4 — Update RUNBOOK.md §13 status (already written — mark as executed)

Already added to RUNBOOK.md §13. After execution, note the date in the runbook.

---

## 3. Forward-fix note (out of scope for CR-108, register as follow-up)

The create/update routes (`POST /api/coupons`, `PUT /api/coupons/:id`) do not strip or normalise the `code` field before storage. To prevent recurrence, a future CR should add:
```python
code = (payload.code or "").strip().upper()  # before DB write
```
This is a **separate CR** — not part of this data fix. Register as low-priority housekeeping.

---

## 4. Verification matrix

| V | Check | Expected |
|---|---|---|
| V1 | `db.coupons.find({"code":/\s/}).count()` after command | 0 |
| V2 | `db.coupons.findOne({"code":"FLAT TODAY"})` | doc found, `code:"FLAT TODAY"` |
| V3 | `POST /scan/coupons/validate {code:"FLAT TODAY", order_total:500}` (customer token) | `valid:true` or `MIN_ORDER`/`EXPIRED` — NOT `INVALID_CODE` |
| V4 | `POST /scan/coupons/validate {code:"40 OFF", order_total:500}` | NOT `INVALID_CODE` |
| V5 | Total `coupons` count before = total after | +0 documents (update, not insert) |
| V6 | `coupon_usage` count before = after | Unchanged — no usage records touched |

---

## 5. Files

**WILL change**: MongoDB `coupons` collection — 11 documents (code field whitespace stripped)
**WILL NOT touch**: any code file · `coupon_usage` collection · `loyalty_settings` · `customers` · indexes

---

## 6. Rollback

Rollback is unnecessary (whitespace stripped = correct value) but theoretically possible: store the original 11 codes before running. They are listed in §1 above. `updateMany` in reverse would restore them (adding spaces back) — pointless in practice.

---

```
Planning complete: CR-108
Stage: IA + Implementation Plan (combined — zero owner questions)
Code reality: DATA ONLY — coupon.code field has trailing spaces in 11 docs
Risk: LOW
Files WILL change: coupons collection (11 docs, code field only)
Files WILL NOT touch: any code file, coupon_usage, loyalty data
Owner decisions: none required — trivial fix
Forward-fix: note to register separate CR for .strip().upper() at storage time
Docs: planning/CR_108_IMPACT_ANALYSIS_AND_IMPL_PLAN.md
Next: "choose implementation role for CR-108" → execute MongoDB command → verify
```
