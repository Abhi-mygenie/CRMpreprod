# CR-108 — Intake: Strip trailing/leading spaces from coupon `code` field (data hygiene)
**Date**: 2026-10-09 · **Role**: Intake Agent · **Source**: Scan & Order agent flag + CR-105 self-test NOTE + RUNBOOK.md §13 · **No code changed.**

---

## 1. Owner Request
> "FLAT TODAY and any coupon with a trailing space in the DB will show Invalid Code until CRM cleans their data — worth flagging in your next reply" — Scan & Order agent, 2026-10-09.
> Owner confirmed: register as official CR.

---

## 2. Problem

`validate_coupon_for_customer` (coupon.py:1677) normalises the **input**:
```python
code_upper = (code or "").strip().upper()
```
But the DB query is an **exact match**:
```python
await db.coupons.find_one({"user_id": user_id, "code": code_upper})
```
A coupon stored as `"FLAT TODAY "` (trailing space) is never found when a diner types `"FLAT TODAY"` (stripped). Result: **`INVALID_CODE` for a valid coupon** — directly reported by Scan & Order.

The same bug affects `list_available_coupons` (coupon.py:1979) and `record_coupon_usage_for_order` — any lookup by `code` string.

---

## 3. Live evidence (read-only probe 2026-10-09)

| Coupon code (stored) | Tenant | Active | Usage |
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

**Total: 11 coupon docs across 6 tenants** (10 active, 1 inactive).

**Usage safety**: `coupon_usage` docs store `coupon_id` (UUID) — NOT the `code` string. Updating the `code` field leaves all historical usage records intact. ✅ Safe.

---

## 4. Classification

| Field | Value |
|---|---|
| **Type** | DATA — one-time MongoDB `updateMany` |
| **Severity** | **P1** — S&O currently gets `INVALID_CODE` on 10 live coupons; restaurant owners cannot apply these coupons at POS without first knowing the exact stored string |
| **Risk** | **LOW** — strips whitespace only; no business logic change; no code file touched; usage data unaffected; single idempotent command |
| **Duplicate check** | **RELATED to CR-101** (data hygiene, end of batch) — **but can run independently and immediately** since it's a one-liner with zero dependency on other data ops |
| **Blast radius** | SMALL — 11 coupon docs, 6 tenants, 0 code files, 0 index changes |

---

## 5. Fix

**One MongoDB command — idempotent, copy-pasteable:**

```javascript
// Step 1 — dry-run: confirm affected codes
db.coupons.find({ "code": /\s/ }, { _id: 0, code: 1, user_id: 1, is_active: 1 })
// Expected: 11 docs

// Step 2 — write: strip all leading/trailing whitespace from coupon codes
db.coupons.updateMany(
  { "code": /\s/ },
  [{ "$set": { "code": { "$trim": { "input": "$code" } } } }]
)
// Expected: 11 documents updated

// Step 3 — verify
db.coupons.find({ "code": /\s/ }).count()
// Expected: 0
```

**Full procedure documented in RUNBOOK.md §13.**

---

## 6. When to run

| Option | Timing | Recommendation |
|---|---|---|
| **Now (independently)** | Run immediately — unblocks S&O today | **Recommended** — P1 impact, trivial risk, zero code dependency |
| Fold into CR-101 | Run at end of batch with other data ops | Acceptable if owner wants all data ops together |

---

## 7. No owner questions — all decisions trivially clear

| | Decision |
|---|---|
| Run now or end of batch? | **Owner choice** — both are safe |
| Fix approach | Only option: `$trim` command — safe, idempotent |
| Code change needed? | No |
| PROC-001 required? | No — this is a tiny whitespace strip, not a structural data change. Standard dry-run + verify is sufficient |

---

## 8. Downstream note to Scan & Order

Until this command is run: **advise S&O to `.trim()` coupon codes client-side** before sending to `POST /scan/coupons/validate`. Already noted in `handoff/CRM_TO_SCAN_ORDER_FULL_CONTRACT_V2_1_AND_CR105_CR107_2026_10_09.md §4`.

---

```
Intake complete: CR-108
Classification: DATA — one-time MongoDB updateMany
Severity: P1 (S&O INVALID_CODE on live coupons)
Risk: LOW (whitespace strip only; zero code change; usage data unaffected)
Duplicate check: RELATED to CR-101 (data hygiene); DISTINCT (can run independently)
Evidence: 11 docs across 6 tenants confirmed; usage data intact
Blast radius: SMALL (11 coupon docs, 0 code files)
Docs: discovery/SESSION_2026_10_09_INTAKE_CR108_COUPON_CODE_TRAILING_SPACE.md
Owner decisions: none required (trivial fix; timing is owner's choice: now vs CR-101 batch end)
Next: owner confirms timing → run the command → verify → close
```
