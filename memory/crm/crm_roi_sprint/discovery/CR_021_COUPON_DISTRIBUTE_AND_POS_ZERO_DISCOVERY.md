# CR-021 — Coupon Engine: Distribute-First Benefit Selection + POS-Zero-Discount Usage Recording + Limit Defaults

**Sprint**: ROI Measurement / CRM
**Type**: Engine + UX bug-fix CR (3 related defects discovered in one investigation)
**Requested**: 2026-06-06 — owner: *"few coupons are not working, focus on BOGO and Nth and see all business logic is correctly working"*
**Lifecycle stage**: `discovery_drafted_awaiting_plan_signoff`
**Access used**: read-only static analysis + remote DB read + 5 synthetic engine probes (no DB writes, no live messages)
**Effort estimate**: ~½ day (1 backend helper rewrite + 1 backend recorder branch + 1 frontend default flip + new QA fixture)
**Test tenant**: Mayur's Kitchen (`pos_0001_restaurant_523`)

---

## 1. One-line problem statement

Three independent defects converge on the same surface — restaurant owners running BOGO/BXG/Nth coupons see the discount land on the wrong item, see the per-user/total-usage limits silently ignored, and have no way to choose "Unlimited" by default. All three slip through today because the engine prefers cheapest-absolute-units, the usage recorder bails out when POS sends `coupon_discount=0`, and the form defaults `Per User Limit=1`.

---

## 2. Bugs in scope

### Bug B1 — Benefit selection concentrates on cheapest item-line ("BOGO discount lands on 5Star only")

When the cart matches multiple **distinct** eligible benefit lines (e.g. cart has 5Star + xyz12 both qualifying as "Get" items), the selector takes all needed units from the cheapest *single* line, ignoring the other eligible lines entirely. Owner expectation: the engine should **distribute** across distinct eligible item-lines first, only re-dipping the same line after every line has contributed at least one unit.

### Bug B2 — Usage-limit silently disabled when POS sends `coupon_discount=0`

`record_coupon_usage_for_order()` (core/coupon.py:2078) explicitly returns `INACTIVE` and skips when POS sends `coupon_discount == 0`. `routers/pos.py:1568` ALSO gates entry into the recorder on `coupon_discount > 0`. Net effect: if the POS dispatches a BOGO/Nth order with `coupon_code = "BOGO"` but does **not** pre-compute the discount itself (sends 0), CRM never records the usage, `total_used` stays at 0, and `usage_limit` + `per_user_limit` are never enforced. Customer can re-redeem indefinitely.

### Bug B3 — Form defaults `Per User Limit=1` create a hidden ceiling

`frontend/src/pages/CouponsPage.jsx:76` initializes `per_user_limit: "1"` and edits coerce missing values to `"1"` (line 295). Combined with B2, owners assume "Unlimited" is the default until they hit the bug. Owner-direction: defaults should be **Unlimited (null)** for both `usage_limit` *and* `per_user_limit` so the merchant has to opt-in to caps.

---

## 3. Out of scope (deferred)

| # | Out-of-scope item | Why deferred |
|---|---|---|
| O1 | Customer-choice benefit selection ("ask cashier which to discount") | Requires POS UI handshake; no MVP value without POS-side support; opens a separate UX CR |
| O2 | Cap-1-per-line strict mode (option iii from owner's Q1 menu) | Owner picked (ii) distribute-first; (iii) leaves units stranded when only one eligible line; not requested |
| O3 | POS-sent < CRM-computed override (Gap C) | Owner explicit: POS-sent wins when non-zero; we only log mismatch; no silent inflation |
| O4 | Stackable / multi-coupon order semantics | Untouched in this CR — current single-coupon-per-order rule unchanged |
| O5 | Backfill / retro-record of historically-missed usages | Owner did not request; could be a follow-up admin-tool CR |
| O6 | Extending Mayur test coupons' `valid_to` | Owner direction: leave coupons as-is; QA will use unexpired Kunafa seed coupons (`SEED_V3B_*`, `SEED_V3C_*`) |
| O7 | UI exposure of `allow_repeat` / `max_applications` toggles (the BOGO/BXG/Nth form already shows them per owner screenshot) | Already present in UI; no work needed |

---

## 4. Evidence — code paths today

### 4.1 Selector that concentrates instead of distributing

`backend/core/coupon.py` — `_v3b_select_get_units()` (lines **743–754**, current `5-june` HEAD):

```python
def _v3b_select_get_units(candidates, units_needed, coupon):
    """Q3=A default: free cheapest. apply_to_highest_item overrides to highest."""
    if units_needed <= 0 or not candidates:
        return []
    highest  = bool(coupon.get("apply_to_highest_item", False))
    cheapest = bool(coupon.get("apply_to_cheapest_item", False))
    reverse  = bool(highest and not cheapest)
    ordered  = sorted(candidates, key=lambda u: float(u["unit_price"]), reverse=reverse)
    return ordered[:units_needed]                                              # ← greedy cheapest
```

Used by:
- BOGO/BXG free-unit selection — line **929** (`selected = _v3b_select_get_units(candidates, free_units_needed, coupon)`)
- Every-Nth benefit-unit selection — line **1210** (`selected = _v3b_select_get_units(units, applications, coupon)`)

Both BOGO/BXG and Nth share the same selector; one rewrite fixes both.

### 4.2 Recorder bail-out when POS sends 0

`backend/core/coupon.py` — `record_coupon_usage_for_order()` (lines **2078–2083**):

```python
if float(coupon_discount_from_pos or 0.0) == 0.0:
    logger.warning("coupon_zero_discount_skipped user_id=%s order_id=%s pos_order_id=%s code=%s",
                   user_id, order_id, pos_order_id, code_upper)
    return {"ok": False, "recorded": False,
            "error": {"code": "INACTIVE", "field": "coupon_discount",
                      "detail": "POS-sent coupon_discount is 0; not recorded"}}
```

Caller gate `backend/routers/pos.py` (lines **1568–1607**):

```python
if order_data.coupon_code and (order_data.coupon_discount or 0.0) > 0:
    coupon_usage_result = await record_coupon_usage_for_order(...)
```

→ Combined effect: a POS payload with `coupon_code="BOGO"` + `coupon_discount=0` is logged once as a warning and dropped. No row in `coupon_usage`, `total_used` not incremented, no `usage_limit` enforcement.

### 4.3 Form default forcing `per_user_limit=1`

`frontend/src/pages/CouponsPage.jsx` (lines **76**, **295**, **364**):

```jsx
// initial form state
start_date: "", end_date: "", usage_limit: "", per_user_limit: "1",    // ← default "1"

// edit-prefill
per_user_limit: String(coupon.per_user_limit ?? "1"),                  // ← coerces null → "1"

// submit
per_user_limit: parseInt(form.per_user_limit) || 1,                    // ← coerces empty → 1
```

`usage_limit` already defaults to `""` → null, which is correct ("Unlimited"). Only `per_user_limit` is wrong.

---

## 5. Evidence — engine probes against live remote Mongo (Mayur's "BOGO" + "NTH1")

> All probes executed via `_v3b_compute_discount()` / `_v3c_compute_discount()` directly (bypassing expired-date validation). No DB writes.

### 5.1 BOGO ("BOGO" coupon — bxg, buy=[mtest], get=[5Star,xyz12], 50% off, decision Gap B = b1: keep `percentage 50%`)

| Cart | Today's behavior | Owner expectation (distribute-first) | Δ |
|---|---|---|---|
| mtest×1 + 5Star×1 + xyz12×1 | Discounts **5Star only** (₹25) | Discounts **5Star only** (₹25) — only 1 get unit needed, cheapest still wins | ✅ unchanged |
| 2×mtest + 5Star×1 + xyz12×1 | Discounts both 5Star + xyz12 (₹150) | Same (₹150) | ✅ unchanged |
| **mtest×1 + 5Star×2 + xyz12×2** | Discounts **1× 5Star only** (₹25) | Same (₹25) — get_qty × apps = 1 | ✅ unchanged |
| 2×mtest + 5Star×2 + xyz12×2 (2 apps × get_qty=1 = 2 units) | Discounts **2× 5Star** (₹50) | Discounts **1× 5Star + 1× xyz12** (₹150) — distribute across distinct lines | ⚠ **changes** |

### 5.2 Nth ("NTH1" — n=2 free, eligible=[mtest,xyz12,5Star], allow_repeat=True)

| Cart | Today's behavior | Owner expectation (distribute-first) | Δ |
|---|---|---|---|
| 2×mtest | 1× mtest free (₹250) | Same (₹250) — only one line eligible | ✅ unchanged |
| 4×mtest | 2× mtest free (₹500) | Same (₹500) — only one line eligible | ✅ unchanged |
| mtest×1 + xyz12×1 | 1× mtest free (₹250 — cheapest tie-break by insertion) | 1× mtest free (₹250) — picking 1 of 2 distinct lines, cheapest within those 2 wins | ✅ unchanged |
| **mtest×1 + xyz12×1 + 5Star×2** | **2× 5Star free (₹100)** | **1× 5Star + 1× xyz12 free (₹300)** — distribute across distinct lines first | ⚠ **changes** |
| 6×mtest | 3× mtest free (₹750) | Same (₹750) — only one line eligible | ✅ unchanged |

**Conclusion**: The distribution change ONLY affects carts where multiple distinct eligible lines exist AND the unit count needed > 1 AND one line has enough quantity to satisfy alone. In every other case, behavior is identical to today.

---

## 6. Algorithm — proposed distribute-first selector

### 6.1 Specification (informal)

```
function distribute_select(units, n_needed, sort_dir):
    # units = list of {food_id,item_id,name,unit_price} — same order as cart expansion
    # group units by their identity key (food_id|item_id|name) preserving each unit's slot
    # sort the GROUPS by unit_price (ascending if cheapest-default, descending if highest)
    # round-robin: take 1 from each group in sorted order; loop until n_needed reached
    # within a group, take units in input order
```

### 6.2 Reference Python implementation (illustrative — actual impl in planning doc §3)

```python
def _v3b_select_get_units(candidates, units_needed, coupon):
    if units_needed <= 0 or not candidates:
        return []
    highest = bool(coupon.get("apply_to_highest_item", False))
    cheapest = bool(coupon.get("apply_to_cheapest_item", False))
    reverse = bool(highest and not cheapest)              # default = cheapest-first

    # Group units by identity, preserving input order within each group
    groups: dict = {}
    for u in candidates:
        key = (u.get("food_id"), u.get("item_id"), u.get("name"))
        groups.setdefault(key, []).append(u)

    # Sort groups by their unit_price (uniform within a group)
    ordered_keys = sorted(
        groups.keys(),
        key=lambda k: float(groups[k][0]["unit_price"]),
        reverse=reverse,
    )

    # Round-robin draw
    out: list = []
    while len(out) < units_needed:
        progressed = False
        for k in ordered_keys:
            if groups[k]:
                out.append(groups[k].pop(0))
                progressed = True
                if len(out) >= units_needed:
                    break
        if not progressed:                # all groups exhausted
            break
    return out
```

### 6.3 Properties

| Property | Before | After |
|---|---|---|
| Default direction | cheapest absolute units | cheapest **distinct-line** first |
| Single-line cart | 1 group → identical | 1 group → identical |
| Multi-line cart, 1 unit needed | takes cheapest line | takes cheapest line (same) |
| Multi-line cart, N units needed | takes N from cheapest line | takes 1 from each line in cheapest→… order, then loops |
| `apply_to_highest_item=True` | takes from highest line | takes 1 from each line in highest→… order, then loops |
| `apply_to_cheapest_item=True` (explicit) | takes from cheapest line | same as default — explicit choice |
| Stable / deterministic | yes (sort is total) | yes (sort + insertion order is total) |
| Tie-break (two lines same price) | first encountered wins | first encountered (Python sort is stable) |

### 6.4 Anti-abuse check

The owner concern that motivated the original cheapest-default ("customer adds 1 cheap buy + 1 expensive get to game BOGO") is **unchanged** in the distribute-first version when `get_qty × applications = 1` — only one line wins, and the cheapest-default makes it the cheap one. Distribute-first only kicks in when multiple units are needed, which already presupposes the customer bought enough buy-side items to justify them.

---

## 7. Algorithm — proposed POS-zero-discount recording branch

### 7.1 Today's flow

```
POS sends {code, discount=0}
  → pos.py:1568 gate `discount>0` → SKIP
  → coupon_usage not written
  → total_used not incremented
  → usage_limit never enforced
```

### 7.2 Proposed flow

```
POS sends {code, discount=0}
  → pos.py:1568 gate becomes `code AND (discount>0 OR coupon is CRM-authoritative)`
       CRM-authoritative = offer_type in {bogo, bxg, nth_item} OR discount_scope in {item, category}
  → coupon.py:2078 bail-out replaced:
       IF discount=0 AND coupon is CRM-authoritative:
           run validate_coupon_for_customer (already does this)
           IF crm_computed_discount > 0:
               record usage with coupon_discount = crm_computed_discount
               set discount_mismatch = True (because POS sent 0)
               increment total_used
           ELSE:
               return existing INACTIVE (no benefit anyway)
       ELSE (V1 simple coupon):
           return existing INACTIVE (POS is authoritative for V1)
```

### 7.3 Decision matrix (D3 = ALL coupons CRM-authoritative on POS=0)

| Coupon class | POS sends | CRM compute | Today | After CR-021 |
|---|---|---|---|---|
| V1 simple | discount > 0 | matches | record, increment | record, increment (unchanged) |
| V1 simple | discount > 0 | mismatch | record POS-sent + flag mismatch | unchanged (POS wins, mismatch logged) |
| V1 simple | discount = 0 | computes > 0 | SKIP | **record using CRM-computed, mark mismatch, increment, log drift** |
| V1 simple | discount = 0 | computes = 0 (min order not met / expired / etc.) | SKIP | SKIP (unchanged — no benefit to record) |
| V2 item-scope | discount > 0 | any | record POS-sent | unchanged |
| V2 item-scope | discount = 0 | computes > 0 | SKIP | **record using CRM-computed, mark mismatch, increment, log drift** |
| V2 item-scope | discount = 0 | computes = 0 | SKIP | SKIP (unchanged) |
| V3-B BOGO/BXG | discount > 0 | any | record POS-sent | unchanged |
| V3-B BOGO/BXG | discount = 0 | computes > 0 | SKIP | **record using CRM-computed, mark mismatch, increment, log drift** |
| V3-B BOGO/BXG | discount = 0 | computes = 0 (cart not eligible) | SKIP | SKIP (unchanged) |
| V3-C Nth | discount > 0 | any | record POS-sent | unchanged |
| V3-C Nth | discount = 0 | computes > 0 | SKIP | **record using CRM-computed, mark mismatch, increment, log drift** |
| V3-C Nth | discount = 0 | computes = 0 | SKIP | SKIP (unchanged) |

**Owner objective (verbatim):** *"If POS sends by mistake, CRM should honour and record drift in log."*
CRM is the universal safety net. No coupon-class whitelist. Skip only when there is genuinely no benefit to record (CRM also computes 0 — e.g. cart ineligible, min-order not met, validation failed).

### 7.4 Side-effects

- `coupon_usage.coupon_discount` for these new rows reflects **CRM computation, not POS** — accounting needs to be aware.
- `discount_mismatch = True` is the audit flag.
- `usage_limit` and `per_user_limit` start enforcing from the **second** order onwards (idempotent on `(user_id, order_id)`).
- POS-side bill is untouched — CRM does not "send back" the discount or modify the order total. Customer's bill at the POS terminal remains whatever the POS computed (likely full price). This is a **logging / limit-enforcement fix**, not a bill-correction fix. Owner accepts this per Decision G (see §9).

---

## 8. Frontend default flip

### 8.1 Today (`frontend/src/pages/CouponsPage.jsx:76`)

```jsx
const initial = {
  ...,
  start_date: "", end_date: "",
  usage_limit: "",          // ← already null/"Unlimited" — OK
  per_user_limit: "1",      // ← problem
  ...
};
```

### 8.2 Proposed

```jsx
const initial = {
  ...,
  start_date: "", end_date: "",
  usage_limit: "",          // unchanged
  per_user_limit: "",       // ← flip default to "Unlimited" (null)
  ...
};
```

Plus matching edit-prefill (line 295) and submit-coerce (line 364) updates so an empty `per_user_limit` round-trips as `null`, not 1.

### 8.3 UI impact

- Existing coupons with `per_user_limit=1` are unchanged (loaded value still shows 1).
- New coupons default to "Unlimited" — placeholder text shows "Unlimited" matching the existing `usage_limit` field's behavior.
- Owner can still type "1", "2", … to set an explicit cap.

---

## 9. Risks (probability × impact)

| # | Risk | P | I | Mitigation |
|---|---|---|---|---|
| R1 | Distribute-first changes already-deployed coupons' behavior mid-session | M | M | Per §5, **only multi-line carts with N>1 units** are affected. Real-world Mayur/Kunafa coupons rarely hit this case; existing QA assertions are mostly single-line. Mitigation: run BOTH v3b + v3c regression fixtures and update any assertions that depend on cheapest-greedy. |
| R2 | POS-zero recording creates accounting drift (CRM records ₹X discount, POS bill shows ₹0) | M | H | Audit field `discount_mismatch=True` is set; CR-003 dashboard already surfaces mismatches. Owner-direction: log + flag, never modify POS bill. Communicate to ops that mismatch-true rows under POS=0 are "CRM-only-credit" rows. |
| R3 | V1 simple coupons silently get included in CRM-authoritative branch by misclassification | L | H | Whitelist V2/V3-B/V3-C explicitly; default-else is "POS authoritative" so V1 keeps current behavior. Unit-test V1 simple with discount=0 → still SKIP. |
| R4 | Frontend default change confuses existing operators who expect "1" | L | L | Cosmetic; placeholder "Unlimited" + tooltip in form already exists for `usage_limit` — extend to `per_user_limit`. |
| R5 | Existing v3b/v3c QA fixtures may have assertions that bake in "greedy cheapest" expected discounts | M | M | Audit the 200+ assertion lines in `qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` + `qa_cr001c_c_coupon_v3_c_every_nth.py` for any case with multi-distinct-line carts; update expected discounts. Document each change in the planning doc. |
| R6 | Owner re-tests with the Mayur expired coupons (valid_to in past) and reports "still not working" | M | L | Per owner decision (Gap E = leave coupons as-is): we will not extend. QA will use `SEED_V3B_*` + `SEED_V3C_*` coupons on Kunafa Mahal which are not expired. Document this in CR closure. |
| R7 | POS clients eventually start sending correct discount → CRM-authoritative path becomes dead code | L | L | Acceptable. Dead code can be removed in a future cleanup CR once telemetry shows zero POS=0 traffic for affected offer types. |

---

## 10. Owner-decided answers (already received this session)

| # | Question | Owner answer | Default if not answered |
|---|---|---|---|
| Q1 | Multi-line benefit selection | **(ii) distribute-first** | (i) keep-current |
| Q2 | POS-zero-discount handling | **(a) record using CRM-computed** | (c) status quo |
| Q3 | "Nth working only in single order" semantic | **(i)** = `usage_limit`/`per_user_limit` doing its job | requires no code change |
| Q4 | Form defaults for `usage_limit` + `per_user_limit` | **Unlimited (null) by default** for BOGO/BXG/Nth | keep "1" |
| Gap B | Test BOGO against `free` or `percentage 50%` | **b1: percentage 50%** as configured | b1 |
| Gap C | POS-sent vs CRM-computed when both non-zero | **Keep current — POS wins, log mismatch** | unchanged |
| Gap E | Extend Mayur test coupons' `valid_to` | **No, leave as-is** | use Kunafa seed coupons for QA |
| Gap F | CR scope envelope | **New CR-021** | hot-fix |

All decisions locked. No further owner blockers for planning.

---

## 11. Effort estimate

| Track | Files | Lines (added/changed) | Hours |
|---|---|---|---|
| Backend — selector rewrite | `core/coupon.py` `_v3b_select_get_units` | ~30 LoC | 1.5 |
| Backend — recorder branch | `core/coupon.py` `record_coupon_usage_for_order` + `routers/pos.py:1568` | ~25 LoC | 1.0 |
| Frontend — limit defaults | `pages/CouponsPage.jsx` (3 lines) | 3 LoC | 0.25 |
| QA — new fixture | `tests/qa_cr021_distribute_and_pos_zero.py` | ~250 LoC, 12 assertions | 2.0 |
| QA — regression sweep | `qa_cr001c_c_coupon_v3_b_*.py`, `qa_cr001c_c_coupon_v3_c_*.py` | Audit + fix any assertion that depends on greedy-cheapest | 1.0 |
| Docs | discovery (this), planning, closeout, dashboard, register, decisions log | — | 1.0 |
| **Total** | | | **~6.75 hr (½ day +)** |

---

## 12. Definition of Done

1. ✅ `_v3b_select_get_units()` implements distribute-first algorithm; old single-line carts unchanged.
2. ✅ Both V3-B (BOGO/BXG) and V3-C (Nth) compute paths invoke the same updated selector — no duplication.
3. ✅ `record_coupon_usage_for_order()` records usage when POS sends 0 AND coupon is CRM-authoritative AND `crm_computed_discount > 0`, with `discount_mismatch=True`.
4. ✅ `pos.py:1568` gate updated to allow CRM-authoritative coupons through even when `coupon_discount=0`.
5. ✅ V1 simple coupons with POS-sent=0 STILL skip (no regression).
6. ✅ Frontend `CouponsPage.jsx` defaults `per_user_limit=""` (Unlimited) on create form; round-trips correctly via edit + submit.
7. ✅ Existing `qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` runs green (with any necessary assertion updates documented in planning doc §6).
8. ✅ Existing `qa_cr001c_c_coupon_v3_c_every_nth.py` runs green (same caveat).
9. ✅ New `qa_cr021_distribute_and_pos_zero.py` covers 12 scenarios (see planning doc §5) — 12/12 pass.
10. ✅ `memory/CR_STATUS_DASHBOARD.md` shows CR-021 ⏸ then 🟢 on completion.
11. ✅ Register `00_register/ROI_MEASUREMENT_CR_REGISTER.md` has a CR-021 row.
12. ✅ `memory/DECISIONS_LOG.md` has 4 new entries (D1: distribute-first, D2: POS-zero record, D3: form default, D4: V1 unchanged).
13. ✅ Closure doc `implementation/CR_021_*_CLOSEOUT.md` cross-references discovery + planning + QA report.

---

## 13. Acceptance criteria (testable)

| # | AC | Test source |
|---|---|---|
| A1 | BOGO/BXG cart with 2 distinct get-lines × applications=2 distributes 1 unit per distinct line before re-dipping | `qa_cr021` D1 |
| A2 | BOGO/BXG with `apply_to_highest_item=True` distributes from highest line first | `qa_cr021` D2 |
| A3 | Nth cart `[1A, 1B, 2C]` (3 lines, 4 eligible units, n=2 → 2 free) frees one of A and one of B (cheapest two distinct lines), NOT 2× C | `qa_cr021` D3 |
| A4 | Nth single-line cart unchanged | `qa_cr021` D4 + existing v3c suite |
| A5 | BOGO POS sends `code + discount=0` → CRM records using `crm_computed_discount`, `total_used` incremented, `discount_mismatch=True` | `qa_cr021` D5 |
| A6 | Second BOGO order with `usage_limit=1` already hit → rejected with `USAGE_LIMIT_REACHED` | `qa_cr021` D6 |
| A7 | Replay same `order_id` from A5 → `recorded=False, idempotent_replay=True`, `total_used` not double-incremented | `qa_cr021` D7 |
| A8 | V1 simple coupon with POS-sent=0 → still SKIP (no regression) | `qa_cr021` D8 |
| A9 | V2 item-scope with POS-sent=0 but CRM computes > 0 → record with mismatch | `qa_cr021` D9 |
| A10 | New coupon created via UI (create form) → `per_user_limit=null` in payload | manual UI check |
| A11 | Existing coupon with `per_user_limit=2` loaded in edit form → still shows 2 | manual UI check |
| A12 | All BOGO/BXG-existing assertions in `qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` pass after rewrite | regression run |
| A13 | All Nth-existing assertions in `qa_cr001c_c_coupon_v3_c_every_nth.py` pass after rewrite | regression run |

---

## 14. Sprint governance check

| Guardrail | Status |
|---|---|
| ❌ `testing_agent_v3` | **Not used** — owner opted out for sprint |
| ❌ Live WhatsApp sends | **None** in this CR (no message-trigger touch) |
| ❌ Reintroduce demo login | **N/A** — not touched |
| ❌ Live POS order creation | **None** — engine probes only, no DB writes |
| ✅ Read-only discovery | Static analysis + 1 Mongo find + 5 engine `_compute` probes |
| ✅ Owner decisions logged | All 8 in §10 |
| ✅ Risks enumerated with mitigations | §9 |
| ✅ Effort estimate | §11 (~½ day) |
| ✅ DoD measurable | §12 (13 items) |
| ✅ ACs testable | §13 (13 ACs) |

---

## 15. Appendix — repro commands used during discovery

### 15.1 Coupon DB read (Mayur)

```python
db.coupons.find({"user_id": "pos_0001_restaurant_523",
                 "offer_type": {"$in": ["bogo","bxg","nth_item"]}})
```

### 15.2 Engine probe (bypasses date/usage validation)

```python
from core.coupon import _v3b_compute_discount, _v3c_compute_discount

cart = [
    {"item_id":"201951","food_id":"201951","name":"mtest","quantity":1,"unit_price":250},
    {"item_id":"152751","food_id":"152751","name":"5Star","quantity":2,"unit_price":50},
    {"item_id":"200410","food_id":"200410","name":"xyz12","quantity":2,"unit_price":250},
]
BOGO = db.coupons.find_one({"id":"83195c07-b358-4a57-84a5-9089a1fca771"})
print(_v3b_compute_discount(BOGO, "bxg", cart))
```

Output captured 2026-06-06:
- 2 mtest + 2×(5Star + xyz12) → apps=2, but selector takes **2× 5Star** = ₹50 instead of **1× 5Star + 1× xyz12** = ₹150.

### 15.3 Coupon usage table check

```python
db.coupon_usage.count_documents({"coupon_id": "83195c07-b358-4a57-84a5-9089a1fca771"})
# → 0  (despite presumably multiple POS attempts at the BOGO)
```

---

## 16. PARK status block

```
status:         discovery_complete_awaiting_plan_signoff
parked_reason:  Awaiting owner sign-off on planning doc (per session governance: "in-depth planning before implementation")
resume_signal:  Owner says "plan approved" or "proceed with CR-021"
next_action:    Open planning doc CR_021_COUPON_DISTRIBUTE_AND_POS_ZERO_PLAN.md, owner reviews §3 file-level changes + §5 QA cases, gives go-ahead, then implementation begins.
```

---

**END OF DISCOVERY — CR-021**
