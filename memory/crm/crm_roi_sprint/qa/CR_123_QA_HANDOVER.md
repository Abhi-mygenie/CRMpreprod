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
- [x] Regression suites PASS (see §5 — 83/86; 3 non-CR-123, classified)
- [x] Code markers present (5 + 8)
- [ ] Test data cleaned after owner smoke
- [ ] Downstream briefs drafted (owner sends): POS · S&O (see plan §6)

---

## 5. Regression run

### 5.1 First attempt — 2026-10-12 07:40–07:55 UTC (BLOCKED, superseded)
Upstream MyGenie SSO was unreachable (504/Cloudflare HTML); every owner-JWT suite errored at fixture time. Loyalty-math surfaces (POS key / scan token) ran clean. Details retained in git history; superseded by 5.2.

### 5.2 QA re-run — 2026-06 (SSO restored; forked pod) · **RESULT: CR-123 PASS**
**Env:** SSO reachable (direct `POST .../vendoremployee/login` → 403 JSON, not timeout). Suites run against the **preview backend** (`REACT_APP_BACKEND_URL=https://mygenie-crm-preprod.preview.emergentagent.com`, no trailing `/api`) with `CRM_TEST_OWNER_PASSWORD=Qplazm@10`, `MONGO_URL` exported. Owner `owner@thegoankitchen.com` (r69, `pos_owner_69_bdd4513c`).

> ⚠ **Harness-invocation note (not a code change):** the suites read `REACT_APP_BACKEND_URL` from the shell; if unset, `iter6` `load_dotenv("/app/backend/.env")` falls back to the **production** value `https://crm.mygenie.online/api` (already ends in `/api`) → tests then append a 2nd `/api` → `/api/api/...` → 404s. Always export the **preview** URL + `CRM_TEST_OWNER_PASSWORD` before `pytest`.

**Command:** `pytest tests/test_iter6_phase_a.py tests/test_iter6_phase_b.py tests/test_cr085a_normalization.py tests/test_cr082_requires_customer.py tests/test_cr094_loyalty_rules.py tests/test_cr106_cr109_phaseD.py -v`

**Score: 83 passed / 86 · 3 failures — all classified NON-CR-123.**

| Suite | Result | Notes |
|---|---|---|
| `test_cr094_loyalty_rules.py` | **13/13 PASS** | R1–R13 incl. R5 ip_limiter (flake cleared on this run). Loyalty read path clean. |
| `test_cr085a_normalization.py` | **PASS** | A6 green after clearing one residue customer (below). |
| `test_cr082_requires_customer.py` | **PASS** | — |
| `test_iter6_phase_b.py` | **PASS** | I1–I9 incl. deleted-OTP 404s, identity, CSV dedup. |
| `test_iter6_phase_a.py` | **Q0–Q9 PASS except Q2** | Q4 (customers read 500) was transient residue — green on clean run. Q7/Q8/Q9 green after residue clear. See Q2 below. |
| `test_cr106_cr109_phaseD.py` | **PASS except B_V4** | B_V5 re-run isolated → **PASS** (was a one-off Mongo `ServerSelectionTimeoutError` to 52.66.232.149 — infra blip). |

**The 3 failures, classified (QA severity):**
1. **`iter6 Q2_guest_coupon`** — NOTE / stale-test. Order processed correctly as guest (`guest_reason=invalid_phone`, `points_earned=0`). Only the `coupon_usage.recorded is True` assertion failed because the freshly-created `QA085A2` coupon has **`requires_customer=True`** (schema default — `models/schemas.py:615,783`), so CR-082 (`core/coupon.py:1767-8`) **correctly** returns `CUSTOMER_REQUIRED` on a customer-less guest order. Test expectation is outdated vs CR-082 default; **not CR-123** (coupon-usage recording untouched by CR-123). → raise test-fix micro-item.
2. **`cr106 B_V4_takeaway_same_as_delivery`** — MINOR / test-data. `takeaway(28) != delivery(29)` caused by the `STO-DELIVERY` delivery-only coupon seeded 2026-10-12 for S&O validation (CR-121 session). Pre-existing, documented. **Not CR-123.**
3. **`cr106 B_V5`** — NOTE / infra flake. One-off `ServerSelectionTimeoutError`; **passed on isolated re-run.** **Not CR-123.**

**Residue cleanup performed before clean re-run (scoped, QA-legitimate):** deleted exactly one leftover customer `a81141a5-932b-43ea-b861-138152cdeffe` (`TEST_Q9_junk`, phone `0000000000`, `user_id=pos_owner_69_bdd4513c`) stranded by the aborted first run (its cleanup fixture never executed under SSO outage). The `qa085a2_*` residue orders had already been removed by this run's `ZZ_cleanup`. No broad filters used (QA-incident rule 2026-07-04 honoured).

**CR-123 verdict:** every CR-123 surface PASS — self-test T1–T6 (12/12), loyalty-rules R1–R13, POS order earn-base (guest/valid/redeem paths via Q2/Q7/Q8 order processing), `/scan/max-redeemable` preview parity. No CR-123 regression anywhere in the batch.

**Exit-gate:** build/compile clean, backend healthy (`/api/health` 200). Regression item **COMPLETE**.

### 5.3 Pending (next gates, not QA)
- **Owner smoke** on preprod (owner-side acceptance).
- **After owner smoke:** `python qa/cr123_cleanup.py --apply` (deletes CR123-T* test orders on r689 + restores snapshot). Not run yet per owner instruction.
- Optional test-fix micro-item: update `iter6 Q2` expectation to accept `CUSTOMER_REQUIRED` for a `requires_customer=True` coupon on a guest order.
