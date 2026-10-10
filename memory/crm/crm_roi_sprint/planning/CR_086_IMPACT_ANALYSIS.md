# CR-086 — Impact Analysis: POS customers missing from CRM (customer_sync 401 failures)
**Date**: 2026-10-09 · **Role**: Planning Agent · **Source**: `discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md §3` + read-only DB probe 2026-10-09 · **Status**: 🟡 IA in progress — owner decisions Q1/Q2/Q3 pending · **No code changed.**

---

## 1. Root cause — CORRECTED from intake assumption

**Intake stated:** sync times out for large tenants.
**Confirmed today:** ALL 3 tenants failed with `'API error on page 1: 401'` — not a timeout.

The `mygenie_token` stored in `users.mygenie_token` for each tenant **has expired**. The sync hits the MyGenie POS API on page 1 and immediately gets a 401 → records 0 customers → `status: failed`.

| Tenant | Email | Last successful sync | Token status |
|---|---|---|---|
| r541 | `owner@palmhouse.com` | 2026-05-25 | **EXPIRED** (5+ months) |
| r665 | `owner@palmaryanmussoorie01.com` | 2026-06-08 | **EXPIRED** |
| r474 | `owner@welcomeresort.com` | 2026-06-06 | **EXPIRED** |

The tokens themselves are stored in `users.mygenie_token`. The sync endpoint (`POST /api/migration/trigger-customer-sync`) uses them like this:
```python
mygenie_token = request.headers.get("X-MyGenie-Token")   # header override
if not mygenie_token:
    mygenie_token = user_record.get("mygenie_token")       # fallback: stored token
```
A fresh token can be provided via the `X-MyGenie-Token` header **without any code change**.

---

## 2. Live evidence (read-only 2026-10-09)

### Corrected revenue figures (using `order_amount` field — previous ₹21.9L estimate used wrong field)

| Tenant | CRM customers | Orphan orders | Unique phones | Invisible revenue |
|---|---|---|---|---|
| **r541** (Palm House) | 313 | **12,254** | 323 | **₹75,80,528** |
| **r665** (Palm Aryan Mussoorie) | 200 | **1,426** | 922 | **₹9,23,108** |
| **r474** (Welcome Resort) | 53 | **1,492** | 491 | **₹12,53,012** |
| **Total** | **566** | **15,172** | **1,736** | **₹97,56,648 (~₹1 crore)** |

All orphan orders have `cust_mobile` set (real customers with phones, not anonymous). These are genuine customer orders — not guest/junk-phone orders.

---

## 3. How orders ended up with `customer_id: null`

`background_order_sync` (migration.py:44) processes each order like this:
```python
# Lookup by pos_customer_id, then by phone (phone_match)
customer = db.customers.find_one(phone_match(user_id, phone, cc))
order_doc["customer_id"] = customer["id"] if customer else None
```
Because `background_customer_sync` never imported the customers (401 fail), there are no matching records → all orders written with `customer_id: None`.

---

## 4. Three-part fix

### Part A — Token refresh + re-run customer sync (no code change needed)

**Mechanism already exists.** The sync endpoint accepts a fresh token via `X-MyGenie-Token` header:
```bash
POST /api/migration/trigger-customer-sync
X-MyGenie-Token: <fresh_token>
Authorization: Bearer <staff_jwt>
```

**How to get a fresh token:** The owner logs into CRM (which calls `MYGENIE_CRM_TOKEN_ENDPOINT` and stores the token in `users.mygenie_token`). OR a CRM admin provides the token directly via the header.

**Q1 (owner)**: How to refresh expired tokens for these 3 tenants?
- **(a)** Ask each restaurant owner to log into CRM — triggers automatic token refresh
- **(b)** Add a "Force re-authenticate" button in the CRM sync UI that calls `MYGENIE_CRM_TOKEN_ENDPOINT`
- **(c)** Admin manually calls `/api/migration/trigger-customer-sync` with a fresh token per tenant (operational, zero code)
- **Recommendation: (a)** — simplest, no code, owner login already handles refresh

### Part B — Re-link existing orphan orders after Part A

After Part A succeeds and customers are imported, existing orders have `customer_id: null` pointing to now-existing customers. Re-running `background_order_sync` re-processes orders and fills in `customer_id` via phone match.

**Q2 (owner)**: After customer sync succeeds:
- **(a)** Re-run `background_order_sync` manually per tenant (trigger via CRM sync UI, same X-MyGenie-Token)
- **(b)** Build a dedicated "re-link orphan orders" script that updates orders without fetching from API
- **Recommendation: (a)** — simplest, existing mechanism, no code change

### Part C — Prevent future orphans: order sync creates missing customers (CODE CHANGE)

When `background_order_sync` finds a phone with no matching CRM customer, it currently sets `customer_id: None`. If the customer sync had failed again, orphans will accumulate again.

**Fix sketch (routers/migration.py ~30 lines):**
```python
if not customer and cust_mobile:
    # CR-086 Part C: create minimal stub customer (Bronze, 0 pts, source="order_sync")
    customer = await _create_stub_customer(db, user_id, phone, cc, cust_name, source="order_sync")
```

This prevents future orphans regardless of token status.

**Q3 (owner)**:
- **(a)** Implement Part C (create stub customers during order sync) — ~30 lines, LOW risk, MEDIUM blast radius (§14 customer identity)
- **(b)** Don't — rely on customer sync being up to date
- **Recommendation: (a)** — prevents recurrence; stub customers get enriched later when customer sync runs

---

## 5. Files that WILL change

| Scenario | Files |
|---|---|
| Part A only (Q1=a or c) | **NONE** — operational |
| Part A + B (Q1=a, Q2=a) | **NONE** — operational |
| Part C (Q3=a) | `routers/migration.py` (~30 lines: stub creation in `background_order_sync`) |
| If Q1=b (token refresh UI) | `routers/customers.py` (sync trigger endpoint) + possibly `CouponsPage.jsx` neighbour |

---

## 6. Risk

| Part | Risk | Note |
|---|---|---|
| A + B | **NONE** — operational | No code change; uses existing sync mechanisms |
| C | **MEDIUM** (§14 customer identity — creates new customer records) | Stubs are additive; idempotent if phone already exists; CR-085 phone normalisation applies |

---

## 7. Owner questions

| Q | Question | Recommendation |
|---|---|---|
| **Q1** | Token refresh: (a) owner re-login / (b) add UI button / (c) admin provides token | **(a)** — owners log in, triggers auto-refresh, zero code |
| **Q2** | Re-link orphan orders after sync: (a) re-run order sync / (b) separate re-link script | **(a)** — trigger order sync post-customer-sync, zero code |
| **Q3** | Preventive: order sync creates stub customers on unknown phone? (a) yes / (b) no | **(a)** — prevents recurrence; ~30 lines, MEDIUM risk, worth doing |

---

## 8. Note on PROC-001

If Q3=a (stub customer creation): stubs are real customer records in `customers` collection → PROC-001 (production DB validation) applies to verify no corruption.

---

```
Planning complete: CR-086
Stage: Impact Analysis
Root cause: REVISED — not timeout; all 3 tenants have EXPIRED mygenie_token → 401 on page 1
Revenue: REVISED — ₹97,56,648 (~₹1 crore invisible across 3 tenants, 15,172 orphan orders)
Code reality:
  Parts A+B: NONE needed — operational (trigger sync with fresh token)
  Part C: PARTIAL — background_order_sync exists; customer creation not present (~30 lines to add)
Risk: NONE (A+B) · MEDIUM §14 (C)
Files WILL change: only if Q3=a → routers/migration.py
Owner decisions: Q1 (token refresh), Q2 (re-link orders), Q3 (preventive stubs)
Docs: planning/CR_086_IMPACT_ANALYSIS.md
Next: owner answers Q1/Q2/Q3 → Implementation Plan
```
