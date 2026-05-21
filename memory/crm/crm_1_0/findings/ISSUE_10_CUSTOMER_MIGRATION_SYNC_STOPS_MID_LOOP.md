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

## 3. Root cause — CONFIRMED (2026-05-21, via diagnostic logging)

**Verdict: 100% CRM-side bug. Zero POS fault.**

Stack trace from `/var/log/supervisor/backend.err.log` (preview env, after diagnostic patch was applied):

```
Traceback (most recent call last):
  File "/app/backend/routers/customers.py", line 123, in background_customer_sync
    "pos_address_id": str(mg_addr.get("id", "")),
                          ^^^^^^^^^^^
AttributeError: 'NoneType' object has no attribute 'get'
```

### 3.1 Offending code (pre-fix)

`/app/backend/routers/customers.py` L110-113:

```python
mygenie_addresses = mygenie_customer.get("customer_addresses", [])
crm_addresses = []
for idx, mg_addr in enumerate(mygenie_addresses):
    crm_addr = {
        "id": f"addr_{uuid.uuid4().hex[:12]}",
        "pos_address_id": str(mg_addr.get("id", "")),   # ← crashes if mg_addr is None
```

MyGenie's `customer_addresses` array can contain `null` entries (likely soft-deleted addresses that were kept as `null` placeholders in the array). Our parser assumed every element was a dict → `AttributeError` on `mg_addr.get(...)`.

The exception propagates to the outer `try` at L43-258 → `except` at L256 catches it → `customer_sync_status[user_id]["status"] = "failed"` (in-memory only) → loop terminates → **no further customers processed**.

### 3.2 Reproduction proof — 3 restaurants, same line, same exception

Captured by diagnostic logger after the user clicked Sync Again:

| Restaurant | Synced before crash | Failing customer (`pos_customer_id`, name) | Crash line |
|---|---:|---|---|
| 635 | 228 of 234 | `13509` "Jehs Dormitory" | L123 |
| 541 | 0 of N | `19` "sagar" | L123 |
| 689 | 6 of 2,034 | `16511` "meet" | L123 |

The pattern previously observed (every restaurant stalls partway, scattered `pos_customer_id`s, `last_customer_sync_at = None` everywhere) is fully explained by this single bug.

---

## 4. Fix applied (2026-05-21)

### 4.1 Scope (authorized by owner: "apply this fix only, no other edit")

A single 5-line guard inside the `customer_addresses` loop. **No other code changed.** Specifically: did NOT add `.get("id")` safety on `mygenie_customer["id"]`, did NOT add a per-record `try/except`, did NOT persist sync status to MongoDB. Those remain proposals (F1, F2, F4 in §6) if the owner authorizes a wider hotfix later.

### 4.2 Diff

`/app/backend/routers/customers.py` ~L110-L114:

```python
                    # Map customer_addresses from MyGenie into CRM addresses[] format
                    mygenie_addresses = mygenie_customer.get("customer_addresses", [])
                    crm_addresses = []
                    for idx, mg_addr in enumerate(mygenie_addresses):
+                       if not isinstance(mg_addr, dict):
+                           logger.warning(
+                               "customer_sync skipping non-dict address user_id=%s pos_customer_id=%s idx=%s value=%r",
+                               user_id, mygenie_customer.get("id"), idx, mg_addr,
+                           )
+                           continue
                        crm_addr = {
```

Behavior change: null (or any non-dict) address entries are skipped with a logged warning. The rest of the customer record continues to insert normally. Subsequent customers in the loop are unaffected.

### 4.3 Diagnostic logging also retained from the earlier patch

Two lines added before this fix (authorized 2026-05-21, same session):
- INFO log at the start of every per-customer iteration → makes any future per-record failure pinpointable.
- `logger.exception(...)` in the outer `except` block → makes any future task-level crash visible with full traceback.

These were the lines that pinned the root cause in under 2 minutes. They will stay in code.

### 4.4 Verification plan

After fix deploy:

1. Owner re-triggers Sync Customers for restaurant 689 (was 6/2,034) on the preview env (`https://crm-planning-v1.preview.emergentagent.com`).
2. Read `/var/log/supervisor/backend.err.log` and confirm:
   - Per-customer INFO lines progress beyond `pos_customer_id=16511` (the previous crash point).
   - One or more `customer_sync skipping non-dict address` warnings appear (counts how many null addresses we skipped).
   - No `background_task_failed` ERROR line for this run.
   - Final DB count: `customers` where `user_id='pos_0001_restaurant_689'` and `mygenie_synced=true` is close to `total_customers_in_pos=2034`.
3. Repeat for 541 and 635.

### 4.5 Limitations of this fix (intentional, per owner scope)

This fix only addresses the one null-address failure mode. If MyGenie's API ever returns a customer record where:
- the top-level `id` is missing → `mygenie_customer["id"]` at L89/L101/L154 still crashes the loop, or
- `loyalty_point` / `total_points_earned` / `wallet_balance` / etc. is a non-castable string → `int(...)` / `float(...)` at L94-100 still crashes, or
- `db.customers.insert_one` raises a duplicate-key error → still crashes

…the loop will still die silently and we'll be back here. F1 + F2 from §6 (per-record `try/except` + safe `.get()` + safe numeric coercions) are still recommended as the next increment.

---

## 5. Original recommended remediation (Phase 1.5 — partial; superseded by §4 for the immediate fix)

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
issue_10_minimal_fix_deployed_awaiting_verification
```

- ✅ Root cause identified (CRM-side, null entry in `customer_addresses` array).
- ✅ Diagnostic logging added (per-iteration INFO + outer `logger.exception`).
- ✅ Minimal fix deployed to preview env (`/app/backend/routers/customers.py` L114-119 null-address guard).
- ⏳ Awaiting verification re-sync by owner for restaurants 689 / 541 / 635.
- ⏳ Owner has explicitly scoped this fix to the null-address guard only; F1/F2/F4 in §6 remain proposals (will be re-raised if any other failure mode surfaces).
- ⏳ Production deployment not yet done (preview-only).

## 8. Change log

| Date / Time (UTC) | Author | Change |
|---|---|---|
| 2026-05-21 ~10:24 | CR-001 planning continuation | Initial document, hypothesis-only. |
| 2026-05-21 ~11:11 | Same | Diagnostic logging patch deployed (INFO per iteration + `logger.exception` on outer catch). |
| 2026-05-21 ~11:13-11:18 | Owner | Triggered sync for restaurants 635, 541, 689 from preview UI. |
| 2026-05-21 ~11:19 | Same | Root cause confirmed: `mg_addr.get()` on `None` at L123. Hypothesis 3.1 (hard key access on `id`) **disproven**; bug was in address loop instead. |
| 2026-05-21 ~11:21 | Same | Minimal null-address guard deployed (5 lines added). Backend reloaded. |
| 2026-05-21 — pending | Owner | Re-sync verification for 689 / 541 / 635. |
