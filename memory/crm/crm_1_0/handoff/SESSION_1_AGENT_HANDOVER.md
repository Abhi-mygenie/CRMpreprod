# CRM Preprod — Agent Handover Document

**Date:** 2026-05-25
**Session:** Session 1
**Branch:** `25-may` (Abhi-mygenie/CRMpreprod.git)
**Database:** External MongoDB at `52.66.232.149:27017/mygenie`
**Preview URL:** `https://ea81cd10-866e-4b3c-bc69-6b8644dd7ccc.preview.emergentagent.com`

---

## 1. What Was Done This Session

### Setup
- Cloned `25-may` branch, wiped `/app`, configured external MongoDB
- Created `backend/.env` (MONGO_URL, DB_NAME, JWT_SECRET) and `frontend/.env` (REACT_APP_BACKEND_URL)
- Installed all pip + yarn dependencies, both services running via supervisor

### Investigations (Read-Only)
| Investigation | Report Path | Key Finding |
|---|---|---|
| Loyalty Points Earning | `investigations/LOYALTY_POINTS_EARNING_ON_POS_ORDER_INVESTIGATION.md` | Realtime earning works for `loyalty_enabled=True` restaurants. Migration re-sync clobbers `order.points_earned` to 0. 3 restaurants have `loyalty_enabled=None` (silently disabled). |
| Coupon Admin UI Discovery | `discovery/CR_001C_C_COUPON_ADMIN_UI_WHAT_EXISTS_AND_GAP_REPORT.md` | Existing UI covers V1 base only (12/50+ fields). Verdict: reuse list, rebuild create/edit. |
| Menu API Mapping | `discovery/CR_001C_C_COUPON_MENU_API_MAPPING_REPORT.md` | Menu API `product.id` ≠ POS `item_id` (order-line ID, changes every order). Categories API works. |
| POS Contract Compliance | `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` | 7 violations, 3 blockers: `pos_food_id` missing, loyalty/coupon fields nested instead of top-level. |

### Backend Fixes Applied
| Fix | File | Change |
|---|---|---|
| Coupon create persists all fields | `routers/coupons.py` | Replaced 12-field explicit mapping with `coupon_data.model_dump()` |
| Migration re-sync preserves points | `routers/migration.py` | `order_doc.pop("points_earned")` before `$set` on existing order |
| Loyalty redemption on order doc | `routers/pos.py` | Added `loyalty_points_used`, `loyalty_discount`, `loyalty_idempotency_key` to order_doc |
| Menu proxy endpoints | `routers/menu.py` + `server.py` | `/api/menu/items` and `/api/menu/categories` proxy via stored `mygenie_token` |

### Frontend — Coupon Admin UI
| What | Status |
|---|---|
| V1+V2 Coupon UI (production) | Live at `/coupons` — drawer layout, type selector, live menu selectors, create/edit/delete/toggle |
| V3 Preview (non-functional) | Live at `/coupons-v3-preview` — V3-A Happy Hour, V3-B BOGO/BXGY, V3-C Every Nth forms |

### Owner Decisions Frozen
- File: `planning/CR_001C_C_COUPON_ADMIN_UI_OWNER_DECISIONS.md`
- Q1=B (reuse list, new form), Q2=B (V1+V2 first), Q3=D (hybrid), Q4=A (live menu API), Q5=B (advanced collapsible), Q6=B (preview later), Q7=A (coming soon placeholders), Q8=B (phased rollout)
- V3 preview approved for UX — pending owner approval to implement

---

## 2. Current File Structure (Modified/Created)

```
/app/backend/
  routers/coupons.py        — MODIFIED (model_dump fix)
  routers/migration.py      — MODIFIED (points_earned preserve)
  routers/pos.py             — MODIFIED (loyalty fields on order doc)
  routers/menu.py            — NEW (menu proxy endpoints)
  server.py                  — MODIFIED (added menu router)
  .env                       — CREATED

/app/frontend/
  src/pages/CouponsPage.jsx  — REWRITTEN (V1+V2 drawer UI)
  src/pages/CouponV3Preview.jsx — NEW (V3 preview, non-functional)
  src/App.js                 — MODIFIED (added V3 preview route)
  .env                       — CREATED

/app/memory/
  PRD.md                     — Updated
  crm/crm_1_0/
    investigations/LOYALTY_POINTS_EARNING_ON_POS_ORDER_INVESTIGATION.md
    discovery/CR_001C_C_COUPON_ADMIN_UI_WHAT_EXISTS_AND_GAP_REPORT.md
    discovery/CR_001C_C_COUPON_MENU_API_MAPPING_REPORT.md
    planning/CR_001C_C_COUPON_ADMIN_UI_OWNER_DECISIONS.md
    planning/CR_001C_C_COUPON_V3_UI_PLANNING_AND_PREVIEW_REPORT.md
    handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md
```

---

## 3. What Needs To Be Done Next (Priority Order)

### P0 — Blocked on External
| Task | Blocker | Impact |
|---|---|---|
| POS sends `pos_food_id` in items | POS team | Item/category coupons won't match at validation time |
| POS sends loyalty/coupon/wallet as top-level fields | POS team | Redemption, coupon commit, wallet deduction won't trigger |

### P1 — Ready to Implement (Owner Approved V3 Preview)
| Task | Effort | Details |
|---|---|---|
| **V3-A Happy Hour UI** — wire to production `/coupons` | Low | Enable `time_window` in COUPON_TYPES, add weekday/time/timezone form section, wire to backend create/update. Preview already at `/coupons-v3-preview`. |
| **V3-B BOGO/BXGY UI** — wire to production `/coupons` | Medium | Enable `bogo` in COUPON_TYPES, add BOGO/BXGY toggle, buy/get item pickers, benefit type, advanced settings. Most complex form. |
| **V3-C Every Nth UI** — wire to production `/coupons` | Medium | Enable `every_nth` in COUPON_TYPES, add nth rule, eligible/excluded pickers, benefit type. |

### P2 — Improvements
| Task | Effort | Notes |
|---|---|---|
| R478/R618/R634 loyalty toggle | Owner action | Owner will set `loyalty_enabled` from UI |
| Duplicate coupon feature | Low | One-click clone — parked for future |
| Coupon analytics view | Medium | Parked for future phase |

---

## 4. Key Technical Notes for Next Agent

### Authentication
- CRM uses MyGenie SSO login. No demo user exists.
- To take screenshots, inject JWT token via localStorage:
  ```js
  localStorage.setItem("token", "<JWT from create_token('pos_0001_restaurant_689')>")
  ```
- Generate token: `cd /app/backend && python3 -c "from core.auth import create_token; print(create_token('pos_0001_restaurant_689'))"`

### Menu API
- `/api/menu/items` and `/api/menu/categories` proxy through MyGenie API using stored `mygenie_token` on user doc
- The token for R689 was updated to a working one during this session. It may expire — re-login refreshes it.
- Menu API returns `product.id` which is the stable food ID. POS currently does NOT send this (sends order-line IDs instead). This is a POS contract violation, not a CRM bug.

### Coupon Backend
- `POST /api/coupons` now persists ALL fields via `model_dump()` (Phase 0 fix)
- `PUT /api/coupons/{id}` already used `model_dump()` — works for all fields
- `POST /api/coupons/{id}/toggle` — toggles `is_active`
- Backend coupon engine (`core/coupon.py`) is complete for V1-V3C (211/211 QA passed)
- POS validation: `POST /api/pos/coupons/validate` (JSON body, V2+ aware)

### CouponsPage.jsx Structure
- Uses `Sheet` (right-side drawer) from shadcn/ui
- `COUPON_TYPES` array controls which types are shown — set `enabled: true` to unlock V3
- `EMPTY_FORM` state object — add V3 fields here
- `handleSubmit` builds payload — add V3 field mapping here
- `ItemSelector` and `CategorySelector` components are inline and reusable
- Form sections are conditional on `form.discount_scope` and `selectedType`

### V3 Preview Page
- `/coupons-v3-preview` → `CouponV3Preview.jsx`
- Uses mock data, non-functional, clearly marked as preview
- Can be deleted after V3 is wired into production `/coupons`
- Remove route from `App.js` when cleaning up

### Database Notes
- External MongoDB — shared with production CRM instances
- Do NOT create test data without owner approval
- `loyalty_settings` collection has `loyalty_enabled: null` for R478, R618, R634 — these silently disable earning
- `mygenie_token` on user docs may expire — refreshed on each MyGenie SSO login

### Supervisor
- Backend: `sudo supervisorctl restart backend`
- Frontend: `sudo supervisorctl restart frontend`
- Hot reload is active — restart only needed for .env changes or dependency installs
- Logs: `tail -n 50 /var/log/supervisor/backend.err.log` / `frontend.err.log`

---

## 5. Documents Index

All docs under `/app/memory/crm/crm_1_0/`:

| Path | Purpose |
|---|---|
| `planning/CR_001_INDEX.md` | Master index of all CRM 1.0 work items |
| `planning/CR_001C_C_COUPON_ADMIN_UI_OWNER_DECISIONS.md` | Frozen owner decisions for coupon UI |
| `planning/CR_001C_C_COUPON_V3_UI_PLANNING_AND_PREVIEW_REPORT.md` | V3 UI field maps + preview report |
| `discovery/CR_001C_C_COUPON_ADMIN_UI_WHAT_EXISTS_AND_GAP_REPORT.md` | What exists / what's missing in coupon UI |
| `discovery/CR_001C_C_COUPON_MENU_API_MAPPING_REPORT.md` | Menu API → coupon field mapping + ID mismatch |
| `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` | 7 POS contract violations for POS team |
| `handoff/CR_001C_C_COUPON_POS_API_HANDOFF_SUMMARY.md` | POS-facing coupon API docs |
| `investigations/LOYALTY_POINTS_EARNING_ON_POS_ORDER_INVESTIGATION.md` | Loyalty earning investigation |
| `implementation/CR_001C_C_COUPON_V1_IMPLEMENTATION_REPORT.md` | V1 backend implementation |
| `implementation/CR_001C_C_COUPON_V2_ITEM_CATEGORY_IMPLEMENTATION_REPORT.md` | V2 backend implementation |
| `implementation/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_REPORT.md` | V3-A backend implementation |
| `implementation/CR_001C_C_COUPON_V3B_BOGO_BXGY_IMPLEMENTATION_REPORT.md` | V3-B backend implementation |
| `implementation/CR_001C_C_COUPON_V3C_EVERY_NTH_IMPLEMENTATION_REPORT.md` | V3-C backend implementation |

---

## 6. Test Credentials

| Purpose | Value |
|---|---|
| Restaurant for testing | R689 (Kunafa Mahal) — `pos_0001_restaurant_689` |
| JWT generation | `python3 -c "from core.auth import create_token; print(create_token('pos_0001_restaurant_689'))"` |
| Menu API (MyGenie token) | Stored on user doc — may expire, re-login refreshes |
| Test coupons created | `FLAT100TEST` (V1 order flat), `KUNAFA20` (V2 item) |
