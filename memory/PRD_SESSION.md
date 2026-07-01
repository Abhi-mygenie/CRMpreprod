# MyGenie CRM — PRD Session (2026-06-06 — 5-june branch session 4)

## Original Problem Statement
*"pull code from CRMpreprod 5-june branch, use remote MongoDB, build as is, then resume CR-023."*

## Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React 19 (CRA/craco) + Tailwind + Radix UI on port 3000
- **Database**: Remote MongoDB at 52.66.232.149:27017/mygenie
- **Branch**: `5-june`
- **Preview URL**: https://react-python-crm-2.preview.emergentagent.com
- **Preview URL**: https://crm-preprod-4.preview.emergentagent.com

## Session Summary

### CR-020: Template Variable Picker — Grouped UX + Menu Variable Family
**Status**: 🟢 IMPLEMENTED + VERIFIED

**Discovery** (carried from prior session): Flat 37-var dropdown → grouped popover with 7 blocks + Menu variable family.

**Q1–Q9 Answers** (locked this session):
- Q1: Static menu binding from POS API ("send today's menu")
- Q3: POS menu sync (existing `GET /api/menu/items` + `/categories`)
- Q6: Menu block last (Order/Bill → Loyalty → Customer → Coupon → Brand → Feedback → Menu)
- Q8: Reusable component (`<VariablePicker />`)

**Implementation**:
- Backend (4 files): `block` field on 40 vars, 3 menu vars, `menu_pick` mode, menu sample data
- Frontend (3 files): VariablePicker.jsx, MenuPickModal.jsx, TemplatesPage.jsx rewired
- Validated: V1–V10 curl pass, screenshots verified
- Post-fixes: alphabetical sort within blocks, wider modal

**Key decisions**:
- `menu_pick_resolved` stored alongside mappings (no async POS API call at send time)
- `wallet_balance` → Customer block, `amount` → Order/Bill block, `einvoice_link` → Order/Bill block
- Live API validation mandatory per owner requirement

## What's Still Open
- CR-019: ⏸ plan drafted, awaiting Q1-Q3
- CR-014: ⏸ discovery parked, 2 questions pending
- CR-016: ⏸ deferred next sprint

---

## CR-021 (2026-06-06) — Coupon engine: distribute-first + POS-zero universal recording + Unlimited defaults
**Status**: 🟢 CLOSED

**Defects fixed**:
1. BOGO/BXG/Nth discount landed on cheapest single SKU when cart had multiple distinct eligible lines → distribute-first round-robin selector
2. Usage-limit silently bypassed when POS sent `coupon_discount=0` → universal CRM safety net for ALL coupon classes
3. `per_user_limit=1` forced default → flipped to Unlimited (null); runtime `or 1` coercions removed

**Files changed**:
- `backend/core/coupon.py` (selector rewrite + recorder POS-zero branch + per-user runtime fix)
- `backend/routers/pos.py` (gate relaxed, dead elif removed)
- `backend/routers/coupons.py` (per-user runtime fix)
- `backend/models/schemas.py` (Pydantic defaults)
- `frontend/src/pages/CouponsPage.jsx` (form defaults + placeholder)
- `backend/tests/qa_cr021_distribute_and_pos_zero.py` (new — 366 LoC, 52 assertions)

**QA**: 142/142 PASS (49 V3-B + 41 V3-C + 52 new CR-021). Zero legacy assertion edits needed.

**Ops note**: V1 simple coupons may now create more `discount_mismatch=True` rows. Reconcile via CR-003 dashboard weekly.

**Decisions log entries**: 4 (D1 distribute, D2/D3 universal POS-zero, D4 Unlimited default, D-runtime-fix lesson).

---

## CR-022 (2026-06-06) — Coupon POS-side bug fixes: alias, display_title, same_item_required
**Status**: 🟢 CLOSED

**Defects fixed** (4 owner-reported issues):
1. NTH/BOGO items not matched in POS validate — POS sends `item_id` but `POSCartItem.food_id` alias didn't accept it → food_id=None → `eligible_food_ids` matching failed. Fixed alias.
2. `category_id: None` hardcoded in order webhook cart_dicts — fixed to use `oi.item_category`.
3. `display_title` missing from POS coupon APIs — added `build_display_title()` helper generating "Buy 1 Get 2 Free", "Every 3rd Rs.100 off" etc.
4. `same_item_required` form edit hydration defaulted to `true` via `!== false` — BOGO coupons with different-item intent loaded as same-item. Fixed to use `=== true || offer_type === "bogo"`.

**Files changed**:
- `backend/models/schemas.py` (POSCartItem alias expansion)
- `backend/routers/pos.py` (cart_dicts category_id fix + display_title in validate response + import)
- `backend/core/coupon.py` (new `build_display_title()` helper + display_title in available response)
- `frontend/src/pages/CouponsPage.jsx` (same_item_required edit hydration fix)

**QA**: 142/142 PASS (all existing suites green, no new test file for this hotfix CR).

**Owner action required**: Re-save BOGO1 coupon with correct `get_discount_type` (flat instead of free) and `same_item_required` toggle (off if BXG intended).

**Decisions log entries**: 4 (D1 food_id alias, D2 category_id alias, D3 display_title, D4 same_item_required hydration).

---

## CR-023 (2026-06-06) — WhatsApp Template Builder: Production Readiness
**Status**: 🟡 Discovery Phase 0 complete — awaiting Q1-Q5 for mock design

**Problem**: "Submit to Meta" not working. Investigation found 14 gaps in the template creation flow.

**P0 Blockers** (likely causing submission failures):
1. Meta Graph API version v17.0 (2023) — needs v21.0
2. Language code `en` instead of `en_US` — Meta rejects incorrect locale
3. body_text example format — needs verification
4. Media header examples not sent — media templates rejected

**P1 Functional Gaps**: No button UI, no char limits, no name validation, no status tracking, no duplicate check

**Phase plan**: Phase 1 (make it work) → Phase 2 (buttons + status) → Phase 3 (polish)

**Next gate**: Q1-Q5 owner answers → HTML mock → owner approval → planning doc → implementation

**Discovery doc**: `discovery/CR_023_WHATSAPP_TEMPLATE_BUILDER_PRODUCTION_READINESS_DISCOVERY.md`

---

## CR-023 Phase 2 (2026-06-06) — Meta Template Validation V1-V10
**Status**: 🟢 IMPLEMENTED + VERIFIED

**Root cause found**: Template `order_bill_test` rejected by Meta with `INVALID_FORMAT` — body had `{1}` (single braces) instead of `{{1}}`. Zero frontend validations existed.

**Implementation**:
- Frontend `validateMetaCompliance()`: 10 checks (V1 single-brace, V2 sequential, V3 footer vars, V4 header vars, V5 URL button, V6 phone button, V7 QR text, V8 media URL, V9 underscore name, V10 example format)
- Real-time inline warnings for V1/V3/V4/V9 (shown as user types)
- Full error box on submit shows all errors at once
- Backend safety net: V1-V4 in `create_meta_template()` returns 400

**Files changed**:
- `frontend/src/pages/TemplateBuilderPage.jsx` (validation function + inline hints + error box)
- `backend/routers/whatsapp.py` (V1-V4 server-side validation in `create_meta_template()`)

**Verified**: 4/4 backend curl tests pass, 5 frontend screenshots confirmed

**Decisions**: S1=show all errors, S2=frontend+backend, S3=warn only (no auto-correct)

**Next**: Owner E2E test — create valid template with `{{1}}` syntax, submit to Meta

---

## CR-023 Phase 3 (2026-06-06) — Add Variable Button + Dynamic URL Button
**Status**: 🟢 IMPLEMENTED + VERIFIED

**Features**:
- (A) "Add Variable" button: Orange pill below body textarea. Click inserts `{{N}}` at cursor position, auto-increments (max+1). Header gets "Add {{1}}" mini-button, disabled after first use (Meta 1-var limit). Example inputs auto-appear.
- (B) Dynamic URL button: Static/Dynamic radio toggle on URL buttons. Dynamic mode: base URL input + `{{1}}` chip + sample URL input (clear labels: "BASE URL" / "SAMPLE URL (REQUIRED BY META)"). Backend sends `example` array to Meta for approval. V5 validation updated for dynamic URLs.

**Files changed**:
- `frontend/src/pages/TemplateBuilderPage.jsx` (useRef, insertBodyVariable, insertHeaderVariable, updateButton dynamic compose, Static/Dynamic UI, labels)
- `backend/routers/whatsapp.py` (dynamic URL `example` array in button component)

**Planning doc**: `planning/CR_023_PHASE3_ADD_VARIABLE_DYNAMIC_URL_PLAN.md`

**E2E test**: `invoice_bill_test_2` with View Bill dynamic URL button — correctly formatted Meta payload, reached Meta API. Meta rejected for body length (not code issue).

---

## einvoice_token Variable (2026-06-06)
**Status**: 🟢 Phase 1 IMPLEMENTED. Phase 2 deferred.

**Phase 1 (done)**: Added `einvoice_token` to `whatsapp_variables.py` (Order/Bill block, 41 vars total). Forwarded raw 32-char hex token in `pos.py` send_bill event_data. Zero risk — 3 lines, 2 files, purely additive.

**Phase 2 (deferred)**: AuthKey button URL parameter wiring. Discovery found AuthKey only has `bodyValues` + `headerValues` — no `buttonValues`. Hypothesis: button URL vars are just the next sequential number in `bodyValues`. Owner to verify.

**Use case**: `einvoice_link` = full URL for body text. `einvoice_token` = raw token for dynamic URL button suffix ("View Bill" → `https://domain/api/invoices/{{1}}`).

## What's Still Open
- CR-023: Owner E2E test (create template with View Bill button, longer body, submit to Meta)
- CR-023: AuthKey button param wiring (Phase 2 of einvoice_token — owner to verify bodyValues approach)
- CR-014: ⏸ Code complete, live test PARKED (POS + AuthKey webhook repoint needed)
- CR-016: ⏸ Deferred to next sprint
