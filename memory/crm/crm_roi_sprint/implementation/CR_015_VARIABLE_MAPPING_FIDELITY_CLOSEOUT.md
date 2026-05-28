# CR-015 — Variable Mapping Fidelity — Implementation Closeout

**Sprint**: ROI Measurement / CRM
**CR code**: CR-015
**Lifecycle stage**: `cr015_implementation_phase_2_in_progress`
**Plan ref**: `/app/memory/crm/crm_roi_sprint/planning/CR_015_PHASE_1_PLAN.md` (v1.1, approved 2026-05-29)
**Probe ref**: `/app/memory/crm/crm_roi_sprint/investigations/CR_015_PRE_IMPL_GROUND_TRUTH_2026_05_29.md`
**Author**: agent (live-tracked, one entry per commit)

---

## Day-by-day handover notes

### Day 1 — 2026-05-29

**Scope (per plan §6)**: T1 (resolver hardening) + T5 (registry expansion + 2 new formatters)

#### Commits / Changes

**[Day 1 / T1] — Resolver hardening in `core/whatsapp.py`**
- `get_event_template_config` (lines 373-415): canonical-str lookup of `template_id`, fallback to int for legacy var_map rows (pre-T2 sweep).
- Canonical str returned in `config["template_id"]` regardless of input type.
- **Files changed**: `/app/backend/core/whatsapp.py` (+15 / −3)

**[Day 1 / T5] — Registry expansion in `core/whatsapp_variables.py`**
- 14 new entries appended (order context): `payment_method`, `order_date`, `order_time`, `restaurant_order_id`, `transaction_id`, `table_id`, `waiter_name`, `order_type`, `loyalty_points_used`, `loyalty_discount`, `wallet_used`, `tax_amount`, `item_count`, `order_notes`.
- **Files changed**: `/app/backend/core/whatsapp_variables.py` (+170)

**[Day 1 / T5] — New formatters in `core/whatsapp.py`**
- `time` formatter: ISO datetime → "7:45 PM" (12-hour, no leading zero).
- `titlecase` formatter: `dine_in` → `Dine-In`, hyphen-compound for `_`/`-` separated values, plain Title-Case for single words.
- **Files changed**: `/app/backend/core/whatsapp.py` (+24)

**[Day 1 / Tests] — Unit tests for T1 + T5**
- `tests/test_cr015_resolver.py` NEW — 44 tests (formatters, registry shape, resolve_variable() with new keys, T1 resolver behaviour with int/str template_id mismatch). **All 44 pass.**
- `tests/test_whatsapp_p2_5_expansion.py` — updated hardcoded 23 → 37 to match new total.
- `tests/test_whatsapp_variables_endpoint.py` — added 14 expected keys.
- **Regression**: ran 5 existing whatsapp test files → **109/109 pass** (44 new + 65 baseline). No behaviour regressions.

**[Day 1 / Live smoke] — T1 verification on R689**
- Ran `scripts/cr015_t1_smoke_probe.py` against remote DB.
- **Pre-T1 state** (per Phase 1.5 probe): `send_bill` event resolution returned `variable_mappings={}`.
- **Post-T1 state** (live now): `send_bill` returns all 7 slot mappings from template 25140 with canonical `template_id="25140"` (str). Bug #1 is functionally resolved.
- `send_bill_manual` / `send_bill_auto` unaffected (they were already working — both stored as str).
- Slots {{4}} and {{5}} still show the text-mode garbage strings (`"payment method missing "`, `"order dare missing "`) — to be fixed by T7 on Day 3.

**Day 1 status**: ✅ COMPLETE. T1 + T5 landed, tests green, live smoke proves R689 send_bill renders mappings correctly post-restart.

#### Acceptance progress

| # | Check | Status |
|---|---|---|
| 1 | T1 lands; live R689 probe shows `variable_mappings` non-empty for `send_bill` | ✅ done |
| 2 | T5 lands; 14 new entries + 2 new formatters; unit tests pass | ✅ done |

#### Open items for Day 2

- T3 — `build_order_event_context` helper + refactor `routers/pos.py:1462-1508` (3 triggers).
- Smoke probe end-to-end: synthetic POS order at preview → verify `event_data` has all 25+ keys in trigger log.

### Day 2 — 2026-05-29 (spec frozen, implementation pending)

**Status**: spec FROZEN at `/app/memory/crm/crm_roi_sprint/planning/CR_015_DAY_2_FROZEN_SPEC.md`. Awaiting implementation.

**Why a separate freeze doc**: owner observed drift between v1.0 plan and code in Day 0; requested a code-level freeze for Day 2 before any implementation, so an implementation agent can execute mechanically. Audit performed file-by-file; net result was 2 minor refinements (dropped unused `coupon` param from helper; clarified `/api/pos/events` is out-of-scope per POS contract). No scope changes from plan v1.1.

**T3 scope summary**:
- Add `build_order_event_context(order_data, customer, *, points_earned, new_points, wallet_used, new_wallet_balance, crm_loyalty_points_redeemed=0, crm_loyalty_discount=0.0, extra=None)` to `core/whatsapp.py`
- Refactor 3 trigger callsites in `routers/pos.py` (lines 1462, 1481, 1497) to spread `**order_ctx` into their event_data dicts
- Add 10 unit tests in `tests/test_cr015_event_context.py`
- 3 files touched, ~270 LoC net delta

**Acceptance gate**: 10 checks in §8.3 of the freeze doc.

**Implementation agent picks up here.**

---

## Acceptance matrix (DoD §11 of plan)

| # | Check | Status |
|---|---|---|
| 1 | T1 lands; live R689 probe shows `variable_mappings` non-empty for `send_bill` (template_id 25140 int) | ✅ done (Day 1) |
| 2 | T5 lands; 14 new entries + 2 new formatters; unit tests pass; backward-compatible | ✅ done (Day 1) |
| 3 | T3 lands; live POS order against R689 trace shows all `order_ctx` keys present in `event_data` | ⏳ |
| 4 | T6 server-side rejects bad var_keys (422); client-side surfaces inline error | ⏳ |
| 5 | T7 R689 template 25140 mapping cleaned to all-valid keys | ⏳ |
| 6 | T4 minor enrichments (wallet:55/77, points:133, loyalty:456) | ⏳ |
| 7 | T2 mongodump taken; R689's 2 int rows coerced to str; resolver fallback branch removed | ⏳ |
| 8 | Live integration test (plan §9.3) passes — Rs.1850 order → WhatsApp arrives with all 7 slots populated correctly + `delivered`/`read` callbacks | ⏳ |
| 9 | Coupon-applied order renders coupon variables correctly | ⏳ |
| 10 | QA report at `qa/CR_015_LIVE_TEST_REPORT.md` with acceptance matrix | ⏳ |
| 11 | Dashboard row 15 status → `cr015_closed_live_test_passed` | ⏳ |
| 12 | Register row updated | ⏳ |
| 13 | PRD.md §11 line updated | ⏳ |

---

**Status**: Day 1 starting now.
