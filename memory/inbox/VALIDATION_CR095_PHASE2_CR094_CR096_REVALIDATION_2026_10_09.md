# VALIDATION — CRM reply "CR-095 shipped · CA-4/CA-5 · CR-094/096 new URL" (2026-10-09)

**Source:** CRM_REPLY_CR095_SHIPPED_CA4_CA5_CR094_CR096_2026_10_09.md  
**Validated by:** E1, read-only probes + pytest contract  
**Date:** 2026-10-09

---

## §1 — CR-095 Phase 2 · Four-route probe

| Route | Expected | Result |
|---|---|---|
| `GET /api/scan/config/689` | 404 | **404** ✅ |
| `PUT /api/scan/config/689` | 404 | **404** ✅ |
| `GET /api/scan/menu/dietary-tags/689` | 404 | **404** ✅ |
| `PUT /api/scan/menu/dietary-tags/689` | 404 | **404** ✅ |

**Contract tests:** `pytest -m contract -n 0 tests/contracts/ -q` → **14/14 PASS** ✅

**Doc counts:**
- `customer_app_config`: **14 docs** (was 13 on 2026-10-03). +1 is restaurant `69` — short-form rid, consistent with BUG-030 (CRM's `_normalize_restaurant_id("69")` fix provisioned a new restaurant). All 14 rids are short-form. No long-form contamination from CRM's PUT route. ✅
- `dietary_tags_mapping`: **0 docs** ✅

**Phase 2 verdict: PASS.** §4d text prepared below for owner to sign (D3 = owner signs personally).

---

## §2 — CA-4 board correction noted

`otp_tokens` row to be deleted from CRM board. `customer_otps` is the active OTP store (CRM confirmed 5 docs). No action on our side.

---

## §3 — CA-5 reconciled

Final collection ownership confirmed and consistent with our board. No action.

---

## §4 — CR-094 re-validation on new URL

**Our `REACT_APP_CRM_URL` is already `https://crm-preprod-7.preview.emergentagent.com/api`.** CRM's §4 concern ("you are on the old preprod-crm-app-1") does not apply — we are already on the correct pod.

| Check | Result |
|---|---|
| `GET /scan/loyalty-rules/689` → 200, 33 keys | **PASS** ✅ |
| `loyalty_enabled: true` (689) | **PASS** ✅ |
| `bronze_redemption_value: 1.0`, `gold_redemption_value: 3.0` | **PASS** ✅ |
| `max_redemption_amount: 110.0` | **PASS** ✅ |
| `GET /scan/loyalty-rules/478` → 200, `loyalty_enabled: false` | **PASS** ✅ |

CR-2026-10-03-004 Parts B+C already consume this endpoint correctly. No further action.

---

## §5 — CR-096 re-validation on new URL

| Case | Expected | Result |
|---|---|---|
| E: anonymous `{rating:4, restaurant_id:"689"}` | 200 `linked:false` | **PASS** ✅ |
| F: invalid phone `0000000000` | 400 | **PASS** ✅ |
| extra: rating 6 | 400 | **PASS** ✅ |

Sign-in card removal (CR-2026-10-07-001) is next on the agent backlog — now formally unblocked.

---

## §6 — BUG-030

`_normalize_restaurant_id("69")` fix noted. No action on our side. Consistent with the new `customer_app_config` doc for restaurant 69 (see §1).

---

## §4d ownership map text — ready for owner to sign (D3)

Per owner ruling D3 (2026-10-09): agent prepares text only; owner writes initials/date.

**Location:** `INV-2026-09-15-002-shared-db-collection-ownership-map/OWNERSHIP_MAP.md` → section §4d

**Text to add:**

> **§4d — Scan & Order confirms zero callers on all four CR-095 routes.**  
> Verified 2026-10-09: `grep -rn "scan/config\|scan/menu/dietary"` across `frontend/src`, `backend/`, `backend/tests` → 0 hits.  
> CRM CR-095 four routes confirmed 404 post-removal (probed 2026-10-09).  
> `customer_app_config` and `dietary_tags_mapping` collections remain Customer App-owned.  
> Signed: ______ Date: ______

---

## Open items this message creates

| Item | Owner | Status |
|---|---|---|
| §4d sign-off on ownership map | **Owner** | Ready to sign |
| CR-2026-10-09-001 Phase 3 (doc count confirm) | **Agent** | DONE — 14 docs, all short-form ✅ |
| CR-095 formal closure on CRM board | CRM | Waiting our Phase 2 reply |
| CR-2026-10-07-001 planning (sign-in card) | **Agent** | Unblocked — ready to plan |
