# ISSUE-10 — Customer Migration Sync Stops Mid-Loop on Every Run

> **Type:** P1 Production Reliability Bug
> **Discovered:** 2026-05-21 — owner observation while running customer sync for restaurant 689 (kunafamahal)
> **Status:** Open — awaiting raw MyGenie API response for root-cause analysis (owner action)
> **Code surface:** `/app/backend/routers/customers.py` `background_customer_sync` (L25–258), endpoint `POST /api/customers/sync-from-mygenie`
> **Related:** CR-001B (migration audit)

---

## 1. TL;DR

The customer sync background task in `/app/backend/routers/customers.py` (`background_customer_sync`) crashes silently somewhere inside the per-customer processing loop on **every** restaurant we have data for. Some customers get inserted, the loop then raises an exception, the broad `except` at L256 catches it and writes the error string to an **in-memory** `customer_sync_status[user_id]` dict — which is lost on backend restart and never persisted to MongoDB.

`last_customer_sync_at` is `None` for every user in production, which confirms the loop never reached its final success line (L248) for any restaurant.

---

## 2. Evidence

| Restaurant | `total_customers_in_pos` | Customers with `mygenie_synced=true` | % | `last_customer_sync_at` |
|---|---:|---:|---:|---|
| 478 | 67 | 13 | 19.4% | None |
| 523 | 35 | 8 | 22.9% | None |
| 558 | 7 | 5 | 71.4% | None |
| 364 | 17 | 2 | 11.8% | None |
| 675 | 58 | 7 | 12.1% | None |
| 475 | 4,229 | 3 | 0.1% | None |
| 391 | 10 | 2 | 20.0% | None |
| 689 | 2,034 | **6** | **0.3%** | None |

For restaurant 689, the 6 inserted customers have `pos_customer_id` values `[22, 1301, 3840, 6759, 16246, 16247]` — non-contiguous, scattered across MyGenie's ID range. This rules out "only first page processed" and points to "loop crashes on a specific record".

`last_customer_sync_at` being `None` everywhere confirms the only line in code that sets it (L246-249) was never reached for any restaurant.

---

## 3. Likely root causes (ranked)

### 3.1 Top hypothesis — Hard key access on missing field

The loop body uses `mygenie_customer["id"]` (square-bracket, raises `KeyError` if missing) at three places:

- L89 (email fallback): `f"customer{mygenie_customer['id']}@mygenie.local"`
- L101 (assignment): `"pos_customer_id": mygenie_customer["id"]`
- L154 (dedup lookup): `"pos_customer_id": mygenie_customer["id"]`

If even one record from MyGenie comes back without an `id`, the loop raises and the catch at L256 ends the entire sync. No partial commit because each successful customer is `insert_one` / `update_one` atomically — explaining why we see a non-trivial count of inserted records before the crash.

### 3.2 Other plausible causes

- L94 `int(mygenie_customer.get("total_points_earned") or 0)` — fails on non-numeric strings like `"-"` or `""`.
- L97-99 same risk on `wallet_balance`, `total_wallet_received`, `total_wallet_used` via `float(...)`.
- L130 `str(mg_addr["zone_id"])` is inside an `if zone_id is not None` guard but uses `mg_addr["zone_id"]` (bracket) instead of `.get("zone_id")` — still OK because of the prior `mg_addr.get("zone_id") is not None`.
- L141 `tier = "Bronze"` / `"Gold"` — needs numeric `points`; the L94 cast must succeed first.
- L181 `db.customers.insert_one(customer_data)` — fails if any unique index conflicts (e.g., `email` unique). Customer email defaults to `customer{id}@mygenie.local` if missing — collision with another tenant's customer that has the same `id` could trigger duplicate-key error.
- L190-231 — four `insert_one` calls into `points_transactions` / `wallet_transactions` inside the same try block; any of these can fail with unindexed-write errors.

### 3.3 Why the error is invisible

- `customer_sync_status` (L23) is a module-level dict — process-local memory. Restart clears it.
- L256-258 `except Exception as e: customer_sync_status[user_id]["status"] = "failed"; ...["error"] = str(e)` — does not log, does not persist to DB, does not bubble up.
- The `sync-status` endpoint (L298 in `customers.py`) reads from the same in-memory dict — so the UI sees `failed` only during the same process lifetime. After a restart the UI sees nothing and shows `completed` (or whatever the default is).

---

## 4. What we need to confirm root cause

**Need from owner (read-only artifact):** the raw JSON response of one call:

```
POST https://preprod.mygenie.online/api/v1/vendoremployee/whatsappcrm/customer-migration?page=1
Headers: Authorization: Bearer <restaurant_689_mygenie_token>
         Content-Type: application/json; charset=UTF-8
         X-localization: en
Body: {}
```

Specifically we want:
- Top-level keys: confirm `customers`, `total_customers`, `last_page` are present.
- For each `customers[]` entry: presence of `id`, types of `loyalty_point`, `total_points_earned`, `total_points_redeemed`, `wallet_balance`, `total_wallet_received`, `total_wallet_used`, `total_coupon_used`. Look for nulls / dashes / non-numeric strings.
- Shape of `customer_addresses[]`: any record where `id` is missing or where `zone_id` is a non-castable value?
- Any duplicate `id` within a page?

If the owner cannot share the full response, a redacted sample of the **first 20 records** (with PII masked) is enough.

---

## 5. Recommended remediation (Phase 1.5 — bundled with CR-001B)

| # | Action | Risk |
|---|---|---|
| F1 | Replace hard key access `mygenie_customer["id"]` with `.get("id")` and skip the record (with logged warning) if missing. Apply at L89, L101, L154. | Low — additive guard |
| F2 | Wrap each per-customer iteration in its own `try / except` so one bad record doesn't kill the loop. Log each failure with `pos_customer_id` (if any), page number, and exception. Increment a `failed_count` counter exposed in `customer_sync_status`. | Low |
| F3 | Coerce numeric fields safely: `_safe_int(v, default=0)`, `_safe_float(v, default=0.0)` helpers. Apply to L94-100 + L189-228. | Low |
| F4 | **Persist sync status to MongoDB** (not just in-memory). New collection `customer_sync_runs` capturing per-run start, end, page progress, success counts, error count, last error, list of failed `pos_customer_id`s. Survives restart. | Low — additive write path |
| F5 | Add structured logger calls at the start of each page (page N of M, customer_list_size) and on each successful insert/update. Use `logger = logging.getLogger("customer_sync")` (already declared L10 but unused). | Low |
| F6 | After F1-F5 land, re-run sync for each restaurant and verify `synced + updated + failed == total_customers_in_pos`. | n/a |

Optional but recommended:
- F7 — Cap `customer_addresses` parsing similarly; one bad address shouldn't drop the whole customer.
- F8 — Migrate `customer_sync_status` access in `sync-status` endpoint to read from the new persisted collection (after F4).

---

## 6. Owner decisions (added to CR-001B)

| Q# | Topic | Options | Recommended |
|---|---|---|---|
| **Q17** | Authorize ISSUE-10 hotfix (F1–F6) under CR-001B | A) authorize all; B) F1+F2 only (minimal); C) defer | **A** |
| **Q18** | After hotfix, re-sync customers for which restaurants? | A) all 8 (every restaurant in `users` with `total_customers_in_pos`); B) only the active production restaurants; C) only restaurant 689 (the one originally flagged) | **A** |

---

## 7. Status

```
issue_10_awaiting_owner_payload_for_rca
```

Once the raw MyGenie response is provided, root cause will be pinned (likely on a specific record shape) and F1–F6 will be locked. F1+F2+F4 are safe enough to ship even without the raw response.
