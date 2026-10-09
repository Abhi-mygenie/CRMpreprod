# INV-018 — Customer Order Linkage Gaps ("all the orders are not coming")

**Trigger:** Owner follow-up on INV-017 Q-O-4 (POS orders visible in `/scan/orders`?)
**Role:** INVESTIGATION · **Risk:** CRITICAL (customer identity / POS ingest / production data) · **Code changed:** NONE
**Steps used:** 4/10 · **Date:** 2026-09-15
**Evidence basis:** live Mongo aggregates (no PII), `routers/pos.py:636-712` (`_find_or_create_customer`), `routers/migration.py:188-231, 304`, `routers/scan.py:303-430`

---

## 1. Numbers (live preprod DB, 2026-09-15)

| Metric | Value |
|---|---|
| Orders total | 66,977 |
| Linked to a customer (`customer_id` set) | 18,778 (28%) |
| Unlinked | 48,199 |
| └ A. `cust_mobile == ""` (POS sent no phone) | **44,682** (93% of unlinked) — 145 of these via realtime webhook, rest via migration/sync (`mygenie_synced`, `last_synced_at` present) |
| └ B. phone present, no `customer_id` | **3,517** — all via migration path; ~98% have **no customer record at all** in that tenant; ~2% match an existing customer by last-10 digits (format mismatch) |
| Unlinked by tenant (top 5) | `…restaurant_541` 12,254 · `…644` 10,812 · `…689` 6,357 · `…601` 4,414 · `…623` 2,392 |
| Customers total | 7,417 |
| `customers.phone` format | 10-digit 7,258 · `+…` 36 · `91…` 17 · other 185 |
| `orders.cust_mobile` format (non-empty) | 10-digit 17,201 · `+…` 749 · `91…` 31 · other 1,542 (digit-length 11–14, spaces) |
| Duplicate customers (same tenant, same last-10 digits, different format) | **38 groups / 45 extra records** |
| …of which orders are split across the duplicate records | **31 of 38** |

---

## 2. Code trace

| Path | Customer resolution | Creates if missing? | Phone normalisation |
|---|---|---|---|
| Realtime `POST /api/pos/orders` → `_find_or_create_customer` (`pos.py:665-712`) | 1) `pos_customer_id == order.user_id` 2) exact `phone == cust_mobile` | **YES** (name `Customer XXXX`, phone stored as received) | **NONE** |
| Migration/sync (`migration.py:210-225`) | 1) `pos_customer_id` variants 2) exact `phone == cust_mobile` | **NO** → `customer_id: None` written (`:225`, `:304`) | **NONE** |
| `/scan/auth/skip-otp`, `register`, `login`, `request-otp` (`scan.py`) | exact `phone == req.phone` | skip-otp / verify-otp: **YES** (empty-name customer) | **NONE** |

---

## 3. Gaps

### GAP-13 · Migration never creates customers (BE, HIGH)
Historical sync writes orders with `customer_id: None` when the phone is unknown, unlike realtime ingest. 3,517 orders orphaned. Parity fix needed + backfill.

### GAP-14 · Zero phone normalisation → duplicate customers & split history (BE, **CRITICAL for Customer App**)
Same person stored as `9876543210` and `+919876543210` (38 confirmed groups). Direct consequence for the Customer App: `skip-otp` with a format that differs from what POS sent → CRM silently creates a **new empty customer**, token points at it, `/scan/orders` returns **0 orders** although they exist under the sibling record. No error is surfaced.

### DATA-A · POS sends no phone on 93% of unlinked orders (POS/process, not CRM)
Cannot be linked by anyone. Needs POS-side answer (see §5) — possibly send `user_id` (POS customer id) even when phone is blank; CRM already matches on it first.

---

## 4. Proposed CRM fixes (NOT built — owner approval required, hotspot files)

| Id | Fix | Files | Risk |
|---|---|---|---|
| P-8 | Normalise phone to canonical form at every entry point (POS ingest, migration, all `/scan/auth/*`, `/pos/customer-lookup`, `/pos/customers`); match on canonical form; keep raw value in a secondary field | `routers/pos.py`, `routers/migration.py`, `routers/scan.py`, `core/helpers.py` | **CRITICAL** — customer identity/merge rules (addendum §14 do-not-change without approval) |
| P-9 | Migration creates customers for unknown phones (parity with realtime `_find_or_create_customer`) | `routers/migration.py` | HIGH |
| P-10 | Backfill: (a) dry-run report of linkable orphan orders + duplicate groups, (b) owner sign-off, (c) link orders by canonical phone / `pos_customer_id`, merge 38 duplicate customers (points/wallet/visits summed, audit log) | `backend/scripts/` (new) | **CRITICAL** — production data write |

Canonical form to agree across POS / Customer App / CRM: **10-digit national number, digits only** (open question Q6 for non-Indian numbers).

---

## 5. Brief for POS (MyGenie) agent — questions to answer

**1. Phone capture — why is `cust_mobile` empty on 44,682 orders?**
- Q1. Cashier skipped it (walk-in), or does POS not send the phone in some flows (dine-in/table, KOT-first, room-service, aggregator orders)?
- Q2. Does POS hold a customer id (`user_id`) for those orders even when phone is blank? If yes, send it on the webhook — CRM matches on `pos_customer_id` before phone.
- Q3. Top tenants: `541`, `644`, `689`, `601`, `623`. Dine-in-heavy venues, or a POS build/flow dropping the phone?

**2. Phone format — POS sends 4+ shapes**
- Q4. Source of variation — POS versions, imported contacts, manual entry with country code, aggregator masked numbers?
- Q5. Can POS normalise before sending (10-digit national, no `+91`, no spaces, no leading `0`) on **both** `POST /api/pos/orders` **and** `/api/pos/customer-lookup`, `/api/pos/customers`?
- Q6. Non-Indian numbers — do they exist? If so, agree a canonical form (E.164 for those only) so "strip to 10 digits" doesn't corrupt them.
- Q7. Confirm the exact format POS uses so the Customer App can lock `skip-otp`/`login`/`register` to the same one.

**3. Historical orders**
- Q8. Does POS order-history API (`/pos/customers/{customer_id}/orders`) return `user_id` for old orders? (CRM could backfill by `pos_customer_id` — more reliable than phone.)
- Q9. Is a POS customer export available to reconcile the 38 duplicate customer pairs?

**4. Alignment one-liner**
> Canonical phone = 10-digit national, digits only. POS sends it on orders and lookups; Customer App sends it on `skip-otp`/`login`/`register`; CRM normalises defensively (P-8) and matches on it.

---

## 6. Brief for Customer App agent (addendum to INV-017)
1. Orders with no phone at POS will never appear — POS/cashier data issue, not missing data.
2. Send phone in **one canonical format** (10-digit national, digits only) to `skip-otp`/`register`/`login`, matching what POS sends. Until CRM ships P-8, a format mismatch = empty profile with 0 orders.
3. "Missing orders" reports → suspect duplicate customer record (GAP-14) first.

---

## 7. Output
```text
Investigation complete: INV-018
Root cause: (1) 93% of unlinked orders carry no phone from POS — DATA, not CRM defect; (2) migration path never creates customers (GAP-13); (3) no phone normalisation anywhere → duplicate customers, split order history, Customer App sees 0 orders on format mismatch (GAP-14)
Classification: DATA + BE
Confidence: HIGH
Steps used: 4/10
Evidence: this file §1-§2
Recommendation: Owner decision on P-8/P-9/P-10 (CRITICAL hotspots) → Intake. Send §5 to POS agent, §6 to Customer App agent now.
```
