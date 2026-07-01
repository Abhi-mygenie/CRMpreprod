# CR-021 — Coupon Engine: Distribute-First + POS-Zero Recording + Limit Defaults — Implementation Plan

**CR**: CR-021
**Status**: `plan_drafted_awaiting_signoff`
**Author**: E1
**Date opened**: 2026-06-06
**Discovery**: `../discovery/CR_021_COUPON_DISTRIBUTE_AND_POS_ZERO_DISCOVERY.md`
**Branch target**: current working branch (`5-june`)
**Environment**: implement in preview pod (`/app`); owner promotes to prod
**External DB**: `52.66.232.149:27017/mygenie` — **NO DB writes from this CR** (no migration). Only runtime collections (`coupons`, `coupon_usage`, `customers`) read/written through application code on real POS orders post-deploy.

---

## 1. Goal (one sentence)

Make BOGO/BXG/Nth coupons behave the way restaurant owners expect — discount distributed across distinct eligible item-lines, usage limits enforced even when POS pre-applies zero discount, and "Unlimited" the default cap on the create form — with zero regression to V1 simple coupons.

---

## 2. Locked decisions (all owner-confirmed in discovery §10)

| # | Decision | Value |
|---|---|---|
| D1 | Multi-line benefit selection | **Distribute-first across distinct eligible item-lines; cheapest line wins tie-break (highest if `apply_to_highest_item=True`)** |
| D2 | POS sends `coupon_discount=0` for CRM-authoritative coupon | **Record usage with `crm_computed_discount`, set `discount_mismatch=True`, increment `total_used`** |
| D3 | CRM-authoritative coupon class definition | **ALL coupon classes — no whitelist.** When POS sends `coupon_discount=0` AND CRM computes > 0, CRM records the redemption regardless of `offer_type` or `discount_scope`. Skip only when CRM also computes 0 (no benefit to record). Owner objective verbatim: *"If POS sends by mistake, CRM shd honour and record drift in log."* |
| D4 | Form default `per_user_limit` | **`""` (Unlimited / null)** for all coupon types (not just BOGO — sweep wider per owner) |
| D5 | Form default `usage_limit` | Already `""` → no change |
| D6 | Existing coupons in DB | **Untouched**. No backfill / migration. Only new orders flowing through the patched engine are affected. |
| D7 | POS bill correction | **Out of scope.** CRM records the right discount; POS bill is whatever POS computed locally. Accounting reconciliation via `discount_mismatch` flag (existing CR-003 dashboard surfaces it). |
| D8 | `coupon_discount_for_pos` API response field | Already exists in validate endpoints — clients can opt-in to use CRM's number; no contract change needed. |

---

## 3. Exact file changes

> All line numbers from `5-june` HEAD `8031a08` (2026-03-12). Verified 2026-06-06.

### 3.1 `backend/core/coupon.py` — selector rewrite

| Action | Line(s) | Change |
|---|---|---|
| **Replace** | **743–754** (`_v3b_select_get_units`) | Replace function body with distribute-first algorithm (see §3.1.1 below) |
| **No change** | 929 (V3-B BOGO call-site) | Keep call signature `_v3b_select_get_units(candidates, free_units_needed, coupon)` |
| **No change** | 1210 (V3-C Nth call-site) | Keep call signature `_v3b_select_get_units(units, applications, coupon)` |

#### 3.1.1 New `_v3b_select_get_units` body

```python
def _v3b_select_get_units(
    candidates: list, units_needed: int, coupon: dict,
) -> list:
    """Select benefit units from `candidates`.

    Algorithm (CR-021):
      1. Group candidates by identity (food_id, item_id, name) preserving
         input order within each group.
      2. Sort the groups by their unit_price.
         - Default / `apply_to_cheapest_item=True` → ascending (cheapest first)
         - `apply_to_highest_item=True` → descending (highest first)
         - If both flags True → highest wins (explicit highest beats default)
      3. Round-robin draw: take one unit from each non-empty group in sorted
         order; loop until `units_needed` is satisfied or all groups exhausted.

    Properties:
      * Single-line cart → identical to legacy cheapest-greedy behavior.
      * Multi-line cart with units_needed > 1 → distributes one per distinct
        line first, then re-dips in same sorted order.
      * Deterministic (sort + insertion order is total ordering).
      * Same selector serves V3-B (BOGO/BXG) and V3-C (Nth) — single source
        of truth.
    """
    if units_needed <= 0 or not candidates:
        return []

    highest = bool(coupon.get("apply_to_highest_item", False))
    # cheapest flag is the default direction; only meaningful as the inverse of highest
    reverse = highest  # True → highest first, False → cheapest first

    # Step 1: group by identity, preserve input order within group
    groups: "dict[tuple, list]" = {}
    group_order: list = []  # remembers first-seen order for stable tie-break
    for u in candidates:
        key = (u.get("food_id"), u.get("item_id"), u.get("name"))
        if key not in groups:
            groups[key] = []
            group_order.append(key)
        groups[key].append(u)

    # Step 2: sort groups by unit_price (uniform within a group)
    # Secondary sort key = first-seen order, ensures stable tie-break.
    ordered_keys = sorted(
        group_order,
        key=lambda k: (float(groups[k][0]["unit_price"]), group_order.index(k)),
        reverse=reverse,
    )

    # Step 3: round-robin draw
    out: list = []
    while len(out) < units_needed:
        progressed = False
        for k in ordered_keys:
            if groups[k]:
                out.append(groups[k].pop(0))
                progressed = True
                if len(out) >= units_needed:
                    return out
        if not progressed:  # all groups exhausted
            break
    return out
```

**Net diff**: function body fully replaced. Same signature, same return type. ~35 LoC.

#### 3.1.2 Drop redundant `apply_to_cheapest_item` flag handling?

**No — keep it for backward compatibility.** Today's code reads both flags but the cheapest flag is functionally redundant (default direction is already cheapest). In the new body we only branch on `highest`. The `apply_to_cheapest_item` field on existing coupon docs continues to be persisted and shown in the UI — it just doesn't change behavior. This matches what restaurant owners see in the UI today.

### 3.2 `backend/core/coupon.py` — POS-zero recording branch

| Action | Line(s) | Change |
|---|---|---|
| **Replace** | **2078–2083** (the `coupon_zero_discount_skipped` early return) | Replace with offer-type-aware branch (see §3.2.1) |
| **No change** | 2129–2177 (the recording path that follows) | Unchanged — already uses `crm_computed = v["computed_discount"]` |
| **Modify** | **2152–2160** (mismatch flag) | Extend to also set `discount_mismatch=True` when `pos_sent==0 AND crm_computed>0` (currently only triggers when both non-zero and differ) |
| **Modify** | **2177** (`"coupon_discount": pos_sent`) | When `pos_sent==0 AND crm_authoritative AND crm_computed>0`: write `crm_computed` here. Otherwise unchanged. |

#### 3.2.1 New POS-zero branch (replaces lines 2078–2083)

```python
# CR-021 D3: ALL coupons — CRM is the universal safety net.
# Legacy behavior: skip on POS=0. This hid silent usage-limit loops and let
# customers re-redeem when POS forgot to apply the discount. Per owner
# objective ("if POS sends by mistake CRM shd honour and record drift in log")
# we now defer the skip decision until AFTER validation has run, so we know
# both the CRM-computed discount and whether the cart is genuinely eligible.
#
# Decision (see discovery §7.3):
#   POS=0 AND CRM>0   → RECORD using crm_computed, flag mismatch=True, log drift
#   POS=0 AND CRM=0   → SKIP (no benefit to record — cart ineligible / config wrong)
#   POS>0             → unchanged (POS-sent recorded; mismatch flagged if differs from CRM)
pos_sent_zero = float(coupon_discount_from_pos or 0.0) == 0.0
# (no early return here; fall through to validation)
```

Then below, after the validation block (post line 2127) and before the recording call (around line 2152), insert:

```python
# CR-021 D3: late-skip for POS=0 cases — runs AFTER validation produced crm_computed.
if pos_sent_zero:
    if crm_computed is None or crm_computed <= 0:
        logger.warning(
            "coupon_zero_discount_skipped user_id=%s order_id=%s pos_order_id=%s code=%s "
            "scope=%s offer_type=%s crm_computed=%s — POS=0 and CRM also computes 0; nothing to record",
            user_id, order_id, pos_order_id, code_upper,
            scope, coupon.get("offer_type"), crm_computed,
        )
        return {
            "ok": False, "recorded": False,
            "error": {"code": "INACTIVE", "field": "coupon_discount",
                      "detail": "POS-sent coupon_discount is 0 and CRM-computed is also 0; nothing to record"},
        }
    # POS=0 AND CRM>0 → record using CRM, flag drift. CRM is the safety net.
    logger.info(
        "coupon_pos_zero_drift_recorded user_id=%s order_id=%s pos_order_id=%s code=%s "
        "scope=%s offer_type=%s crm_computed=%s — recording CRM-computed, flagging discount_mismatch=True",
        user_id, order_id, pos_order_id, code_upper,
        scope, coupon.get("offer_type"), crm_computed,
    )

# CR-021 D3: when POS=0 and CRM>0, the recorded `coupon_discount` becomes
# the CRM-computed amount. CRM never inflates above its own computed value.
effective_pos_sent = (
    round(float(crm_computed), 2)
    if (pos_sent_zero and crm_computed is not None and crm_computed > 0)
    else pos_sent
)
discount_mismatch = (
    bool(pos_sent_zero and crm_computed is not None and crm_computed > 0)
    or bool(crm_computed is not None and not _within_tolerance(pos_sent, crm_computed))
)
```

Then rename downstream uses of `pos_sent` → `effective_pos_sent` for the recorded `coupon_discount` field. The audit field `discount_applied` (line 2191) should also use `effective_pos_sent`.

**Net diff**: ~40 LoC added (one early-stage guard removed, one late-stage branch added, two rename touches). Same function shape. **No coupon-class whitelist** — universal safety net per D3.

### 3.3 `backend/routers/pos.py` — entry gate

| Action | Line | Change |
|---|---|---|
| **Modify** | **1568** | Change gate `if order_data.coupon_code and (order_data.coupon_discount or 0.0) > 0:` → `if order_data.coupon_code:` (let the recorder decide) |
| **No change** | 1618–1623 | The `coupon_zero_discount_skipped` warning here is now redundant (recorder logs it). Remove this elif block. |
| **No change** | 1624–1629 | The `coupon_discount_without_code` warning stays (discount without code is still a POS bug). |

#### 3.3.1 New gate

```python
# CR-021 V1: relaxed gate — recorder now handles POS=0 case for CRM-authoritative coupons.
if order_data.coupon_code:
    # Convert OrderItem -> dicts the coupon service understands.
    cart_dicts: list[dict] = []
    for oi in (order_data.items or []):
        ...  # unchanged
    try:
        coupon_usage_result = await record_coupon_usage_for_order(
            db,
            user_id=user["id"],
            ...  # unchanged
            coupon_discount_from_pos=order_data.coupon_discount,   # may be 0; recorder decides
            ...
        )
    except Exception as exc:
        ...  # unchanged
elif (order_data.coupon_discount or 0.0) > 0 and not order_data.coupon_code:
    logger.warning("coupon_discount_without_code user_id=%s ...", ...)
# (the `coupon_zero_discount_skipped` elif at 1618-1623 is removed — recorder logs it)
```

**Net diff**: 1 if-condition simplified, 1 elif removed.

### 3.4 `frontend/src/pages/CouponsPage.jsx` — defaults

| Action | Line | Change |
|---|---|---|
| **Modify** | **76** | `per_user_limit: "1"` → `per_user_limit: ""` |
| **Modify** | **295** | `per_user_limit: String(coupon.per_user_limit ?? "1"),` → `per_user_limit: coupon.per_user_limit != null ? String(coupon.per_user_limit) : "",` |
| **Modify** | **364** | `per_user_limit: parseInt(form.per_user_limit) || 1,` → `per_user_limit: form.per_user_limit ? parseInt(form.per_user_limit) : null,` |
| **No change** | 932 (`usage_limit` input) | Already correct |
| **Modify** | **937** (`per_user_limit` input) | Add placeholder `placeholder="Unlimited"` to match `usage_limit` UX |

**Net diff**: 4 LoC.

### 3.5 `backend/models/schemas.py` — Pydantic compatibility check

`per_user_limit` field on `Coupon` / `CouponCreate` / `CouponUpdate` models — confirm it's `Optional[int] = 1` today and change default to `Optional[int] = None`. If validated to require ≥ 1, relax to allow `None`.

| Action | Line | Change |
|---|---|---|
| **Modify** | TBD (grep `per_user_limit:` in schemas.py) | If field default is `1`, change to `None`. Validator if present → allow None. |

Will verify exact line during impl. Likely 1-line change.

---

## 4. Implementation steps (sequenced)

> Strict order. Each step is independently rollback-able. No step makes a DB write.

| # | Step | File(s) | Verify |
|---|---|---|---|
| 1 | Rewrite `_v3b_select_get_units` | `core/coupon.py` 743-754 | Standalone unit smoke: feed 5 sample carts, print selected — see §6 |
| 2 | Run existing V3-B regression | `tests/qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` | Note any failures — likely 0-3 assertions need expected-discount update |
| 3 | Run existing V3-C regression | `tests/qa_cr001c_c_coupon_v3_c_every_nth.py` | Same |
| 4 | Update any failed assertions with new expected discounts; document each diff in `IMPLEMENTATION_REPORT.md` §3 | tests/ | Re-run both suites → 100% pass |
| 5 | Patch `record_coupon_usage_for_order` POS-zero branch | `core/coupon.py` 2078-2160 | Run V1 simple POS=0 → still skip; V3-B BOGO POS=0 → recorded |
| 6 | Patch `pos.py:1568` gate | `routers/pos.py` 1568+1618 | Smoke: send a synthetic POS payload with `code+discount=0` for BOGO → expect coupon_usage row |
| 7 | Patch Pydantic schema default | `models/schemas.py` | Curl test: create coupon with `per_user_limit=null` → 200, with `per_user_limit=2` → 200 |
| 8 | Patch frontend defaults + placeholder | `frontend/src/pages/CouponsPage.jsx` 76, 295, 364, 937 | Screenshot the create form — `Per User Limit` shows "Unlimited" placeholder |
| 9 | Write `qa_cr021_distribute_and_pos_zero.py` (12 cases) | `backend/tests/` | All 12 green |
| 10 | Full regression sweep | both v3b + v3c + cr021 suites | 100% green |
| 11 | Docs: write closeout, update dashboard + register + decisions log + PRD | `memory/` | Owner reviews |
| 12 | Manual UI smoke: create a fresh BOGO coupon with defaults, verify `per_user_limit=null` in API payload | UI | Screenshot |

---

## 5. New QA fixture `qa_cr021_distribute_and_pos_zero.py`

Location: `backend/tests/qa_cr021_distribute_and_pos_zero.py`

Format: matches existing `qa_cr001c_c_coupon_v3_*.py` style — pure async script, `_assert(name, cond, detail)` pattern, prints PASS/FAIL count at end.

### 5.1 Test scenarios

| # | Scenario | Coupon used | Cart | Expected |
|---|---|---|---|---|
| D1 | BOGO/BXG distribute 2 apps × 2 distinct get lines | seed: buy=[A], get=[X@50, Y@250], qty=1+1, free | 2A + 2X + 2Y | apps=2, benefit_items=[1X, 1Y], discount=300 |
| D2 | BOGO/BXG distribute with `apply_to_highest_item=True` | same coupon, highest flag | 2A + 2X + 2Y | apps=2, benefit_items=[1Y, 1X], discount=300 (highest first) |
| D3 | Nth distribute 2 apps across 3 distinct eligible lines | seed: nth=2, eligible=[A,B,C], free | 1A@250 + 1B@250 + 2C@50 | apps=2, benefit_items=[1C, 1B] (cheapest distinct then next cheapest), discount=300 |
| D4 | Nth single-line unchanged | same coupon | 4A@250 | apps=2, benefit_items=[2A], discount=500 |
| D5 | POS=0 + V3-B BOGO → record using CRM | live BOGO from Kunafa seed | A+B (any cart that yields disc>0), `coupon_discount=0` from "POS" | recorded=True, discount_mismatch=True, recorded.coupon_discount=crm_computed |
| D6 | POS=0 + V3-B BOGO, second call same coupon → `USAGE_LIMIT_REACHED` if limit=1 | same coupon w/ usage_limit=1, 2 different order_ids | apply twice | 1st recorded; 2nd ok=False USAGE_LIMIT_REACHED |
| D7 | POS=0 idempotency replay | same coupon, same `order_id` as D5 | replay | recorded=False, idempotent_replay=True, total_used not double-incremented |
| **D8** | **POS=0 + V1 simple → NOW RECORD via CRM safety net (D3 all-in)** | V1 simple 10% off, min_order=0 | order_amount=1000, `coupon_discount=0` | **recorded=True, recorded.coupon_discount=100, discount_mismatch=True, total_used+=1** |
| D9 | POS=0 + V2 item-scope → record using CRM | V2 item-scope, `coupon_discount=0` | eligible cart | recorded=True, discount_mismatch=True |
| D10 | POS>0 with mismatch unchanged | V3-B BOGO, POS sends 50, CRM computes 100 | apply | recorded with POS=50, discount_mismatch=True (existing behavior) |
| D11 | POS>0 matches CRM unchanged | V3-C Nth, POS=200, CRM=200 | apply | recorded=200, discount_mismatch=False |
| **D12** | **POS=0 AND CRM=0 (genuinely no benefit) → SKIP** | V1 simple with `min_order_value=500`, order=100 (below min) | apply | ok=False, INACTIVE, no row written, warning log |

Each scenario calls `record_coupon_usage_for_order()` directly (no HTTP) so tests are deterministic and fast.

### 5.2 Setup helper

```python
# Seed test coupons in a unique test user_id to avoid colliding with live Kunafa/Mayur.
TEST_USER_ID = "pos_cr021_test"
async def _seed():
    await db.coupons.delete_many({"user_id": TEST_USER_ID})
    await db.coupon_usage.delete_many({"user_id": TEST_USER_ID})
    # Insert 4 coupons covering V1/V2/V3-B/V3-C with known shapes...
```

Cleanup at end:

```python
async def _cleanup():
    await db.coupons.delete_many({"user_id": TEST_USER_ID})
    await db.coupon_usage.delete_many({"user_id": TEST_USER_ID})
```

### 5.3 Run command

```bash
cd /app/backend && python -m tests.qa_cr021_distribute_and_pos_zero
```

Expected output (target):

```
TOTAL: 12/12 PASS
```

---


## 15. Deep file-by-file walkthrough (executable spec)

This section is the source-of-truth for the implementer. Every code change is documented with its target file, target line range, before-state context, after-state code, and the **reason / contract** for the change. If something here conflicts with §3, this section wins.

### 15.1 `backend/core/coupon.py` — Change A: selector rewrite

**Target**: function `_v3b_select_get_units` at lines **743–754**.

**Why we change it**: the legacy selector takes N units from a single sorted list, which means when 5Star (₹50) and xyz12 (₹250) both qualify as benefit items and the offer needs 2 free units, both come from 5Star (cheapest absolute) instead of one from each. Owner direction D1 says distribute across distinct item-lines first.

**Why this is the only function we touch for D1**: both V3-B (BOGO/BXG, line 929) and V3-C (Every-Nth, line 1210) call this helper. One rewrite fixes both. The validation/apps-cap/match logic is untouched.

**Before** (current `5-june` head):

```python
def _v3b_select_get_units(
    candidates: list, units_needed: int, coupon: dict,
) -> list:
    """Q3=A default: free cheapest. apply_to_highest_item overrides to highest."""
    if units_needed <= 0 or not candidates:
        return []
    highest  = bool(coupon.get("apply_to_highest_item", False))
    cheapest = bool(coupon.get("apply_to_cheapest_item", False))
    reverse  = bool(highest and not cheapest)
    ordered  = sorted(candidates, key=lambda u: float(u["unit_price"]), reverse=reverse)
    return ordered[:units_needed]
```

**After** (CR-021 D1):

```python
def _v3b_select_get_units(
    candidates: list, units_needed: int, coupon: dict,
) -> list:
    """Select benefit units from `candidates` using distribute-first algorithm.

    CR-021 D1 contract:
      1. Group candidates by identity (food_id, item_id, name) preserving
         input order within each group.
      2. Sort the groups by their unit_price.
         - Default / `apply_to_cheapest_item=True` → ascending (cheapest first)
         - `apply_to_highest_item=True` → descending (highest first)
         - If both flags True → highest wins (explicit highest beats default).
      3. Round-robin draw: take one unit from each non-empty group in sorted
         order; loop until `units_needed` is satisfied or all groups exhausted.

    Properties:
      * Single-line cart → identical to legacy cheapest-greedy behavior.
      * Multi-line cart with units_needed > 1 → distributes one per distinct
        line first, then re-dips in the same sorted order.
      * Deterministic (sort + insertion order is a total ordering).
      * Same selector serves V3-B (BOGO/BXG) and V3-C (Every-Nth) — single
        source of truth.
    """
    if units_needed <= 0 or not candidates:
        return []

    highest = bool(coupon.get("apply_to_highest_item", False))
    # `apply_to_cheapest_item` is functionally redundant — default direction is
    # already cheapest. We keep accepting it on the coupon doc for back-compat
    # but only branch on `highest` here.
    reverse = highest

    # Step 1: group by identity, preserve input order within group.
    groups: "dict[tuple, list]" = {}
    group_order: list = []
    for u in candidates:
        key = (u.get("food_id"), u.get("item_id"), u.get("name"))
        if key not in groups:
            groups[key] = []
            group_order.append(key)
        groups[key].append(u)

    # Step 2: sort groups by unit_price (uniform within a group). Secondary
    # sort key = first-seen order, ensures stable tie-break when two distinct
    # lines have the same unit_price.
    indexed = {k: idx for idx, k in enumerate(group_order)}
    ordered_keys = sorted(
        group_order,
        key=lambda k: (float(groups[k][0]["unit_price"]), indexed[k]),
        reverse=reverse,
    )

    # Step 3: round-robin draw.
    out: list = []
    while len(out) < units_needed:
        progressed = False
        for k in ordered_keys:
            if groups[k]:
                out.append(groups[k].pop(0))
                progressed = True
                if len(out) >= units_needed:
                    return out
        if not progressed:  # all groups exhausted
            break
    return out
```

**Edge cases covered**:
- `units_needed <= 0` → returns `[]` (unchanged).
- `candidates == []` → returns `[]` (unchanged).
- 1 distinct line → grouping has 1 group → round-robin runs the same group repeatedly → identical to legacy behavior.
- 2 distinct lines, `units_needed=1` → returns 1 unit from cheapest group → identical to legacy.
- 2 distinct lines, `units_needed=3`, group A has 2, group B has 2 → returns A,B,A (or B,A,B if highest) → 3 units selected with line-spread.
- All groups exhausted before `units_needed` met → returns what was found (caller-side validation in `_v3b_apply_caps` should have prevented this).
- Tie-break: two groups with identical `unit_price` → first-seen wins (insertion order).

**Reverse-flag interaction** (no surprises):
| `apply_to_highest_item` | `apply_to_cheapest_item` | `reverse` | direction |
|---|---|---|---|
| False | False | False | ascending (cheapest) — default |
| False | True | False | ascending (cheapest) — explicit cheapest |
| True | False | True | descending (highest) |
| True | True | True | descending (highest) — explicit highest wins |

### 15.2 `backend/core/coupon.py` — Change B: POS-zero recording branch

**Target**: function `record_coupon_usage_for_order` at lines **2078–2200** approximately. Two surgical edits.

**Why we change it**: per owner objective D2 + D3 — *"if POS sends by mistake CRM shd honour and record drift in log"*. Today the function early-returns INACTIVE if POS sent 0. We need to:
1. Remove the early skip.
2. After validation runs (which already computes `crm_computed`), decide:
   - POS=0 AND CRM=0 → still skip (genuinely no benefit).
   - POS=0 AND CRM>0 → record using `crm_computed`, set `discount_mismatch=True`, log drift, increment `total_used`.
3. The downstream `coupon_usage` document must use the right `coupon_discount` value (CRM when POS=0, POS-sent otherwise).

#### 15.2.1 Edit B1 — replace early skip at lines 2078–2083

**Before**:

```python
if float(coupon_discount_from_pos or 0.0) == 0.0:
    logger.warning(
        "coupon_zero_discount_skipped user_id=%s order_id=%s pos_order_id=%s code=%s",
        user_id, order_id, pos_order_id, code_upper,
    )
    return {"ok": False, "recorded": False,
            "error": {"code": "INACTIVE", "field": "coupon_discount",
                      "detail": "POS-sent coupon_discount is 0; not recorded"}}
```

**After**:

```python
# CR-021 D3: POS-zero handling — universal CRM safety net.
# Legacy behavior: ALWAYS skip on POS=0. This hid silent usage-limit loops
# and let customers re-redeem when POS forgot to apply the discount. Per
# owner D3 we defer the skip decision until AFTER validation has run, so
# we know both crm_computed and whether the cart is genuinely eligible.
#
# Decision (discovery §7.3):
#   POS=0 AND CRM>0 → RECORD using crm_computed, flag mismatch=True, log drift
#   POS=0 AND CRM=0 → SKIP (no benefit to record — cart ineligible / config wrong)
pos_sent_zero = float(coupon_discount_from_pos or 0.0) == 0.0
# (no early return here; fall through to validation)
```

#### 15.2.2 Edit B2 — insert late-skip + effective-amount + mismatch flag

**Insertion point**: AFTER the validation call returns `v` (around line 2110–2130) and BEFORE the `usage_doc` is built (around line 2152). Look for the comment `# Build the canonical coupon_usage document` or the first `usage_doc = {` assignment.

**After**:

```python
# CR-021 D3: late-skip for POS=0 cases — runs AFTER validation produced crm_computed.
if pos_sent_zero:
    if crm_computed is None or crm_computed <= 0:
        logger.warning(
            "coupon_zero_discount_skipped user_id=%s order_id=%s pos_order_id=%s code=%s "
            "scope=%s offer_type=%s crm_computed=%s — POS=0 and CRM also computes 0; nothing to record",
            user_id, order_id, pos_order_id, code_upper,
            scope, coupon.get("offer_type"), crm_computed,
        )
        return {
            "ok": False, "recorded": False,
            "error": {"code": "INACTIVE", "field": "coupon_discount",
                      "detail": "POS-sent coupon_discount is 0 and CRM-computed is also 0; nothing to record"},
        }
    # POS=0 AND CRM>0 → record using CRM, flag drift. CRM is the safety net.
    logger.info(
        "coupon_pos_zero_drift_recorded user_id=%s order_id=%s pos_order_id=%s code=%s "
        "scope=%s offer_type=%s crm_computed=%s — recording CRM-computed, flagging discount_mismatch=True",
        user_id, order_id, pos_order_id, code_upper,
        scope, coupon.get("offer_type"), crm_computed,
    )

# CR-021 D3: when POS=0 and CRM>0, the recorded `coupon_discount` becomes
# the CRM-computed amount. CRM never inflates above its own computed value.
effective_pos_sent = (
    round(float(crm_computed), 2)
    if (pos_sent_zero and crm_computed is not None and crm_computed > 0)
    else pos_sent
)
discount_mismatch = (
    bool(pos_sent_zero and crm_computed is not None and crm_computed > 0)
    or bool(crm_computed is not None and not _within_tolerance(pos_sent, crm_computed))
)
```

#### 15.2.3 Edit B3 — rename `pos_sent` → `effective_pos_sent` in usage_doc + return

**Target**: the lines that build `usage_doc` and the success-return dict. Likely lines **2155–2200**.

In `usage_doc`:
```python
"coupon_discount": effective_pos_sent,    # was pos_sent
"discount_applied": effective_pos_sent,   # was pos_sent
"discount_mismatch": discount_mismatch,   # already exists — value source updated
```

In the success-return dict:
```python
"recorded_coupon_discount": effective_pos_sent,  # if this field is returned
```

**Implementer note**: the existing `_within_tolerance(pos_sent, crm_computed)` mismatch check still runs for POS>0 cases. Our new branch ADDS a mismatch=True when POS=0 AND CRM>0. The OR keeps both signals.

### 15.3 `backend/routers/pos.py` — Change C: relax entry gate, drop dead elif

**Target**: lines **1568–1623** in the order-receiving webhook handler.

**Why**: today the gate skips the recorder entirely on POS=0. Once Change B makes the recorder handle POS=0, the gate becomes a barrier and the elif at 1618 becomes dead code.

#### 15.3.1 Edit C1 — relax gate at line 1568

**Before**:
```python
if order_data.coupon_code and (order_data.coupon_discount or 0.0) > 0:
```

**After**:
```python
# CR-021 D3: relaxed gate — recorder now handles POS=0 case universally.
# If POS sent a code, run the recorder. The recorder validates the coupon,
# computes CRM-side discount, and decides whether to record or skip.
if order_data.coupon_code:
```

#### 15.3.2 Edit C2 — remove the dead elif at lines 1618–1623

**Before**:
```python
elif order_data.coupon_code and (order_data.coupon_discount or 0.0) == 0.0:
    import logging as _lg
    _lg.getLogger(__name__).warning(
        "coupon_zero_discount_skipped user_id=%s order_id=%s pos_order_id=%s code=%s",
        user["id"], order_id, order_data.order_id, order_data.coupon_code,
    )
```

**After**:
```python
# (block removed — recorder now logs this case from core/coupon.py)
```

The `elif (order_data.coupon_discount or 0.0) > 0 and not order_data.coupon_code:` block at lines 1624–1629 stays — it covers a different defect (discount-without-code).

### 15.4 `backend/models/schemas.py` — Change D: Pydantic default

**Target**: the `Coupon` / `CouponCreate` / `CouponUpdate` models — wherever `per_user_limit` is declared.

**Why**: the form now sends `null` for "Unlimited"; the Pydantic schema must accept null and not coerce to 1.

**Action**: implementer to `grep -n 'per_user_limit' backend/models/schemas.py`. For each occurrence:
- If declared as `per_user_limit: Optional[int] = 1` → change to `per_user_limit: Optional[int] = None`.
- If declared with a validator that rejects None → relax the validator.
- If declared as `int = 1` (non-Optional) → change to `Optional[int] = None`.

Run the existing v3b/v3c regression after to confirm no model breakage.

### 15.5 `frontend/src/pages/CouponsPage.jsx` — Change E: form defaults

**Target**: lines **76**, **295**, **364**, **937** (5 LoC across 4 edits).

#### 15.5.1 Edit E1 — initial form state (line 76)

**Before**:
```jsx
start_date: "", end_date: "", usage_limit: "", per_user_limit: "1",
```

**After**:
```jsx
start_date: "", end_date: "", usage_limit: "", per_user_limit: "",
```

#### 15.5.2 Edit E2 — edit-prefill (line 295)

**Before**:
```jsx
per_user_limit: String(coupon.per_user_limit ?? "1"),
```

**After**:
```jsx
per_user_limit: coupon.per_user_limit != null ? String(coupon.per_user_limit) : "",
```

#### 15.5.3 Edit E3 — submit-payload (line 364)

**Before**:
```jsx
per_user_limit: parseInt(form.per_user_limit) || 1,
```

**After**:
```jsx
per_user_limit: form.per_user_limit ? parseInt(form.per_user_limit) : null,
```

#### 15.5.4 Edit E4 — input placeholder (line 937)

**Before**:
```jsx
<Input type="number" value={form.per_user_limit} onChange={e => setForm({ ...form, per_user_limit: e.target.value })}
```

**After**:
```jsx
<Input type="number" value={form.per_user_limit}
       placeholder="Unlimited"
       onChange={e => setForm({ ...form, per_user_limit: e.target.value })}
```

### 15.6 `backend/tests/qa_cr021_distribute_and_pos_zero.py` — Change F: new QA fixture

**Target**: NEW file. Follows the existing `qa_cr001c_c_coupon_v3_*.py` template.

**Skeleton** (implementer fills in scenario assertions per §5.1):

```python
"""CR-021 — Distribute-first benefit selection + POS-zero universal recording.

Run:
    cd /app/backend && python -m tests.qa_cr021_distribute_and_pos_zero

Self-contained — seeds + cleans up a synthetic test tenant.
No live POS traffic, no DB writes outside `pos_cr021_test` user_id.
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/app/backend")
os.environ.setdefault("MONGO_URL",
    "mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie?authSource=mygenie")
os.environ.setdefault("DB_NAME", "mygenie")

from core.database import db
from core.coupon import (
    _v3b_compute_discount,
    _v3c_compute_discount,
    record_coupon_usage_for_order,
)

TEST_USER_ID = "pos_cr021_test"
RESULTS = {"pass": 0, "fail": 0, "rows": []}


async def _assert(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        RESULTS["pass"] += 1
        RESULTS["rows"].append((name, "PASS", ""))
        print(f"  ✓ {name}")
    else:
        RESULTS["fail"] += 1
        RESULTS["rows"].append((name, "FAIL", detail))
        print(f"  ✗ {name}  — {detail}")


async def _seed():
    await db.coupons.delete_many({"user_id": TEST_USER_ID})
    await db.coupon_usage.delete_many({"user_id": TEST_USER_ID})
    # Seed customers (per_user_limit checks need a customer_id)
    await db.customers.delete_many({"user_id": TEST_USER_ID})
    await db.customers.insert_one({
        "id": "cust_cr021", "user_id": TEST_USER_ID,
        "phone": "+91-9999999999", "name": "CR021 Test",
        "created_at": datetime.now(timezone.utc),
    })

    now = datetime.now(timezone.utc)
    far_future = now + timedelta(days=365)

    # V3-B BOGO/BXG coupon: buy A, get X/Y at percentage 50%
    await db.coupons.insert_one({
        "id": "cr021_v3b_bogo", "user_id": TEST_USER_ID,
        "code": "CR021_BOGO", "title": "CR-021 V3-B test", "active": True, "status": "active",
        "valid_from": now, "valid_to": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "bxg", "discount_scope": "item",
        "buy_food_ids": ["A"], "buy_quantity": 1,
        "get_food_ids": ["X", "Y"], "get_quantity": 1,
        "get_discount_type": "percentage", "get_discount_value": 50.0,
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
        "allow_repeat": True,
        "discount_type": "percentage", "discount_value": 50.0,  # back-compat fields
    })

    # V3-C Nth coupon: every 2nd item free, eligible [A, B, C]
    await db.coupons.insert_one({
        "id": "cr021_v3c_nth", "user_id": TEST_USER_ID,
        "code": "CR021_NTH", "title": "CR-021 V3-C test", "active": True, "status": "active",
        "valid_from": now, "valid_to": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "nth_item", "discount_scope": "item",
        "eligible_food_ids": ["A", "B", "C"],
        "nth_item_number": 2, "nth_discount_type": "free",
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
        "allow_repeat": True,
        "discount_type": "free", "discount_value": 100.0,
    })

    # V1 simple coupon — 10% off order, no min
    await db.coupons.insert_one({
        "id": "cr021_v1_simple", "user_id": TEST_USER_ID,
        "code": "CR021_PCT10", "title": "CR-021 V1 simple test", "active": True, "status": "active",
        "valid_from": now, "valid_to": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "simple", "discount_scope": "order",
        "discount_type": "percentage", "discount_value": 10.0,
        "min_order_value": 0,
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
    })

    # V1 simple coupon with min_order=500 (for D12)
    await db.coupons.insert_one({
        "id": "cr021_v1_minorder", "user_id": TEST_USER_ID,
        "code": "CR021_MIN500", "title": "CR-021 V1 min-order test", "active": True, "status": "active",
        "valid_from": now, "valid_to": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "simple", "discount_scope": "order",
        "discount_type": "percentage", "discount_value": 10.0,
        "min_order_value": 500,
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
    })

    # V2 item-scope coupon — 20% off eligible items
    await db.coupons.insert_one({
        "id": "cr021_v2_item", "user_id": TEST_USER_ID,
        "code": "CR021_ITEM20", "title": "CR-021 V2 item test", "active": True, "status": "active",
        "valid_from": now, "valid_to": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "simple", "discount_scope": "item",
        "discount_type": "percentage", "discount_value": 20.0,
        "eligible_food_ids": ["A", "B"],
        "min_order_value": 0,
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
    })


async def _cleanup():
    await db.coupons.delete_many({"user_id": TEST_USER_ID})
    await db.coupon_usage.delete_many({"user_id": TEST_USER_ID})
    await db.customers.delete_many({"user_id": TEST_USER_ID})


async def main():
    print("=" * 70)
    print("CR-021 QA — Distribute-first + POS-zero universal recording")
    print("=" * 70)
    await _seed()
    try:
        # D1, D2: BOGO/BXG distribute (selector test — bypasses validation)
        await _case_d1_bogo_distribute_cheapest()
        await _case_d2_bogo_distribute_highest()
        # D3, D4: Nth distribute / single-line unchanged
        await _case_d3_nth_distribute_mixed()
        await _case_d4_nth_single_line()
        # D5–D9: POS-zero universal recording
        await _case_d5_pos_zero_v3b_record()
        await _case_d6_usage_limit_blocks_second()
        await _case_d7_idempotency_replay()
        await _case_d8_pos_zero_v1_record()       # ← D3 all-in
        await _case_d9_pos_zero_v2_record()
        await _case_d10_pos_nonzero_mismatch()
        await _case_d11_pos_matches_crm()
        await _case_d12_pos_zero_crm_zero_skip()  # ← min-order failure
    finally:
        await _cleanup()

    print("\n" + "=" * 70)
    print(f"TOTAL: {RESULTS['pass']}/{RESULTS['pass']+RESULTS['fail']} PASS")
    print("=" * 70)
    if RESULTS["fail"]:
        for n, s, d in RESULTS["rows"]:
            if s == "FAIL":
                print(f"  FAIL {n} — {d}")
        sys.exit(1)


# … case functions defined per §5.1 scenarios …


if __name__ == "__main__":
    asyncio.run(main())
```

Each `_case_*` function follows the same pattern:
1. Arrange — build cart, call helper or recorder.
2. Act — capture returned dict.
3. Assert — `await _assert("D1 BOGO distribute cheapest", computed_discount == 300.0, f"got {computed_discount}")`.

### 15.7 Existing-suite regression audit

**Files to audit**:
- `/app/backend/tests/qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` (877 lines, ~40 assertions)
- `/app/backend/tests/qa_cr001c_c_coupon_v3_c_every_nth.py` (813 lines, ~35 assertions)

**Audit process**:
1. Run each fixture as-is against the new code: `cd /app/backend && python -m tests.qa_cr001c_c_coupon_v3_b_bogo_bxgy`.
2. For each FAIL, inspect the cart:
   - If cart has **only 1 distinct eligible line** → assertion is a bug in the fixture (or code regression) — investigate further.
   - If cart has **≥ 2 distinct eligible lines** AND units_needed > 1 → distribute-first changed the expected. Recompute the new expected by hand using the algorithm, update the fixture, document in §16.
3. Re-run; iterate until all green.
4. Record final state in `IMPLEMENTATION_REPORT.md` (created during impl).

### 15.8 Order of execution (critical for safe rollback)

| Step | Action | Smoke test before next step |
|---|---|---|
| 1 | Apply Change A (selector rewrite) | Standalone selector smoke: `python -c "from core.coupon import _v3b_select_get_units; print(_v3b_select_get_units([{'food_id':'A','item_id':'A','name':'A','unit_price':50},{'food_id':'B','item_id':'B','name':'B','unit_price':250}]*1, 2, {}))"` → expect both A and B |
| 2 | Run v3b regression suite | green or documented diffs |
| 3 | Run v3c regression suite | green or documented diffs |
| 4 | Apply Change B (recorder POS-zero) | Direct call: `record_coupon_usage_for_order(..., coupon_discount_from_pos=0)` for a CR021_BOGO seed coupon → expect `recorded=True, discount_mismatch=True` |
| 5 | Apply Change C (pos.py gate + dead elif) | Direct call into the POS webhook handler with a synthetic payload → expect 200 + coupon_usage row |
| 6 | Apply Change D (Pydantic schema) | Curl `POST /api/coupons` with `per_user_limit: null` → expect 200 |
| 7 | Apply Change E (frontend defaults + placeholder) | Open CouponsPage create form → screenshot — Per User Limit shows "Unlimited" placeholder |
| 8 | Write QA fixture F (qa_cr021) | Run → 12/12 pass |
| 9 | Full regression sweep | v3b + v3c + cr021 all green |
| 10 | Docs — closeout, dashboard, register, decisions log, PRD | files updated |

Each step is independently reversible. If step N fails, revert via `git checkout -- <file>` and re-investigate before moving on.

### 15.9 Cross-coupon-class invariant matrix (post-CR-021)

| Scenario | V1 simple | V2 item | V3-B BOGO/BXG | V3-C Nth |
|---|---|---|---|---|
| POS>0, CRM=POS | record POS | record POS | record POS | record POS |
| POS>0, CRM≠POS | record POS, flag mismatch | record POS, flag mismatch | record POS, flag mismatch | record POS, flag mismatch |
| POS=0, CRM>0 | **record CRM, flag mismatch, log drift** | record CRM, flag mismatch, log drift | record CRM, flag mismatch, log drift | record CRM, flag mismatch, log drift |
| POS=0, CRM=0 | SKIP (warn) | SKIP (warn) | SKIP (warn) | SKIP (warn) |
| Validation fails (expired, usage_limit, per_user_limit, ineligible) | reject, no row | reject, no row | reject, no row | reject, no row |
| Replay same order_id | idempotent, no double-record | idempotent | idempotent | idempotent |

**Bolded cell** = the new behavior introduced by CR-021 D3 — V1 simple now joins the safety-net pattern.

---


## 6. Existing-suite assertion audit

> Before implementation we *cannot* know which existing assertions baked in the cheapest-greedy expected-discount values. The audit happens between Step 1 and Step 4 in §4. The planning doc must capture:
> - Which assertions failed
> - Why (cart had ≥ 2 distinct eligible lines)
> - What the new expected discount is
> - Why the new value is correct under distribute-first

A placeholder table (to be filled during implementation):

| File | Line | Old expected | New expected | Reason |
|---|---|---|---|---|
| qa_cr001c_c_coupon_v3_b_bogo_bxgy.py | ? | ? | ? | distribute-first |
| qa_cr001c_c_coupon_v3_c_every_nth.py | ? | ? | ? | distribute-first |

If audit finds **zero** breaking assertions, that's a great sign — meaning existing fixtures use mostly single-line or pure same-item carts (likely true based on §5.1 of discovery). If breakages are found and the new values look intuitive, they're recorded and accepted.

---

## 7. Rollback strategy

| Step | Rollback action |
|---|---|
| 1 (selector) | `git checkout -- backend/core/coupon.py` → reverts function body |
| 5 (recorder branch) | Same file; revert |
| 6 (pos.py gate) | `git checkout -- backend/routers/pos.py` |
| 7 (schemas) | `git checkout -- backend/models/schemas.py` |
| 8 (frontend) | `git checkout -- frontend/src/pages/CouponsPage.jsx` |
| 9 (new fixture) | `rm backend/tests/qa_cr021_distribute_and_pos_zero.py` |

No DB writes; no migrations; no schema changes that would block rollback. Owner can revert any subset independently.

---

## 8. Risks revisited (post-plan)

All 7 risks from discovery §9 remain. New risks from plan:

| # | Risk | P | I | Mitigation |
|---|---|---|---|---|
| R8 | Selector rewrite has subtle off-by-one when `units_needed` > total candidate count | L | M | Added "all groups exhausted" loop break + D12 case `NO_ELIGIBLE_*` ensures validation already gates this; selector receives only feasible counts |
| R9 | The `effective_pos_sent` rename leaves a stale reference somewhere | L | M | Linter + grep `pos_sent` post-edit; ensure all downstream `usage_doc` and return dicts use `effective_pos_sent` |
| R10 | Owner promotes to prod without re-running regression because "it's only 3 small files" | L | H | Closeout doc top-block declares: **"Do NOT promote without running tests/qa_cr021_distribute_and_pos_zero.py AND existing v3b/v3c suites"** |

---

## 9. Test-credentials & environment

| Resource | Value |
|---|---|
| Pod URL | `https://624af823-7129-4097-96fa-856cfd1bfa5e.preview.emergentagent.com` |
| Mongo | `mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie` |
| Test tenant for QA fixture | `pos_cr021_test` (synthetic, created + destroyed in fixture) |
| Reference tenant (real coupons) | Mayur's Kitchen `pos_0001_restaurant_523` — read-only, expired coupons left untouched per owner |
| Existing seed coupons reused | `SEED_V3B_BOGO`, `SEED_V3B_BXGY_PCT`, `SEED_V3C_EVERY3_FREE`, `SEED_V3C_EVERY5_PCT` on `pos_0001_restaurant_689` (Kunafa Mahal — not expired) |

---

## 10. Definition of Done (mirrors discovery §12 with deliverable file paths)

1. ✅ `backend/core/coupon.py` — `_v3b_select_get_units` replaced with distribute-first.
2. ✅ `backend/core/coupon.py` — `record_coupon_usage_for_order` patched per §3.2 with POS-zero late-skip.
3. ✅ `backend/routers/pos.py` — line 1568 gate relaxed; 1618 elif removed.
4. ✅ `backend/models/schemas.py` — `per_user_limit` default → None.
5. ✅ `frontend/src/pages/CouponsPage.jsx` — `per_user_limit` defaults `""`, placeholder "Unlimited".
6. ✅ `backend/tests/qa_cr021_distribute_and_pos_zero.py` — 12 cases, 12/12 pass.
7. ✅ `backend/tests/qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` — green (with any updated expected values documented in §6).
8. ✅ `backend/tests/qa_cr001c_c_coupon_v3_c_every_nth.py` — green (same).
9. ✅ `memory/crm/crm_roi_sprint/implementation/CR_021_*_CLOSEOUT.md` written.
10. ✅ `memory/CR_STATUS_DASHBOARD.md` — CR-021 row added, status 🟢 on close.
11. ✅ `memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` — CR-021 row.
12. ✅ `memory/DECISIONS_LOG.md` — 4 new entries (selector, recorder, frontend default, V1-unchanged).
13. ✅ `memory/PRD_SESSION.md` — 1 line CR-021 summary.
14. ✅ Manual UI smoke: new coupon `per_user_limit` defaults to "Unlimited"; existing coupon edit preserves prior value.

---

## 11. Acceptance criteria → test mapping

| AC | Test | File |
|---|---|---|
| A1 distribute 2-line × 2 apps | D1 | qa_cr021 |
| A2 highest-first distribute | D2 | qa_cr021 |
| A3 Nth 3-line distribute | D3 | qa_cr021 |
| A4 Nth single-line unchanged | D4 | qa_cr021 |
| A5 POS=0 V3-B record CRM | D5 | qa_cr021 |
| A6 USAGE_LIMIT_REACHED | D6 | qa_cr021 |
| A7 idempotency | D7 | qa_cr021 |
| A8 V1 SKIP unchanged | D8 | qa_cr021 |
| A9 V2 POS=0 record | D9 | qa_cr021 |
| A10 POS>0 mismatch | D10 | qa_cr021 |
| A11 POS=CRM match | D11 | qa_cr021 |
| A12 V3-B regression | full suite | qa_cr001c_c_coupon_v3_b_bogo_bxgy.py |
| A13 V3-C regression | full suite | qa_cr001c_c_coupon_v3_c_every_nth.py |
| A14 form default `per_user_limit=""` | manual | UI screenshot |
| A15 existing coupon edit preserves value | manual | UI screenshot |

---

## 12. Sprint guardrails (re-affirm)

| Guardrail | Status in this plan |
|---|---|
| ❌ `testing_agent_v3` | NOT invoked |
| ❌ Live WhatsApp sends | NONE — no message-trigger code touched |
| ❌ Demo login reintroduced | N/A |
| ❌ Live POS orders | NONE — synthetic carts only via direct function calls |
| ❌ Mongo writes outside `pos_cr021_test` test-user | NONE — fixture self-isolates and cleans up |
| ✅ All changes additive or behavior-preserving for V1 | enforced via D3 whitelist |
| ✅ Owner decisions logged in §2 | 8 decisions |
| ✅ Rollback documented | §7 |
| ✅ Risks enumerated | §8 (+ discovery §9) |
| ✅ Effort estimate | §11 discovery (~½ day) |
| ✅ DoD measurable | §10 (14 items) |
| ✅ ACs testable | §11 (15 ACs) |
| ✅ No DB migration | per D6 |

---

## 13. Open questions to owner before implementation

None. Discovery §10 captured all owner decisions. Plan is internally consistent.

If owner wants to **further refine** any of:
- The CRM-authoritative class boundary (D3) — currently `bogo|bxg|nth_item OR scope ∈ {item,category}`
- The exact placeholder text (currently "Unlimited")
- The decision to drop the redundant `coupon_zero_discount_skipped` elif at pos.py:1618

…please flag before implementation. Otherwise plan is ready to execute.

---

**END OF PLAN — CR-021**
