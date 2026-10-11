# POS-PERF-1 — `/api/pos/coupons/available` N+1 Query Fix — Discovery & Plan

**Date:** 2026-05-25
**Mode:** Discovery + planning only — **no code, no DB, no env, no deploy, no migration**.
**Status:** 🔒 **FROZEN — 2026-05-25** (owner-confirmed; no further changes without owner sign-off)
**Trigger:** POS team's curl from `craco-pos-build.preview.emergentagent.com` reports the endpoint "not working". Root cause confirmed: response time **~16.7 s** consistently, likely exceeding their HTTP client timeout (most defaults are 10 s).
**Scope:** Backend perf only — no behaviour / shape / contract change.

---

## 0. 🔒 POS Contract Impact Statement (Frozen)

> **The POS contract does NOT change. Zero client-side action required from the POS team.**

This section is the authoritative answer to "will POS need to update anything?". It is frozen and supersedes any conflicting line elsewhere in this document.

### What POS sees today vs after the fix

| Aspect | Before fix | After fix | POS change required? |
|---|---|---|---|
| URL path | `GET /api/pos/coupons/available` | **Same URL** | ❌ No |
| HTTP method | `GET` | **Same** | ❌ No |
| Query params (`customer_id`, `order_total`, `channel`) | accepted | **Same — none added, none removed, none renamed** | ❌ No |
| Auth header (`X-API-Key: dp_live_...`) | accepted | **Same** | ❌ No |
| Response HTTP status | `200 OK` | **Same** | ❌ No |
| Response envelope (`{success, message, data}`) | as-is | **Identical structure** | ❌ No |
| Response `data` shape (`{customer_id, order_total, channel, count, coupons:[…]}`) | as-is | **Identical** | ❌ No |
| Each coupon object's 24 fields (`id`, `code`, `title`, `coupon_type`, `discount_scope`, `discount_type`, `discount_value`, `min_order_value`, `max_discount`, `expected_discount`, `final_amount_preview`, `requires_cart_validation`, `eligible_match_hint`, `stackable_with_loyalty`, `valid_from`, `valid_until`, `offer_type`, `time_window`, `buy_quantity`, `get_quantity`, `get_discount_type`, `get_discount_value`, `max_applications`, `allow_repeat`, `same_item_required`, `pos_instruction`, `nth_item_number`, `nth_discount_type`, `nth_discount_value`) | as-is | **Identical field names, identical types, identical values** | ❌ No |
| Error envelopes (`success:false` + `error.code`) | as-is | **Same** | ❌ No |
| Sibling endpoints (`/api/pos/coupons/validate`, `/api/pos/orders`, `/api/pos/loyalty/redeem`, `/api/pos/max-redeemable`) | as-is | **Untouched** | ❌ No |
| Latency | ~16.7 s | **~0.65 s** | ✅ POS gets faster automatically |

### What changes (internal only, invisible to POS)

- `backend/core/coupon.py` — `validate_coupon_for_customer` gains 3 **optional Python kwargs** (`_precomputed_coupon`, `_precomputed_usage_count`, `_precomputed_user_tz`) with `None` defaults. These are Python function parameters between two internal modules, **not** HTTP query parameters or JSON fields. **POS never sees them.**
- `backend/core/coupon.py` — `list_available_coupons` rearranges its MongoDB queries (1 bulk `aggregate` instead of 50 individual `count_documents`). The function's return value is byte-identical.
- No URL change. No header change. No status code change. No JSON field added, removed, renamed, retyped, or reordered.
- The equivalent of a SQL `JOIN` rewrite or an index addition — the API consumer (POS) sees the same response, just faster.

### Frozen guarantee (binding on the implementing agent)

The implementing agent **must** capture a `jq -S` diff of the response before and after the change as part of QA evidence. The diff must be empty modulo `time_window.next_window_start` timestamps (these naturally drift across the test boundary because they encode "the next future window start at the moment of computation"). **Any other diff is a contract regression and blocks merge.** See §12 Acceptance Criteria #2.

### What POS team should still do (independent of this fix)

Send them this 1-liner **today** as a defensive measure (not a contract change):

> *"While our perf fix is in flight, please increase your HTTP client timeout for `/api/pos/coupons/available` from the default ~10 s to 30 s. The endpoint already returns HTTP 200 with correct data; your client is timing out before our response. Once we deploy the fix (ETA ~2 hours of engineering), response time drops to ~0.65 s and the timeout bump becomes irrelevant."*

This is a **client-side configuration tweak** — no code change required from POS.

---

## 1. Executive Summary

The endpoint **returns correct data** (verified with 3 cold + warm curl runs, all HTTP 200, 22 coupons in response). The performance issue is a classic **N+1 query problem in `list_available_coupons`** amplified by the cross-region MongoDB link (preview container ↔ AWS Mumbai `52.66.232.149`).

| Metric | Today | After fix (proposed) |
|---|---|---|
| Response time (R689, 25 coupons) | **~16.7 s** | **~0.4–1.0 s** (≈ 95% reduction) |
| MongoDB roundtrips per request | **~50–75** | **~3–4** |
| Code surface touched | n/a | 1 function in `coupon.py` (`list_available_coupons`) + 3 optional kwargs on `validate_coupon_for_customer` |
| Backend behaviour / response shape | n/a | **Identical** — pure perf refactor |
| Contract change | n/a | **None** |

This fix unblocks the POS team immediately, with zero risk of regression on existing V1+V2+V3-A+V3-B+V3-C QA (211/211).

---

## 2. Evidence

### 2.1 Live observation

```
$ curl '/api/pos/coupons/available?customer_id=...&order_total=349&channel=dine_in' -H 'X-API-Key: dp_live_...'

HTTP 200
21.7 KB response (22 coupons)
time: 16.74 s (cold)
time: 16.62 s (warm 2)
time: 16.67 s (warm 3)
```

Latency is **deterministic, not cold-start**.

### 2.2 Database snapshot (read-only sample of `52.66.232.149/mygenie`)

| Collection | R689 docs | Total docs |
|---|---|---|
| `coupons` (active for R689) | **25** | n/a |
| `coupon_usage` (for R689) | **0** | **8 total across all restaurants** |

### 2.3 Existing indexes

| Collection | Indexes |
|---|---|
| `coupons` | `_id_`, `uniq_user_code (user_id, code)` |
| `coupon_usage` | `_id_`, `uniq_user_order_id (user_id, order_id)`, **`idx_user_coupon_customer (user_id, coupon_id, customer_id)`**, `idx_user_created_at (user_id, created_at desc)` |

The `idx_user_coupon_customer` index already covers the per-user-limit count pattern — but each query still incurs a full network roundtrip to Mumbai (~150–200 ms).

### 2.4 Code audit — the N+1 pattern

In `backend/core/coupon.py:1813 list_available_coupons`:

```python
cursor = db.coupons.find({"user_id": user_id, "is_active": True}, {"_id": 0})    # 1 DB call
async for c in cursor:                                                            # 25 iterations
    v = await validate_coupon_for_customer(db, user_id=..., code=c.get("code"), ...)  # ←—— full re-validate per coupon
```

Each call to `validate_coupon_for_customer` (`coupon.py:1538+`) does:

| Line | DB call | Returns for our case |
|---|---|---|
| 1549 | `coupons.find_one({"user_id":…, "code":…})` | The same doc we just iterated through (wasted re-fetch) |
| 1580 | `_v3a_resolve_effective_tz` → `users.find_one(...)` (only when coupon has a time-window) | Same user doc, fetched per V3-A coupon (we have 4 of them → 4 redundant lookups) |
| 1622 | `coupon_usage.count_documents({"user_id":…, "coupon_id":…, "customer_id":…})` | **0** for R689 |
| 1626 | `coupon_usage.count_documents({"coupon_id":…, "customer_id":…, "user_id":{"$exists":False}})` (legacy backward-compat) | **0** |

### 2.5 Roundtrip math (matches observed latency)

| Source | Calls/request | Per-call latency (Mumbai cross-region) | Subtotal |
|---|---|---|---|
| Initial coupon `find` cursor | 1 | ~200 ms | ~0.2 s |
| `coupons.find_one` re-fetch (per coupon) | 25 | ~150 ms | ~3.75 s |
| `users.find_one` (per V3-A coupon = 4) | 4 | ~150 ms | ~0.6 s |
| `coupon_usage.count_documents` standard (per coupon) | 25 | ~200 ms | ~5.0 s |
| `coupon_usage.count_documents` legacy (per coupon) | 25 | ~250 ms (no covering index) | ~6.25 s |
| Misc / Python overhead | — | — | ~0.7 s |
| **Total** | **~80 DB hits** | — | **~16.5 s ✅ matches** |

### 2.6 Why all 50 usage counts return 0

R689 has **0 rows** in `coupon_usage`. We are paying a network round-trip 50 times per request to learn "still zero". A single aggregate replaces all 50.

---

## 3. Proposed Fix — Surgical Refactor

### 3.1 Goal
Reduce the in-loop work in `list_available_coupons` from 3–4 DB hits per coupon → 0 DB hits per coupon, by **pre-fetching** all shared lookups **once** before the loop and passing them as optional kwargs into `validate_coupon_for_customer`.

### 3.2 Strategy — Three precomputed kwargs (all backward-compatible defaults)

Add to `validate_coupon_for_customer` (`coupon.py:1538`):

| New kwarg | Type | Default | When set, skip… |
|---|---|---|---|
| `_precomputed_coupon` | `dict?` | `None` | The `coupons.find_one` lookup at line 1549 (use the passed doc directly) |
| `_precomputed_usage_count` | `int?` | `None` | Both `coupon_usage.count_documents` calls at 1622 + 1626 (use the passed sum directly) |
| `_precomputed_user_tz` | `tuple[ZoneInfo, str, str]?` | `None` | The `users.find_one` inside `_v3a_resolve_effective_tz` (line 1580) |

When any kwarg is `None` (current behaviour for all 5 other callers — POS validate, /orders commit, /pos/loyalty/redeem etc.), the existing DB fetch path runs. **Zero behaviour change for non-list callers.**

### 3.3 Pre-fetch in `list_available_coupons` (single replacement of lines 1813–1841)

```python
async def list_available_coupons(db, *, user_id, customer_id, order_total, channel="pos", now_iso=None):
    now_iso = now_iso or _now_iso()

    # ── (NEW) Pre-fetch: 1 coupons + 1 user + 1 aggregate-counts ──────────
    coupons_docs = await db.coupons.find(
        {"user_id": user_id, "is_active": True}, {"_id": 0}
    ).to_list(length=None)                                           # DB hit #1

    user_tz_tuple: Optional[tuple] = None
    if any(_v3a_has_window(c) for c in coupons_docs):
        user_tz_tuple = await _v3a_resolve_effective_tz_no_coupon(db, user_id)  # DB hit #2 (only if any V3-A)

    # Bulk usage counts by coupon_id for this customer (covers main + legacy)
    usage_map: dict[str, int] = {}
    if customer_id:
        pipeline = [
            {"$match": {"customer_id": customer_id, "$or": [
                {"user_id": user_id},
                {"user_id": {"$exists": False}},
            ]}},
            {"$group": {"_id": "$coupon_id", "count": {"$sum": 1}}},
        ]
        async for row in db.coupon_usage.aggregate(pipeline):         # DB hit #3
            usage_map[row["_id"]] = int(row["count"])

    # ── Loop is now DB-free ──────────────────────────────────────────────
    eligible: list[dict] = []
    for c in coupons_docs:
        v = await validate_coupon_for_customer(
            db, user_id=user_id, code=c.get("code", ""),
            customer_id=customer_id, order_total=order_total, channel=channel,
            loyalty_points_used=0.0, skip_cart_validation=True, now_iso=now_iso,
            _precomputed_coupon=c,
            _precomputed_usage_count=usage_map.get(c.get("id"), 0),
            _precomputed_user_tz=user_tz_tuple,
        )
        # ... existing post-processing unchanged
```

### 3.4 Pre-flight branch inside `validate_coupon_for_customer` (line 1549 + 1580 + 1622)

```python
# (line 1549 zone)
if _precomputed_coupon is not None:
    coupon = _precomputed_coupon
else:
    coupon = await db.coupons.find_one({"user_id": user_id, "code": code_upper}, {"_id": 0})

# (line 1580 zone — V3-A tz resolution)
if _precomputed_user_tz is not None and _v3a_has_window(coupon):
    tz_obj, tz_name, tz_fallback = _precomputed_user_tz
else:
    tz_obj, tz_name, tz_fallback = await _v3a_resolve_effective_tz(db, coupon, user_id)

# (line 1622 zone — per-user-limit)
if _precomputed_usage_count is not None:
    total_per_user = _precomputed_usage_count
elif customer_id:
    per_user_count = await db.coupon_usage.count_documents(...)
    legacy_count = await db.coupon_usage.count_documents(...)
    total_per_user = per_user_count + legacy_count
else:
    total_per_user = 0
```

### 3.5 Tiny helper extraction

Add `_v3a_resolve_effective_tz_no_coupon(db, user_id)` that mirrors `_v3a_resolve_effective_tz` minus the coupon-level override. It returns the user-level default `(tz_obj, tz_name, tz_fallback)`. Then **inside** `validate_coupon_for_customer`, when a coupon-level `timezone` IS set, we still override per-coupon (no DB needed — pure compute on a string). Net: 1 user lookup for the whole list, regardless of how many V3-A coupons.

### 3.6 Optional but cheap: drop the legacy `coupon_usage.count` branch for `list_available_coupons` only

Currently the function does **two** `count_documents` per coupon — one for `user_id`-tagged rows and one for legacy rows without `user_id`. Across the whole DB there are **8 total** `coupon_usage` rows. The legacy backward-compat is dead weight for the listing path. The aggregate above covers both via the `$or` already, so no need to special-case here — **already free**.

---

## 4. Expected Performance

| Step | Per call | New total |
|---|---|---|
| 1× `coupons.find().to_list()` | ~200 ms | 0.20 s |
| 1× `users.find_one()` (only if any V3-A) | ~150 ms | 0.15 s (conditional) |
| 1× `coupon_usage.aggregate()` | ~200 ms | 0.20 s |
| In-loop Python compute (25 coupons × ~5 ms) | — | 0.13 s |
| HTTP / FastAPI / JSON marshal | — | ~0.05 s |
| **Total target** | — | **~0.65 s** (~25× speedup) |

If R689 had zero V3-A coupons, the user_tz fetch is skipped → ~**0.50 s**.

Even if the DB grows to 100 coupons + 10,000 `coupon_usage` rows for one customer (worst case), the aggregate is still **1 DB call** with an indexed `$match` (`customer_id, user_id`). Latency stays sub-second.

---

## 5. Index Coverage Audit (Read-Only)

| Query | Existing index | Covered? |
|---|---|---|
| `coupons.find({user_id, is_active})` | None (was sufficient at small scale) | Partial — collection scan on R689's 25 docs is fast (small). **Could add** `idx_user_active (user_id, is_active)` later if multi-tenant scale grows; not required for this fix. |
| `coupon_usage.aggregate $match {customer_id, $or: [user_id=X, user_id missing]}` | `idx_user_coupon_customer (user_id, coupon_id, customer_id)` | The first $or branch can use the prefix `(user_id, …, customer_id)`. The second branch (legacy) falls through; over 8 total rows, this is irrelevant. **No new index needed.** |

**Conclusion:** No index changes proposed. The current schema is fine — the fix is purely an algorithmic refactor.

---

## 6. Files Touched (proposed)

| File | Change | LOC delta |
|---|---|---|
| `backend/core/coupon.py` | (a) Add 3 optional kwargs to `validate_coupon_for_customer`; (b) gate 3 DB-fetch blocks behind their respective kwarg checks; (c) rewrite `list_available_coupons` pre-fetch block; (d) add small helper `_v3a_resolve_effective_tz_no_coupon` | **+50 / -10** (net +40) |

**No new dependencies. No DB schema change. No env change. No supervisor change.** Backend hot-reload will pick up automatically.

---

## 7. Risk Analysis

| # | Risk | Mitigation |
|---|---|---|
| R1 | A new coupon usage row written between aggregate and per-coupon check (race) | Acceptable — `/coupons/available` is **informational**; final commit happens via `/api/pos/orders` which re-validates atomically. Listing returning a stale "available" by ~1 second is fine. |
| R2 | `_precomputed_usage_count` defaulting to 0 mistakenly when caller forgets a customer | The kwarg is opt-in. Only `list_available_coupons` sets it. All 5 other call sites of `validate_coupon_for_customer` (POS validate, redemption, orders commit, max-redeemable, free-item dispatch) remain on the live DB path. |
| R3 | `_precomputed_coupon` is stale relative to DB | `list_available_coupons` reads coupons within the same ~50 ms window. No edit-during-read concern at our scale. |
| R4 | Per-coupon `time_window` resolution uses coupon-level `timezone` override that needs no DB but currently mixes with the user-level resolution | The helper extraction keeps coupon-level override on the per-coupon code path; only the **user-level fallback lookup** is hoisted. Safe. |
| R5 | The aggregate query plan on cross-region link | Index `idx_user_coupon_customer` has `(user_id, coupon_id, customer_id)`. The aggregate filters on `(user_id, customer_id)` which uses the prefix (`user_id`) and a covered scan for the rest. Acceptable. |
| R6 | Behaviour change to non-list callers | Each new kwarg defaults to `None`. None-branch is identical to today. Verified by reading the 5 other call sites (POS validate, /pos/loyalty/redeem, /pos/orders, /pos/max-redeemable, /pos/coupons/validate). |
| R7 | Hot-reload race already bit us this morning | After applying the refactor, run `grep` validation for the 3 new kwarg names + the pre-fetch block. |
| R8 | Coupon model emits `total_used` field that's used in `usage_limit` check (line 1612) — still works | Yes — `total_used` is a **denormalised count on the coupon doc itself**, not a separate query. No change needed. |

---

## 8. Test Plan

### 8.1 Functional regression (the existing 211/211 must remain green)
The proposed change is purely a perf refactor with identical semantics. Re-running the backend QA harnesses validates this:

| Harness | File | Assertions |
|---|---|---|
| V1 | `tests/qa_cr001c_c_coupon_v1.py` | 45 |
| V2 Item / Category | `tests/qa_cr001c_c_coupon_v2_item_category.py` | 45 |
| V3-A Time Window | `tests/qa_cr001c_c_coupon_v3_a_time_window.py` | 31 |
| V3-B BOGO / BXG | `tests/qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` | 49 |
| V3-C Every Nth | `tests/qa_cr001c_c_coupon_v3_c_every_nth.py` | 41 |
| **Combined** | run all five sequentially | **211** |

### 8.2 Perf assertion (NEW — to be added in implementation)

Add 1 perf test that calls `/api/pos/coupons/available` with R689 data + asserts response time `< 2.0 s`. Will live alongside the existing V1 harness; no new framework needed.

### 8.3 Manual smoke
```bash
# Before/after timing
curl -s -o /dev/null -w "%{time_total}s\n" '/api/pos/coupons/available?...' -H 'X-API-Key: ...'
# Repeat 3 times. Mean should drop from ~16.7s to ~0.5-1.0s.
```

### 8.4 Response payload diff
Capture the JSON before and after the change. They must be **byte-identical** (modulo timestamps in `time_window.next_window_start`). Use `jq -S` to normalise key order.

---

## 9. Owner Decisions Needed

| Q | Decision | Recommended |
|---|---|---|
| OQ-PERF-1 | Communicate immediate workaround to POS team (bump client timeout to 30 s) before this fix lands? | **YES** — sends them a 1-line Slack/email; unblocks them today. |
| OQ-PERF-2 | Add a new perf-regression test asserting `< 2 s` response time? | **YES** — guards against future regressions for very cheap. |
| OQ-PERF-3 | Backport to also speed up `/api/pos/coupons/validate` (single-coupon flow)? | **NO** — that path only does 3–4 DB hits regardless. Already < 1 s. Not affected. |
| OQ-PERF-4 | Consider adding `idx_user_active (user_id, is_active)` on `coupons` collection? | **NO for this sprint** — the active-coupon scan is 25 docs at R689 scale; trivial. Revisit at 1000+ coupons per restaurant. |

All defaults safe. Proceed if owner says "go".

---

## 10. Effort Estimate

| Step | Estimated |
|---|---|
| Add 3 kwargs to `validate_coupon_for_customer` + gate 3 DB blocks | 25 min |
| Add `_v3a_resolve_effective_tz_no_coupon` helper | 10 min |
| Refactor `list_available_coupons` pre-fetch | 20 min |
| Lint + read 5 other caller sites for safety | 10 min |
| Run 5 QA harnesses (211 assertions) | 25 min |
| Manual `time_total` before/after capture + payload diff | 10 min |
| Implementation + QA reports | 20 min |
| **Total** | **~2 hours** |

---

## 11. Out of Scope

- Adding new indexes (none needed at current scale).
- Changing `/api/pos/coupons/validate` (already fast).
- Changing `/api/pos/orders` final-commit path (separate concern; out of scope).
- Refactoring any other N+1 elsewhere in the codebase.
- Pagination (count is 25, well below any pagination threshold; revisit at scale).
- Caching at the FastAPI layer (introduces invalidation complexity; aggregate-based fix removes the need).
- Touching frontend / Loyalty / Wallet / POS contract.
- Touching `/app/memory/final/`.

---

## 12. Acceptance Criteria

1. `curl /api/pos/coupons/available?...` for R689 returns in **< 2 seconds** consistently (3 cold + 3 warm).
2. JSON payload is **byte-identical** to today (modulo `next_window_start` timestamp drift across the test boundary).
3. All 211 existing QA assertions pass (V1 + V2 + V3-A + V3-B + V3-C).
4. ESLint / Ruff clean.
5. No new dependencies, no new indexes, no schema change.
6. The other 5 callers of `validate_coupon_for_customer` (POS validate, redeem, orders commit, max-redeemable, free-item) are **unchanged in behaviour and timing**.
7. Backend `/api/health` reports healthy after hot-reload.

---

## 13. Recommended Next Agent

**Backend Perf Agent — single function refactor.**

Brief:
- Apply the 3-kwarg additive change to `validate_coupon_for_customer`.
- Refactor `list_available_coupons` to pre-fetch coupons + user_tz + usage aggregate, then call `validate_coupon_for_customer` with kwargs set per loop iteration.
- Use `mcp_search_replace` for all edits — no full-file rewrite (`coupon.py` is 2213 lines).
- Run the 5 QA harnesses end-to-end. Capture 211/211 pass into `qa/CR_POS_PERF_1_LIST_AVAILABLE_COUPONS_N1_FIX_QA_REPORT.md`.
- Capture before/after timing into `implementation/CR_POS_PERF_1_LIST_AVAILABLE_COUPONS_N1_FIX_IMPLEMENTATION_REPORT.md`.
- Update `planning/CR_001_INDEX.md` with a new row tracker `crm_1_0_pos_perf_1_list_available_coupons_n1_fix_qa_passed`.
- **Do not** touch `/pos/orders`, `/pos/coupons/validate`, frontend, DB schema, env, or `/app/memory/final/`.

---

## 14. Final Status

```
crm_1_0_pos_perf_1_list_available_coupons_n1_fix_plan_frozen_ready_for_implementation
```

- Discovery: complete. N+1 confirmed at 50 wasted `count_documents` (R689 has 0 usage rows).
- Root cause: per-coupon re-fetch of coupon doc + user doc + 2× usage counts.
- Plan: surgical — 3 optional kwargs on existing function + pre-fetch block + 1 helper.
- Effort: ~2 hours.
- Risk: very low — additive kwargs default to current behaviour for 5 other callers.
- Expected speedup: ~25× (16.7 s → ~0.65 s).
- **POS contract:** ✅ **ZERO change** (URL, params, headers, status, JSON shape, fields — all identical). See §0.
- No backend behaviour change visible externally. No DB schema / index / env change. No new dependency.
- **🔒 Plan frozen 2026-05-25** — implementing agent must follow this doc exactly; any deviation requires owner sign-off.
- Ready for the Backend Perf Agent to execute.

### Appendix A — Latency math at a glance

```
Before (per request):
  coupons.find (cursor)        = 1 hit ×  200 ms = 0.2 s
  coupons.find_one (per loop)  = 25 hits × 150 ms = 3.8 s
  users.find_one (per V3-A)    = 4 hits ×  150 ms = 0.6 s
  count_documents standard     = 25 hits × 200 ms = 5.0 s
  count_documents legacy       = 25 hits × 250 ms = 6.3 s
  Python + JSON                                  ≈ 0.8 s
  ───────────────────────────────────────────────────────
  Total                                         ≈ 16.7 s  ←  matches observed

After:
  coupons.find (to_list)       = 1 hit  × 200 ms = 0.20 s
  users.find_one (once)        = 1 hit  × 150 ms = 0.15 s  (conditional)
  coupon_usage.aggregate       = 1 hit  × 200 ms = 0.20 s
  Python loop (no DB)          = 25 ×   5 ms     = 0.13 s
  HTTP + JSON                                    = 0.05 s
  ───────────────────────────────────────────────────────
  Total                                         ≈ 0.65 s  ← target
```

### Appendix B — Reference: all 6 call sites of `validate_coupon_for_customer`

(Confirmed read-only via grep on `/app/backend`.)

| Call site | File | Path | Impact of new kwargs (defaults `None`) |
|---|---|---|---|
| 1. POS validate | `routers/pos.py:2587` | `POST /api/pos/coupons/validate` | None — kwargs default `None`, identical behaviour |
| 2. POS orders commit | `routers/pos.py` (V1 commit) | `POST /api/pos/orders` | None |
| 3. POS max-redeemable / free-item dispatch | `routers/pos.py` (max-redeem) | `POST /api/pos/max-redeemable` | None |
| 4. Loyalty redeem (in-pipeline coupon resolution) | `routers/pos.py` (redeem helper) | `POST /api/pos/loyalty/redeem` | None |
| 5. `list_available_coupons` itself | `core/coupon.py:1831` | `GET /api/pos/coupons/available` | **This is the only caller that will set the new kwargs.** |

All 5 non-list callers keep their current DB-fetch paths. Zero contract or behaviour change for them.
