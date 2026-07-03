# CR-004 — Phase 2.5-B · Coupon-Aware Dynamic Variable Mapping — Implementation Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2.5-B — Coupon-Aware Dynamic Variable Mapping (Model Redesign)
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr004_phase_2_5b_implemented`
**Planning doc:** `../planning/CR_004_PHASE_2_5_B_COUPON_AWARE_DYNAMIC_VARIABLE_MAPPING_PLANNING.md`

---

## 1. Summary

P2.5-B implements the coupon-aware variable mapping model redesign per the planning doc (§13 execution order, all 8 steps). Restaurant owners can now **pick a specific coupon** from their catalog when mapping coupon template variables, see real coupon data in the WhatsApp preview, and save `coupon_pick` mode mappings that resolve at send time.

---

## 2. Files Changed

| File | Action | Changes |
|---|---|---|
| `backend/core/whatsapp_variables.py` | Edit | Added `"picker": "coupon"` field to all 4 coupon-category variables; added `COUPON_VARIABLE_KEYS` export set |
| `backend/core/whatsapp.py` | Edit | Added `_check_event_data_for_coupon_field`, `_format_coupon_field` helpers; extended `build_body_values` with `coupon_pick` mode + `coupon_pick_data` param; added pre-resolve block in `trigger_whatsapp_event` for async coupon DB lookup |
| `backend/routers/coupons.py` | Edit | Added `GET /coupons/summary` endpoint with `_build_discount_display` + `_format_end_date_display` helpers (placed above `/{coupon_id}` to avoid route collision) |
| `backend/routers/whatsapp.py` | Edit | Added `coupon_pick` validation in `PUT /template-variable-map`: format check, field whitelist, colon guard, coupon existence + ownership check; skip `coupon_pick` in fills_on warnings |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | Edit | Added coupon picker state, `fetchCouponSummary`, `handleCouponSelect`, `getCouponPickPreviewValue`, `parseCouponPickMapping` functions; rewrote Variable Mapping Modal controls with 3-mode support (Map to Field / Pick Coupon / Custom Text); loading/error/empty states; auto-fill sibling coupon variables; locked read-only cards for picked values; search filter; Lock icon import |
| `frontend/src/pages/TemplatesPage.jsx` | Edit | Added same coupon picker logic: state, helpers, `handleCouponSelect`, `fetchCouponSummary`, `parseCouponPickMapping`, `getCouponPickPreviewValue`; rewrote Variable Mapping Modal with 3-mode support; auto-fill siblings; Lock icon import |

---

## 3. Backend

### Item 1: `GET /api/coupons/summary`
- Returns lightweight coupon list (8 fields per coupon) for the picker
- `discount_display` computed per offer_type (simple %, flat, bogo, bxg, nth_item, etc.)
- `end_date_display` formatted as "31 Dec 2026"
- Scoped to `user_id`; sorted by `created_at` desc; max 200 coupons
- Route placed BEFORE `/{coupon_id}` to avoid FastAPI path collision

### Item 2: `coupon_pick` validation in `PUT /template-variable-map`
- Validates `coupon:<id>:<field>` format (exactly 3 colon-separated parts)
- Rejects coupon_id containing `:` characters
- Field whitelist: `code|title|discount|expiry`
- Verifies coupon exists and belongs to the user (404 if not)

### Item 3: `build_body_values` resolver + pre-resolve
- New `coupon_pick_data` parameter on `build_body_values`
- D-4: Event data takes priority over picked coupon for event triggers
- Pre-resolve in `trigger_whatsapp_event`: scans mappings for `coupon:*` entries, does ONE async DB lookup, passes result to sync `build_body_values`

### Item 4: `GET /whatsapp/variables` — `picker` field
- All 4 coupon variables (`coupon_code`, `coupon_title`, `coupon_discount`, `coupon_expiry`) now include `"picker": "coupon"`
- Frontend uses this to determine which variables show the coupon picker toggle

---

## 4. Frontend

### Coupon Picker UI (Item 5+6)
- **Mode toggle per variable:**
  - Coupon-category variables: `[Pick Coupon]` `[Custom Text]` (D-2)
  - All other variables: `[Map to Field]` `[Custom Text]` (unchanged)
- **Pick Coupon mode flow:**
  1. Shows searchable coupon card list (code, title, discount badge, expiry, active/inactive badge)
  2. Owner clicks a coupon → all coupon-category variables in template auto-fill (D-3)
  3. Auto-filled variables show as locked read-only cards with Lock icon and "from SAVE20" label
- **States:** Loading skeleton, error alert with retry, empty placeholder with guidance, search with no-results message
- **Auto-link:** Selecting coupon on any coupon variable updates all sibling coupon variables
- **Auto-detect:** Selecting a coupon-category field from the Map dropdown auto-switches to Pick Coupon mode
- **Preview:** WhatsApp bubble preview resolves `coupon_pick` mappings with real coupon data

---

## 5. Validation

| Check | Result |
|---|---|
| Backend lint (4 files) | 0 issues |
| Frontend compile | Compiled with 1 pre-existing warning |
| `GET /coupons/summary` | 200, 25 coupons with correct `discount_display` |
| `GET /whatsapp/variables` | 4 coupon vars include `picker: "coupon"` |
| WhatsApp Automation page loads | Verified via screenshot |
| No new dependencies | None added |
| No DB schema migration | No migration needed |

---

## 6. Status

```
cr004_phase_2_5b_implemented
```

End of CR-004 Phase 2.5-B implementation.
