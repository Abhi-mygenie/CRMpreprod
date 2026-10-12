# CR-123 — QA Handover: Loyalty earn base = pre-tax, post-discount, post-redemption (+ S&O preview params)
**Date**: 2026-10-12 · **Role**: Implementation Agent → QA · **Risk**: LOW
**Plan**: `planning/CR_123_IMPLEMENTATION_PLAN.md` · **IA**: `planning/CR_123_IMPACT_ANALYSIS.md` · **Intake**: `discovery/CR_123_LOYALTY_EARN_BASE_SUB_TOTAL_INTAKE.md`

---

## 1. What changed (code)

| Edit | File | Lines (post-edit) | Marker |
|---|---|---|---|
| E1 | `routers/pos.py` | 1448–1462 — earn-base branch | `# CR-123 (2026-10-12)` |
| E2-A | `routers/pos.py` | 882 — `_save_order_and_transactions(..., earn_base_amount: Optional[float] = None)` | `# CR-123` |
| E2-B | `routers/pos.py` | 1057–1061 — tx description `Rs.<net> net` | `# CR-123` |
| E2-C | `routers/pos.py` | 1557 — call site passes `earn_base_amount=` | `# CR-123` |
| E3 | `routers/scan.py` | 576–579 model · 582–586 docstring · 598–605 compute · 615–617 response | `# CR-123` |

`grep -c "CR-123"` → pos.py 5 · scan.py 8. Plan followed edit-by-edit; **no improvisation, no scope expansion.** `core/loyalty.py`, `/pos/max-redeemable`, `payment-received` untouched.

---

## 2. Self-test results (preprod r689 · customer `9830291686` "Alok Test" · Bronze 5 % · min_order 200 · ratio 1.0 · off-peak ON but bonus 0 at test time)

| T | Case | Expected | Actual | Result |
|---|---|---|---|---|
| T1 | `sub_total 1040 · amount 1092 · gst 52` | base 52 | **52** (today would be 54) | ✅ |
| T2 | order-1233135 shape: `sub_total 290 · coupon 43.5 · gst 12.33 · amount 258.83` | 12 | **12** (today 10; naive sub-total 14) | ✅ |
| T3 | fallback: no `sub_total`, `coupon 10`, `amount 99` | success, 0 (< min_order 200), no error | **success=True, 0** | ✅ |
| T4 (first run) | redeem 100 while customer had 64 pts | redeem rejected, order proceeds, earn on 440 → 22 | **22**, log `loyalty_redeem_failed … Minimum 100 points required. Customer has 64. — order will proceed` | ✅ (CR-007 behaviour intact — test-data ordering issue, not a defect) |
| T4b | redeem 100 of 138 · `sub_total 440 · amount 340` | 17, total 138−100+17 = 55 | **17, total 55**, `loyalty_redeem.points_redeemed 100` | ✅ G2 preserved |
| T4c (V4) | `sub_total 190 · amount 210` under min_order 200 | 0 | **0** | ✅ gate on net base |
| T5 | `points_transactions.description` | `Rs.1040.00 net` / `Rs.246.50 net` / `Rs.440.00 net` | exactly those | ✅ |
| T6-1 | `/scan/max-redeemable {bill 290, coupon 43.5}` | 12 = T2 stored | **12**, base 246.5 | ✅ parity |
| T6-2 | `{bill 1040}` (no new fields) | 52, base 1040, applied 0, same keys + 2 | **52 / 1040.0 / 0**, 11 keys | ✅ backward compat |
| T6-3 | `{bill 1040, points_to_redeem 50}` (cap 110) | 49, base 990 | **49 / 990.0 / applied 50** | ✅ |
| T6-4 | `{bill 1040, points_to_redeem 9999}` (cap 110) | applied == cap, base 930, 46 | **46 / 930.0 / applied 110** | ✅ clamp |
| T6-5 | `points_to_redeem 50` while customer below min_redemption (cap 0) | applied 0, projected unchanged | **applied 0, 52** | ✅ never previews a redemption commit would reject |

**12/12 PASS.**

### Regression suites
See §5 (appended after run). Command: `pytest tests/test_iter6_phase_a.py tests/test_iter6_phase_b.py tests/test_cr085a_normalization.py tests/test_cr082_requires_customer.py tests/test_cr094_loyalty_rules.py tests/test_cr106_cr109_phaseD.py`.

---

## 3. Test data written (preprod r689 only)

Orders `CR123-T1-*`, `T1b`, `T1c`, `T1d`, `T2`, `T3`, `T4`, `T4b`, `T4c` (ts `1791790531`) on customer `5a7e2ff3-3e26-47d2-81b8-b54a9a02d3ae`.
Pre-test snapshot: `qa/cr123_pretest_snapshot.json` → `total_points 0 · total_visits 0 · total_spent 0.0 · Bronze`.
**Cleanup** (run after owner smoke, not before): `qa/cr123_cleanup.py` — deletes `orders`/`order_items`/`points_transactions`/`loyalty_redemptions`/`loyalty_transactions` for those `pos_order_id`s AND `user_id = pos_0001_restaurant_689`, then restores the snapshot. Never run with a broader filter (QA-incident rule 2026-07-04).

---

## 4. QA checklist for QA role

- [x] T1–T6 PASS with base-point values per plan §5
- [x] V3 fallback unchanged, no double deduction, no exception
- [x] V8 `/scan/max-redeemable` backward compatible (same keys + `earn_base_preview`, `points_to_redeem_applied`)
- [ ] Regression suites PASS (see §5)
- [x] Code markers present (5 + 8)
- [ ] Test data cleaned after owner smoke
- [ ] Downstream briefs drafted (owner sends): POS · S&O (see plan §6)

---

## 5. Regression run
_(appended below)_

**Environment during run (2026-10-12 07:40–07:55 UTC):** upstream MyGenie SSO `https://preprod.mygenie.online/api/v1/auth/vendoremployee/login` was **unreachable** (direct curl: timeout 15 s; via CRM `/api/auth/login`: 504 after 10 s, Cloudflare HTML). Every test that needs an **owner JWT** therefore errored at fixture time. Tests that use only the **POS `X-API-Key`** or a **scan customer token** — i.e. every CR-123 surface — ran normally.

| Suite | Result | Classification |
|---|---|---|
| `test_cr094_loyalty_rules.py` | **12/13 PASS** · R5 `ip_limiter` fail | R5 = 61 parallel requests expecting exactly 60×200 + 1×429 — documented pre-existing timing pattern (CR-119/121 QA report, same note). Not CR-123. |
| `test_cr106_cr109_phaseD.py` | **9/15** · B_V4 fail · C_*/D_* 5 errors | B_V4 `takeaway (28) != delivery (29)` = test-data: `STO-DELIVERY` delivery-only coupon created 2026-10-12 for S&O validation (CR-121 session). C_*/D_* = owner-JWT fixture → SSO outage. Not CR-123. |
| `test_iter6_phase_a.py` | Q0/Q1/Q3 PASS · Q2/Q4/ZZ errors · Q6–Q9 fail | Q2/Q4/ZZ = owner-JWT (SSO). Q6/Q8/Q9 cascade from Q2 (coupon never created). **Q7 = `Duplicate order - already processed`** — fixed `pos_order_id qa085a2_q7` left behind because `ZZ_cleanup` could not log in; residue, not logic. Not CR-123. |
| `test_iter6_phase_b.py` · `test_cr085a_normalization.py` · `test_cr082_requires_customer.py` | owner-JWT fixtures → 504/HTML | SSO outage. Not CR-123. |

**Loyalty-math coverage actually exercised:** T1–T6 (12/12) + `test_cr094_loyalty_rules` R1–R4, R6, R8–R13 PASS (loyalty-rules read path unchanged) + `test_cr106_cr109_phaseD` B_V1–V3/V5 (scan coupon list unchanged).

**QA role must re-run** the four owner-JWT suites once `preprod.mygenie.online` is reachable (`curl -m 15 -X POST https://preprod.mygenie.online/api/v1/auth/vendoremployee/login` returns JSON, not timeout), then run `python qa/cr123_cleanup.py --apply` and also delete residue order `qa085a2_q7` on r69 (`pos_owner_69_bdd4513c`).

**Exit-gate note:** build/compile clean (`ast.parse` + `ruff F821` OK, backend hot-reloaded, `/api/health` 200). Regression item is **PARTIAL** — blocked by upstream, not by code.
