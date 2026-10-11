# CR-021 — Implementation Report

**Started**: 2026-06-06
**Author**: E1
**Branch**: `5-june`
**Plan**: `../planning/CR_021_COUPON_DISTRIBUTE_AND_POS_ZERO_PLAN.md`
**Order of execution**: per plan §15.8

This file is appended to after each step. Each entry = (timestamp, step, file, line range, before-state SHA snippet, after-state, smoke-test result, observations).

---

## Step 1 — Change A: `_v3b_select_get_units` distribute-first rewrite

**Status**: ✅ DONE 2026-06-06
**Target**: `backend/core/coupon.py` lines 743–754 → now 743–807 (function body expanded from 12 to 65 LoC)
**Diff**: replaced legacy single-pass `sorted+slice` with 3-step group-sort-roundrobin algorithm per plan §3.1.1 / §15.1

**Smoke test (10 cases, all pass):**

| # | Cart | units_needed | Flag | Got | Expected | ✓ |
|---|---|---|---|---|---|---|
| A | A=250, B=50 | 2 | (default) | `[B, A]` | `[B, A]` | ✓ |
| B | A=250, B=50 | 1 | (default) | `[B]` | `[B]` | ✓ |
| C | A×3 same price | 2 | (default) | `[A, A]` | `[A, A]` legacy match | ✓ |
| D | A=250, B=250, C=50×2 | 2 | (default) | `[C, A]` | `[C, A]` (cheapest first then A by insertion) | ✓ |
| E | A=100, B=500, C=50 | 2 | highest | `[B, A]` | `[B, A]` | ✓ |
| F | A×2, B×2, C×2 | 4 | (default) | `[C, A, B, C]` | round-robin distribute | ✓ |
| G | A×1 | 0 | (default) | `[]` | `[]` | ✓ |
| H | [] | 5 | (default) | `[]` | `[]` | ✓ |
| I | A=100, B=50 | 10 | (default) | `[B, A]` | exits cleanly, no infinite loop | ✓ |
| **J** | **mtest=250 + xyz12=250 + 5Star=50×2** | **2** | (default) | **`[5Star, mtest]`** | **1 of 5Star + 1 of next distinct line (D1 owner repro)** | **✓** |

**Owner repro J**: legacy returned `[5Star, 5Star]` (₹100 discount). Fixed returns `[5Star, mtest]` (cheapest distinct first, then next distinct line by sort + insertion-order tie-break) — discount applies to one of each distinct eligible line. **Bug B1 fixed at the selector layer.**

## Steps 2 & 3 — Existing-suite regression

**Status**: ✅ DONE 2026-06-06
**V3-B (BOGO/BXGY) suite** `qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` → **49/49 PASS**, 0 FAIL
**V3-C (Every-Nth) suite** `qa_cr001c_c_coupon_v3_c_every_nth.py` → **41/41 PASS**, 0 FAIL

Zero assertions baked in the legacy cheapest-greedy behavior. Distribute-first is fully back-compat with existing test surface.

### Audit notes (per plan §15.7)
- Both fixtures use either single-line carts or multi-line carts where the legacy and distribute-first selectors converge (e.g. `units_needed=1`, or carts where each line has exactly 1 unit).
- The owner-repro case (mixed cart with one line having multiple units to spare) is **not exercised** in legacy fixtures — which is why the bug was invisible. This is exactly the gap that the new `qa_cr021` fixture will cover (cases D1, D3 in plan §5.1).

## Step 4 — Change B: `record_coupon_usage_for_order` POS-zero recording branch

**Status**: ✅ DONE 2026-06-06
**Target**: `backend/core/coupon.py` lines ~2078–2230
**Edits applied**:
- B1: replaced early-skip (was 2131–2136) with `pos_sent_zero = ...` flag, no early return
- B2: replaced legacy variance log + mismatch flag (was 2205–2213) with universal POS-zero late-skip + drift log + `effective_pos_sent` + augmented `discount_mismatch`
- B3: renamed `pos_sent` → `effective_pos_sent` in `usage_doc.coupon_discount` (line 2230), `usage_doc.discount_applied` (line 2244), success-return `coupon_discount` (line 2287). Replay branch unchanged (returns existing row value).

**Net change**: ~50 LoC added/modified. Function shape preserved.

**Regression after Change B**: V3-B 49/49 PASS, V3-C 41/41 PASS — both suites still 100% green.

## Step 5 — Change C: `pos.py` gate relaxed + dead elif removed

**Status**: ✅ DONE 2026-06-06
**Target**: `backend/routers/pos.py` lines 1568, 1618–1623
**Edits**:
- C1: gate at 1568 changed from `if order_data.coupon_code and (order_data.coupon_discount or 0.0) > 0:` → `if order_data.coupon_code:` (recorder now decides skip)
- C2: deleted the elif block at 1618–1623 (`coupon_zero_discount_skipped`) — dead after gate relaxation; recorder still emits the warning from core/coupon.py.

**Net change**: 1 if-condition simplified, 6 LoC removed (dead elif).

## Step 6 — Change D: Pydantic schema defaults + runtime `or 1` coercion

**Status**: ✅ DONE 2026-06-06
**Target**: `backend/models/schemas.py` lines 584, 757
**Edits**:
- D1: `CouponCreate.per_user_limit: int = 1` → `Optional[int] = None`
- D2: `Coupon.per_user_limit: int = 1` → `Optional[int] = None`
- D3 (bonus fix): `core/coupon.py:1727` runtime coerced `coupon.get("per_user_limit") or 1` → now honors None as Unlimited
- D4 (bonus fix): `routers/coupons.py:194` coerced `coupon.get("per_user_limit", 1)` → now honors None as Unlimited

Without D3+D4, schema would say "Optional" but runtime would still cap at 1 — would have been a silent regression. Caught during plan §3.5 audit.

**Backend restarted** after schema change. Health: OK.

## Step 7 — Change E: Frontend defaults + placeholder

**Status**: ✅ DONE 2026-06-06
**Target**: `frontend/src/pages/CouponsPage.jsx` lines 76, 295, 364, 938
**Edits**:
- E1 (line 76): `per_user_limit: "1"` → `per_user_limit: ""`
- E2 (line 295): edit-prefill now returns `""` for null instead of `"1"`
- E3 (line 364): submit-payload now sends `null` for empty instead of `1`
- E4 (line 938): placeholder `"1"` → `"Unlimited"`

Frontend hot-reloads automatically. No restart needed.

## Step 8 — New QA fixture `qa_cr021_distribute_and_pos_zero.py`

**Status**: ✅ DONE 2026-06-06
**File**: `/app/backend/tests/qa_cr021_distribute_and_pos_zero.py` — 366 LoC, 12 scenarios, 52 assertions
**Result**: **52/52 PASS** on first run, zero edits to expected values needed.

### Scenario summary

| Case | Scope | Assertions | Status |
|---|---|---|---|
| D1 | BOGO/BXG distribute (default cheapest) | 4 | ✓ |
| D2 | BOGO/BXG distribute (highest first) | 4 | ✓ |
| D3 | Nth distribute mixed cart | 4 | ✓ |
| D4 | Nth single-line back-compat | 4 | ✓ |
| D5 | POS=0 V3-B records via CRM | 8 | ✓ |
| D6 | usage_limit=1 blocks 2nd order | 3 | ✓ |
| D7 | Idempotent replay no double-record | 5 | ✓ |
| D8 | POS=0 V1 simple records (D3 all-in) | 4 | ✓ |
| D9 | POS=0 V2 item-scope records | 4 | ✓ |
| D10 | POS>0 mismatch unchanged | 5 | ✓ |
| D11 | POS>0 matches CRM | 4 | ✓ |
| D12 | POS=0 AND CRM=0 skips | 3 | ✓ |

## Step 9 — Full regression sweep

**Status**: ✅ DONE 2026-06-06

| Suite | PASS | FAIL | Notes |
|---|---|---|---|
| `qa_cr001c_c_coupon_v3_b_bogo_bxgy` | **49** | 0 | All legacy BOGO/BXG assertions preserved |
| `qa_cr001c_c_coupon_v3_c_every_nth` | **41** | 0 | All legacy Nth assertions preserved |
| `qa_cr021_distribute_and_pos_zero` | **52** | 0 | New CR-021 fixture, full green |
| **TOTAL** | **142** | **0** | Zero regressions |

---

**ALL STEPS 1–9 COMPLETE.** Step 10 (docs finalization) in progress.

---

## Step 10 — Docs finalization

**Status**: ✅ DONE 2026-06-06
- [x] IMPLEMENTATION_REPORT.md (this file)
- [x] CR_021_CLOSEOUT.md
- [x] CR_STATUS_DASHBOARD.md updated (queue + recent transition row + last-updated date)
- [x] ROI_MEASUREMENT_CR_REGISTER.md updated (row #25)
- [x] DECISIONS_LOG.md — 4 new entries (D1, D2/D3, D4, D-runtime-fix)
- [x] PRD_SESSION.md — CR-021 section appended

**CR-021 status**: 🟢 CLOSED — code complete, QA 142/142 pass, docs finalized.