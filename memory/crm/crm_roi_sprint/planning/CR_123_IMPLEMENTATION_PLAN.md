# CR-123 — Implementation Plan: Loyalty earn base = pre-tax, post-discount, post-redemption (+ S&O preview params)
**Date**: 2026-10-12 · **Role**: Planning Agent · **Risk**: LOW · **No code changed. No data written.**
**Impact Analysis**: `planning/CR_123_IMPACT_ANALYSIS.md` · **Intake**: `discovery/CR_123_LOYALTY_EARN_BASE_SUB_TOTAL_INTAKE.md`
**Decisions applied**: Q1 discounts-first · Q2 legacy out · Q3 `points_to_redeem` · Q4 forward-only · D1 no POS mirror · D2 no `self_discount` · D3 `coupon_discount` on preview · D4 cosmetic desc (owner silent → IA defaults)

---

## 1. Scope lock

**Files that WILL change:** `routers/pos.py` (E1 + E2, ~12 lines) · `routers/scan.py` (E3, ~12 lines).
**Everything else is out of scope.** `core/loyalty.py` is NOT touched. `/pos/max-redeemable` and `payment-received` are NOT touched.

**Sequencing:** implement on preprod now; ship to prod **after** the October batch is smoked and deployed (do not fold into that batch). CRs 119–122 already live on preprod — no rebase.

---

## 2. Pre-implementation checklist

- [ ] `GET /api/health` → 200; `backend/.env` points at **preprod**
- [ ] Read `pos.py` 870–882, 1056–1059, 1440–1452, 1542–1546 and `scan.py` 576–608 immediately before editing (line numbers below are as of 2026-10-12)
- [ ] r689 loyalty settings confirmed: `loyalty_enabled true · bronze 5 % · min_order_value 200 · ratio 1.0 · min_redemption 100 · max_redemption_percent 50 · off_peak_bonus_enabled TRUE` → self-test must read `off_peak_bonus` from the response and subtract it before asserting base points
- [ ] Test customer r689 `9830291686` ("Alok Test", 0 pts) — T-orders below write to preprod r689 only, order ids prefixed `CR123-`

---

## 3. Edits — in order

### Edit 1 — Earn base (the fix)

**File:** `routers/pos.py` · **Location:** lines 1444–1449

**Before:**
```python
        # CR-001C-LR correction (2026-05-23): earn base is the NET amount
        # (order_amount − loyalty_redeemed_value) per Q-CORR-3 Option B.
        # CR-001C-L Phase L5 (2026-05-25): inlined direct call to shared
        # helper. Old `_calculate_points` wrapper removed.
        loyalty_enabled = bool(settings.get("loyalty_enabled", False))
        earn_base_amount = max(0.0, order_data.order_amount - loyalty_redeemed_value)
```

**After:**
```python
        # CR-001C-LR correction (2026-05-23): earn base is the NET amount
        # (order_amount − loyalty_redeemed_value) per Q-CORR-3 Option B.
        # CR-001C-L Phase L5 (2026-05-25): inlined direct call to shared
        # helper. Old `_calculate_points` wrapper removed.
        # CR-123 (2026-10-12): earn on pre-tax food value, net of discounts and redemption.
        # POS order_sub_total_amount is pre-coupon → subtract coupon/order discount explicitly.
        # Fallback when POS omits sub-total: order_amount is already net of discounts → only redemption.
        loyalty_enabled = bool(settings.get("loyalty_enabled", False))
        if order_data.order_sub_total_amount:
            earn_base_amount = max(0.0, (
                float(order_data.order_sub_total_amount)
                - float(order_data.coupon_discount or 0.0)
                - float(order_data.order_discount or 0.0)
                - loyalty_redeemed_value
            ))
        else:
            earn_base_amount = max(0.0, order_data.order_amount - loyalty_redeemed_value)  # pre-CR-123 behaviour
```

**Why:** branch (not `sub_total or order_amount`) so the fallback never double-deducts discounts. Truthiness check treats `0.0` sub-total as absent (a zero-food order has nothing to earn on either way). `loyalty_redeemed_value` is already a float set in the CR-007 block above.

---

### Edit 2 — Points-history description shows the net base (D4)

**File:** `routers/pos.py` · **Location A:** lines 870–882 (signature) · **Location B:** line 1057 (description) · **Location C:** lines 1542–1546 (call site)

**A — Before:**
```python
    crm_loyalty_points_redeemed: int = 0,
    crm_loyalty_discount: float = 0.0,
) -> str:
```
**A — After:**
```python
    crm_loyalty_points_redeemed: int = 0,
    crm_loyalty_discount: float = 0.0,
    earn_base_amount: Optional[float] = None,  # CR-123
) -> str:
```

**B — Before:**
```python
    if points_earned > 0:
        desc = f"Earned on order {order_data.order_id} (Rs.{order_data.order_amount})"
```
**B — After:**
```python
    if points_earned > 0:
        if earn_base_amount is not None:  # CR-123: show the net base the % was applied to
            desc = f"Earned on order {order_data.order_id} (Rs.{earn_base_amount:.2f} net)"
        else:
            desc = f"Earned on order {order_data.order_id} (Rs.{order_data.order_amount})"
```

**C — Before:**
```python
        order_id = await _save_order_and_transactions(
            order_data, user, customer, points_earned, new_points,
            wallet_used, new_wallet_balance, pts["off_peak_bonus"], now,
            crm_loyalty_points_redeemed, crm_loyalty_discount,
        )
```
**C — After:**
```python
        order_id = await _save_order_and_transactions(
            order_data, user, customer, points_earned, new_points,
            wallet_used, new_wallet_balance, pts["off_peak_bonus"], now,
            crm_loyalty_points_redeemed, crm_loyalty_discount,
            earn_base_amount=earn_base_amount,  # CR-123
        )
```

**Why:** keyword-only default `None` keeps any other caller (none today — single call site at 1542) unchanged.

---

### Edit 3 — `/scan/max-redeemable` preview params (Q3 = b, D3 = yes)

**File:** `routers/scan.py` · **Location:** lines 576–608

**Before:**
```python
class ScanMaxRedeemableRequest(BaseModel):  # CR-107
    bill_amount: float


@router.post("/max-redeemable")
async def scan_max_redeemable(
    data: ScanMaxRedeemableRequest,
    auth: dict = Depends(verify_customer_token),
):  # CR-107
    """CR-107: max loyalty points redeemable for a given bill amount. Read-only."""
    rid = auth["restaurant_id"]
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": rid}, {"_id": 0}
    )
    if not customer:
        return _resp(False, "Customer not found")
    settings = await db.loyalty_settings.find_one({"user_id": rid}, {"_id": 0})
    cap = compute_max_redeemable(customer, settings, data.bill_amount)
    projected_earned = 0
    if cap["loyalty_enabled"] and settings:
        pts = calculate_points(data.bill_amount, customer, settings)
        projected_earned = pts.get("total_points", 0)
    return _resp(True, "Max redeemable computed", {
        "ok":                      cap["ok"],
        "code":                    cap.get("code"),
        "max_points_redeemable":   cap["max_points_redeemable"],
        "max_discount_value":      cap["max_discount_value"],
        "ratio_per_point":         cap["ratio_per_point"],
        "available_points":        cap["available_points"],
        "min_redemption_points":   cap["min_redemption_points"],
        "loyalty_enabled":         cap["loyalty_enabled"],
        "projected_points_earned": projected_earned,
    })  # CR-107
```

**After:**
```python
class ScanMaxRedeemableRequest(BaseModel):  # CR-107
    bill_amount: float                          # pre-tax, pre-discount cart sub-total (= POS order_sub_total_amount)
    points_to_redeem: Optional[int] = None      # CR-123: preview earn after redeeming these points
    coupon_discount: Optional[float] = None     # CR-123: preview earn after this coupon (from /scan/coupons/validate)


@router.post("/max-redeemable")
async def scan_max_redeemable(
    data: ScanMaxRedeemableRequest,
    auth: dict = Depends(verify_customer_token),
):  # CR-107 · CR-123
    """CR-107: max loyalty points redeemable for a given bill amount. Read-only.
    CR-123: projected_points_earned uses the same net base as POST /pos/orders —
    bill_amount − coupon_discount − (points_to_redeem × ratio), clamped to the redeemable cap."""
    rid = auth["restaurant_id"]
    customer = await db.customers.find_one(
        {"id": auth["customer_id"], "user_id": rid}, {"_id": 0}
    )
    if not customer:
        return _resp(False, "Customer not found")
    settings = await db.loyalty_settings.find_one({"user_id": rid}, {"_id": 0})
    cap = compute_max_redeemable(customer, settings, data.bill_amount)
    # CR-123: net earn base mirrors pos.py earn-base rule
    pts_applied = max(0, min(int(data.points_to_redeem or 0), int(cap["max_points_redeemable"] or 0)))
    earn_base = max(0.0, (
        float(data.bill_amount)
        - float(data.coupon_discount or 0.0)
        - pts_applied * float(cap["ratio_per_point"] or 0.0)
    ))
    projected_earned = 0
    if cap["loyalty_enabled"] and settings:
        pts = calculate_points(earn_base, customer, settings)
        projected_earned = pts.get("total_points", 0)
    return _resp(True, "Max redeemable computed", {
        "ok":                      cap["ok"],
        "code":                    cap.get("code"),
        "max_points_redeemable":   cap["max_points_redeemable"],
        "max_discount_value":      cap["max_discount_value"],
        "ratio_per_point":         cap["ratio_per_point"],
        "available_points":        cap["available_points"],
        "min_redemption_points":   cap["min_redemption_points"],
        "loyalty_enabled":         cap["loyalty_enabled"],
        "projected_points_earned": projected_earned,
        "earn_base_preview":       round(earn_base, 2),  # CR-123
        "points_to_redeem_applied": pts_applied,         # CR-123
    })  # CR-107 · CR-123
```

**Why:** both new request fields default `None` → `pts_applied 0`, `earn_base = bill_amount` → `projected_points_earned` identical to today; two additive response keys only. Clamp to `max_points_redeemable` so the preview can never promise an earn based on a redemption the commit path would reject. `cap["ratio_per_point"]` is `0.0` when `SETTINGS_MISSING`/`LOYALTY_DISABLED` → deduction 0, `projected 0` as today.

---

## 4. Self-test sequence (preprod r689 — writes `CR123-*` test orders)

```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
KEY=$(cd /app/backend && python3 -c "
import os;from dotenv import load_dotenv;load_dotenv('.env');from pymongo import MongoClient
print(MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']].users.find_one({'id':'pos_0001_restaurant_689'})['api_key'])")
H=(-H "X-API-Key: $KEY" -H "Content-Type: application/json")
TS=$(date +%s)
PH=9830291686   # Alok Test, Bronze 5 %, r689 min_order 200, ratio 1.0, OFF-PEAK ON → read off_peak_bonus and subtract

# T1 — tax excluded: sub_total 1040, amount 1092 → base 1040 → 52 (+off_peak)
curl -s -X POST "$API_URL/api/pos/orders" "${H[@]}" -d "{\"pos_id\":\"0001\",\"restaurant_id\":\"689\",\"order_id\":\"CR123-T1-$TS\",\"cust_mobile\":\"$PH\",\"order_amount\":1092,\"order_sub_total_amount\":1040,\"gst_tax\":52,\"tax_amount\":52,\"items\":[{\"item_name\":\"Kunafa\",\"qty\":1,\"price\":1040}]}" \
 | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('T1 base_pts=',d['points_earned']-d['off_peak_bonus'],'(expect 52) total_points=',d['total_points'])"

# T2 — coupon deducted (replay 1233135 shape): 290 − 43.5 = 246.5 → 12 (+off_peak)
curl -s -X POST "$API_URL/api/pos/orders" "${H[@]}" -d "{\"pos_id\":\"0001\",\"restaurant_id\":\"689\",\"order_id\":\"CR123-T2-$TS\",\"cust_mobile\":\"$PH\",\"order_amount\":258.83,\"order_sub_total_amount\":290,\"coupon_discount\":43.5,\"gst_tax\":12.33,\"tax_amount\":12.33,\"items\":[{\"item_name\":\"Kunafa\",\"qty\":1,\"price\":290}]}" \
 | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('T2 base_pts=',d['points_earned']-d['off_peak_bonus'],'(expect 12)')"

# T3 — fallback, no sub_total, coupon present: amount 99 → int(99×5%)=4 but min_order 200 → 0 (identical to today)
curl -s -X POST "$API_URL/api/pos/orders" "${H[@]}" -d "{\"pos_id\":\"0001\",\"restaurant_id\":\"689\",\"order_id\":\"CR123-T3-$TS\",\"cust_mobile\":\"$PH\",\"order_amount\":99,\"coupon_discount\":10,\"items\":[{\"item_name\":\"Tea\",\"qty\":1,\"price\":100}]}" \
 | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('T3 pts=',d['points_earned'],'(expect 0: below min_order 200, no double deduction crash)')"

# T4 — redemption still deducted: customer now has ≥100 pts from T1; redeem 100 (₹100) on sub_total 440 → base 340 → 17 (+off_peak)
curl -s -X POST "$API_URL/api/pos/orders" "${H[@]}" -d "{\"pos_id\":\"0001\",\"restaurant_id\":\"689\",\"order_id\":\"CR123-T4-$TS\",\"cust_mobile\":\"$PH\",\"order_amount\":340,\"order_sub_total_amount\":440,\"loyalty_points_used\":100,\"loyalty_discount\":100,\"items\":[{\"item_name\":\"Kunafa\",\"qty\":1,\"price\":440}]}" \
 | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('T4 base_pts=',d['points_earned']-d['off_peak_bonus'],'(expect 17) redeemed=',d.get('loyalty_points_redeemed') or d.get('crm_loyalty_points_redeemed'))"

# T5 — points_transactions description for T2 shows net base
cd /app/backend && python3 -c "
import os;from dotenv import load_dotenv;load_dotenv('.env');from pymongo import MongoClient
db=MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
o=db.orders.find_one({'pos_order_id':'CR123-T2-$TS'});t=db.points_transactions.find_one({'order_id':o['id'],'transaction_type':'earn'})
print('T5 desc=',t['description'],'(expect Rs.246.50 net)')"

# T6 — scan preview parity: token → {bill_amount 290, coupon_discount 43.5} → 12 ; {bill_amount 1040, points_to_redeem 50} → 5%×990=49 ; clamp 9999
TOKEN=$(curl -s -X POST "$API_URL/api/scan/auth/skip-otp" -H "Content-Type: application/json" -d "{\"phone\":\"$PH\",\"restaurant_id\":\"689\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
for B in '{"bill_amount":290,"coupon_discount":43.5}' '{"bill_amount":1040}' '{"bill_amount":1040,"points_to_redeem":50}' '{"bill_amount":1040,"points_to_redeem":9999}'; do
 curl -s -X POST "$API_URL/api/scan/max-redeemable" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$B" \
 | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('T6',$(printf %q "$B"),'→ projected=',d['projected_points_earned'],'base=',d['earn_base_preview'],'applied=',d['points_to_redeem_applied'],'cap=',d['max_points_redeemable'])"
done
# expectations: 12(+off_peak) · 52(+off_peak) base 1040 applied 0 · 49(+off_peak) base 990 applied 50 · applied == cap, base = 1040 − cap
```

**Regression suites (sequential, not parallel — rate-limit NOTEs):**
```bash
cd /app/backend && python -m pytest tests/test_iter6_phase_a.py tests/test_iter6_phase_b.py tests/test_cr085a_normalization.py tests/test_cr082_requires_customer.py tests/test_cr094_loyalty_rules.py tests/test_cr106_cr109_phaseD.py -q
```

**Cleanup after QA:** delete `orders` / `order_items` / `points_transactions` / `loyalty_redemptions` where `pos_order_id ~ ^CR123-` (r689 only, AND `user_id = pos_0001_restaurant_689`) and reset Alok Test `total_points` to its pre-test value (record it before T1).

---

## 5. Verification matrix (QA handover)

| V | Case | Expected | Covered by |
|---|---|---|---|
| V1 | `sub_total 1040 · amount 1092 · no discount · no redeem` | base points **52** (today 54) | T1 |
| V1b | `sub_total 290 · coupon 43.5 · gst 12.33` (order 1233135 shape) | **12** (today 10; naive sub-total 14) | T2 |
| V2 | redemption still deducted (`sub_total 440`, redeem 100 @ ₹1) | **17** (base 340) — G2 preserved | T4 |
| V3 | fallback: no `sub_total`, `coupon_discount 10`, `amount 99` | identical to today (`0` under min_order 200; no error) | T3 |
| V4 | `sub_total` under `min_order_value` while `order_amount` above | `0` — gate on net base | manual (set sub_total 190 / amount 210) |
| V5 | guest order / `loyalty_enabled=false` | `0`, unchanged | `test_iter6_phase_a` Q2/Q5 |
| V6 | coupon > sub-total (`300 − 197`) | base 103 → `0` under r689 min 200; `5` on a 0-min tenant | manual optional |
| V7 | `points_transactions.description` | `… (Rs.246.50 net)` | T5 |
| V8 | `/scan/max-redeemable {bill_amount 1040}` | `52`, `earn_base_preview 1040`, `points_to_redeem_applied 0` — today's keys + 2 | T6-2 |
| V9 | `{bill_amount 1040, points_to_redeem 50}` | `49`, base `990` | T6-3 |
| V10 | `{bill_amount 290, coupon_discount 43.5}` | `12` — equals T2 stored value | T6-1 |
| V11 | `points_to_redeem 9999` | `points_to_redeem_applied == max_points_redeemable` | T6-4 |
| V12 | Regression suites | PASS (429-timing NOTEs on phone `9838777712` tolerated) | pytest |
| V13 | Code markers `# CR-123` at pos.py E1/E2(A,B,C) and scan.py E3 | present | grep |

Off-peak: r689 has `off_peak_bonus_enabled true` — every expected value above is **base points**; assert `points_earned − off_peak_bonus`.

---

## 6. QA handover criteria
- [ ] T1–T6 PASS with base-point values as in §5
- [ ] V3 proves fallback path unchanged (no double deduction, no exception)
- [ ] V8 proves `/scan/max-redeemable` backward compatible (same keys + 2 additive)
- [ ] Regression suites PASS
- [ ] `grep -n "CR-123" routers/pos.py routers/scan.py` → 5+ hits
- [ ] Test data cleaned (CR123-* orders, Alok Test points restored)
- [ ] Downstream briefs drafted (owner sends): **POS** — display `points_earned` from CRM response, `bill_amount` on `/pos/max-redeemable` = pre-tax; what is `self_discount`? · **S&O** — `bill_amount` = pre-tax pre-discount sub-total; new optional `points_to_redeem` / `coupon_discount`; read `earn_base_preview`

---

## 7. Rollback
Revert E1–E3 (3 hunks, 2 files). No DB change, no schema, no index, no migration. Points already written post-deploy stay as written (forward-only policy applies in both directions).

---

## 8. Files changed / not changed
**WILL change:** `routers/pos.py` — E1 (1444–1449), E2-A (880–882), E2-B (1057), E2-C (1542–1546) · `routers/scan.py` — E3 (576–608)
**WILL NOT change:** `core/loyalty.py` · `core/coupon.py` · `core/whatsapp.py` · `routers/pos.py` 471–565 (`/pos/max-redeemable`) · `routers/pos.py` 1788–2080 (`payment-received`) · `models/schemas.py` · frontend · MongoDB · `.env`

---

```
Planning complete: CR-123
Stage: Impact Analysis (done) + Implementation Plan
Code reality: FULL (pos.py:870–882, 1056–1059, 1440–1452, 1542–1546 · scan.py:576–608 · r689 settings probed: off-peak ON, min_order 200, ratio 1.0)
Risk: LOW
Edits: E1 earn-base branch · E2 desc kwarg (A sig / B desc / C call) · E3 preview params + 2 response keys — ≈24 lines, 2 files
Files WILL change: routers/pos.py · routers/scan.py
Files WILL NOT touch: core/loyalty.py · core/coupon.py · /pos/max-redeemable · payment-received · schemas · frontend · DB
Owner decisions: ALL APPLIED (Q1–Q4 ruled; D1–D4 on IA defaults — owner silent)
Self-test: T1–T6 curl (preprod r689, CR123-* orders, cleanup step included) + 6 pytest suites
Docs: planning/CR_123_IMPLEMENTATION_PLAN.md
Next: "choose implementation role for CR-123" when owner approves
```
