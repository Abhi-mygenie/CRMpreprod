# Session Handover — 2026-08-06 (CR-079 / CR-080 / CR-081 / CR-082 Intake)

**Date**: 2026-08-06
**Role this session**: Intake Agent
**Source investigation**: INV-015 (POS loyalty, coupon, customer edit gaps)
**Branch**: main (Abhi-mygenie/CRMpreprod)
**DB**: Remote MongoDB 52.66.232.149:27017/mygenie

---

## What happened this session

1. **INV-015** investigated — confirmed 3 topics: customer edit endpoint exists (contract gaps only), loyalty/wallet all CRM-JWT blocked, coupon management all CRM-JWT blocked + 1 net-new (distribute).
2. **CR-079, CR-080, CR-081** registered — owner answered all Q1–Q3 per CR.
3. **CR-082** registered and revised — owner clarified "tick to choose generic vs customer-required" → design changed to per-coupon `requires_customer: bool` flag with CRM UI checkbox.
4. **Intake session closed** — no blockers, no open questions. Owner approved CR-082 HIGH risk by closing session.

---

## All 4 CRs — Planning gate OPEN

### CR-079 — POS Customer Edit — P2, LOW, ~45 min

**Problem**: `PUT /api/pos/customers/{id}` exists but: (1) `pos_id`/`restaurant_id` mandatory in body, (2) response only 4 fields, (3) no contract doc.

**Locked decisions:**
- Q1=a: `phone` stays required
- Q2=a: Full customer object in PUT response

**Files WILL change**: `routers/pos.py` (2 edits) + contract doc

---

### CR-080 — POS Loyalty & Wallet — P1, MEDIUM, ~2.5 hrs

**Problem**: All loyalty/wallet management (settings read, award points, wallet top-up, history) is CRM-JWT only. POS UI cannot do any of it.

**Locked decisions:**
- Q1=a: New file `routers/pos_loyalty.py`
- Q2=b: Bonus points capped at 1,000 per award
- Q3=a: `payment_method` required for wallet credit

**5 new endpoints** (all `verify_pos_auth`):
- `GET /pos/loyalty/settings` (read-only)
- `GET /pos/customers/{id}/points-history`
- `POST /pos/customers/{id}/points/award` (bonus, capped 1000)
- `GET /pos/customers/{id}/wallet-history`
- `POST /pos/customers/{id}/wallet/credit` (requires payment_method)

---

### CR-081 — POS Coupon Management — P2, MEDIUM, ~3 hrs

**Problem**: All coupon CRUD is CRM-JWT only. POS cannot list, create, edit, toggle, delete coupons. Distribute to customer does not exist anywhere.

**Locked decisions:**
- Q1=a: New file `routers/pos_coupons.py`
- Q2=a no-WA: C-8 distribute = record only (WhatsApp Phase 2)
- Q3=yes: DELETE from POS allowed (with in-use guard)

**8 new endpoints** (all `verify_pos_auth`):
- `GET /pos/coupons` (list all)
- `GET /pos/coupons/{id}` (single)
- `POST /pos/coupons` (create)
- `PUT /pos/coupons/{id}` (edit)
- `POST /pos/coupons/{id}/toggle` (activate/deactivate)
- `DELETE /pos/coupons/{id}` (with in-use guard)
- `GET /pos/coupons/{id}/usage` (usage history)
- `POST /pos/coupons/{id}/distribute` (record only, no WhatsApp Phase 1)

---

### CR-082 — Per-Coupon "Requires Customer" Flag — P1, HIGH, ~2.5 hrs

**Problem**: Coupons cannot be applied to walk-in orders with no CRM customer captured. Owner wants a per-coupon toggle.

**Design**: New `requires_customer: bool = True` field on every coupon.
- `true` (default) = current behaviour, customer must be selected
- `false` = generic / walk-in — no customer required
- Checkbox "Require customer to apply" on CRM coupon create/edit form (checked by default)

**Locked decisions (all 8):**
- Mechanism: per-coupon flag (not global)
- Default `true` → all existing coupons backward compatible
- `false` → skip per_user_limit, enforce global caps, record usage with `customer_id=null`
- POS available-coupons without customer → returns only `requires_customer=false`
- WhatsApp silently skipped for anonymous

**Files WILL change**: `core/coupon.py` **(CRITICAL)**, `models/schemas.py`, `routers/pos.py`, `CouponsPage.jsx`

**⚠️ HIGH risk** — Planning agent MUST read full `core/coupon.py` before writing plan. Full regression of all existing coupon test suites required.

---

## Recommended implementation order

1. **CR-079** first (LOW, 45 min, warm-up, no hotspot files)
2. **CR-081** second (MEDIUM, new file, coupon CRUD reads)
3. **CR-080** third (MEDIUM, new file, financial writes)
4. **CR-082** last (HIGH, CRITICAL hotspot — needs full investigation of coupon.py first)

---

## Artifacts written this session

| Artifact | Path |
|---|---|
| Investigation | `investigations/INV_015_POS_LOYALTY_COUPON_CUSTOMER_EDIT.md` |
| CR-079 intake | `discovery/CR_079_POS_CUSTOMER_EDIT_INTAKE.md` |
| CR-080 intake | `discovery/CR_080_POS_LOYALTY_WALLET_INTAKE.md` |
| CR-081 intake | `discovery/CR_081_POS_COUPON_MANAGEMENT_INTAKE.md` |
| CR-082 intake | `discovery/CR_082_ANONYMOUS_COUPON_INTAKE.md` |
| This handover | `handoff/SESSION_2026_08_06_CR079_CR080_CR081_CR082_INTAKE_HANDOVER.md` |

---

## Test credentials

| Account | Password | Tenant |
|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Kunafa Mahal (689) — primary |
| owner@hungry.com | Qplazm@10 | Hungry Keya (634) |
| owner@jehsnest.com | Qplazm@10 | Jeh's Nest (635) |

---

## DO NOT
- Do NOT send live WhatsApp without owner approval
- Do NOT run destructive DB operations on live preprod data
- Do NOT flip `CAMPAIGN_SCHEDULER_ENABLED=true` without owner approval
- Do NOT start CR-082 implementation without reading full `core/coupon.py` first
- Do NOT re-introduce demo login (CR-015c)
