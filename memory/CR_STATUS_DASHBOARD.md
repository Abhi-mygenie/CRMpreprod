# CR Status Dashboard — `crm_roi_sprint`

> **Live flat status board.** Update on every phase transition.
> One row per CR. No narrative. For narrative, read the linked discovery / planning / impl / QA doc.
> Last updated: **2026-06-06 (Session 5)**

---

## 📌 Latest Session Snapshot

**Session date**: 2026-06-06 (SESSION 5 — CR-024 Phase 1 implemented + live tested; CR-014 Phase 3 Hotel Folio implemented + verified)
**Pod URL**: `https://crm-stack-1.preview.emergentagent.com`
**Branch**: `5-june`
**POS + AuthKey webhook**: Live test confirmed for CR-014 food invoices. POS contract for hotel folio fields shared with POS team.

### What happened this session (full chronology)

1. **Repo re-bootstrapped from `5-june` branch** — Cloned into /app. Backend/.env (remote Mongo) + frontend/.env (preview URL) configured. Deps installed. Services UP.
2. **Previous agent handover reviewed** — all memory docs read end-to-end.
3. **CR-024 Phase 1: Marketing Campaigns — S1 APPROVED + IMPLEMENTED**.
   - Backend: `routers/campaigns.py` — Campaign CRUD + execution engine (audience → opt-out filter → 1000/day rate limit → resolve vars → `send_bulk_messages()` → log with `campaign_run_id` → update stats). 7 API endpoints. 2 new DB collections (`campaigns` + `campaign_runs`) + indexes.
   - Frontend: 4 new pages (CampaignsPage, CampaignWizardPage, AudiencesPage, CampaignHistoryPage). Sidebar restructured: WhatsApp (Settings/Templates/Automation) + Marketing (Campaigns/Audiences/History). 3-step wizard with numbered circles, 2-column template picker, double confirm >500.
   - UI iterated to match approved HTML mock (`cr024_mock.html`): 5 stat cards, columnar Sent/Delivered/Read/Failed, 3-col audience grid, table-layout history with delivery % bars.
   - Seed data planted: 4 segments (Gold/Inactive/Birthday/VIP) + 4 campaigns + 3 campaign_runs.
   - **Live test**: Campaign "abhsihek" sent 1 WhatsApp to test customer via AuthKey — `Success` (LogID `06afbcb99d83...`). Status: PARKED for owner delivery verification.
   - React.Fragment import bug fixed.
   - Note: Scheduled/Recurring auto-firing is Phase 3 (not yet built). Current sends fire immediately on button click.
4. **CR-014 Phase 3: Hotel Folio (Mode C) — PLANNED + IMPLEMENTED**.
   - DB investigation: Palm House R541 (443 room orders via "Check In" item), sunildev R558 (1 order with `room_info` struct), Welcome Resort R474 (85 orders, no room data).
   - POS data contract written (`handoff/CR_014_POS_HOTEL_FOLIO_DATA_CONTRACT.md`) — asks POS team for 7 fields (P0: `room_number`, `check_in`, `check_out`; P1: `nights`, `room_type`, `rate_per_night`; P2: `guest_count`).
   - Two invoice patterns built (Option C):
     - **Pattern A ("HOTEL FOLIO")**: `room_info.room_price > 0` → room charges + F&B items. Template: `invoice_hotel_room.html`.
     - **Pattern B ("GUEST FOLIO")**: "Check In" item at Rs.0 → day-grouped F&B folio. Template: `invoice_hotel_folio.html`.
   - Mode detection in `invoice_generator.py` auto-routes to correct template.
   - Verified with real DB data: sunildev #000130 (hotel room, Rs.5,945) + Palm House #006644 (guest folio, 200 items, 60 days, Rs.46,424).
   - PDF generation works for both patterns.

### 🎯 Next-agent handoff message

```
You are picking up the MyGenie CRM ROI sprint.

READ FIRST: README.md → CR_STATUS_DASHBOARD.md (this snapshot)
             → DECISIONS_LOG.md → PRD.md

CURRENT STATE (2026-06-06 session 5 close):

- CR-024: Phase 1 IMPLEMENTED + live tested. PARKED for owner delivery verification.
          Marketing Campaigns: CRUD + execution engine + 4 frontend pages + sidebar restructure.
          Seed data: 4 segments + 4 campaigns + 3 runs.
          Phase 2-3 (Scheduled/Recurring) NOT built yet — all sends fire immediately.
          Files: CampaignsPage, CampaignWizardPage, AudiencesPage, CampaignHistoryPage, routers/campaigns.py, ResponsiveLayout, App.js

- CR-014: Phase 1+2+3 ALL IMPLEMENTED. Live test PASSED for food invoices.
          Phase 3 (Hotel Folio Mode C) implemented with 2 patterns:
            Pattern A: room_info struct → "HOTEL FOLIO" (room+food). Test: /api/invoices/67ddd6833bee4f33af2aaa941ee146c9
            Pattern B: Check In item → "GUEST FOLIO" (day-grouped F&B). Test: /api/invoices/9aa7bfc25e204b5d8e9a143fba0feea8
          POS contract shared for 7 new room_info fields.
          Files: invoice_generator.py, invoice_hotel_room.html, invoice_hotel_folio.html

- CR-023: Phase 1+2+3 implemented. Awaiting owner E2E test (Meta template submission).

TEST CREDENTIALS: owner@kunafamahal.com / Qplazm@10
                  owner@palmhouse.com / Qplazm@10 (Palm House — hotel folio test)

DO NOT:
- Re-introduce demo login (CR-015c)
- Run testing_agent_v3 — owner opted out for this sprint
- Send any live WhatsApp messages without explicit owner approval
```

### Active queue (this sprint)

| Order | CR | Status | Next action |
|---|---|---|---|
| 1 | **CR-024** | 🟡 Phase 1 implemented + live tested | PARKED for owner delivery verification. Phase 2-3 (Scheduled/Recurring) next. |
| 2 | **CR-014** | 🟡 Phase 1+2+3 all implemented | Food invoices live-tested. Hotel Folio (Mode C) implemented + verified. Awaiting POS team for room_info fields. |
| 3 | **CR-023** | 🟡 Phase 1+2+3 implemented | Owner E2E test (create template with View Bill button → Meta approval) → then AuthKey button param wiring |
| — | ~~CR-019~~ | ❌ CANCELLED | Owner: "not needed" |
| — | ~~CR-020~~ | 🟢 CLOSED (QA 18/18 pass) | — |
| — | ~~CR-021~~ | 🟢 CLOSED (142/142 QA pass) | — |
| — | ~~CR-022~~ | 🟢 CLOSED (142/142 QA pass) | — |
| — | ~~CR-015 / CR-015a/b/c / CR-017 / CR-018~~ | 🟢 CLOSED | — |
| — | ~~CR-016~~ | ⏸ Deferred next sprint | — |

---

## Status legend

| Light | Meaning |
|---|---|
| 🟢 | **Closed** — live-test passed, CR done |
| 🟡 | **In flight** — agent actively working in current session |
| 🔵 | **Planning approved** — implementation can start any time |
| ⏸ | **Parked** — discovery (or later phase) complete but waiting on owner answer |
| 🔴 | **Blocked** — waiting on external dependency or another CR |
| 📋 | **Registered only** — placeholder, no discovery yet |
| ❌ | **Cancelled / dropped** |

---

## CR Board

| # | CR | Phase | Status | Effort | Blockers / Owner asks | Last touched |
|---|---|---|---|---|---|---|
| 002 | Loyalty engine | Closed | 🟢 | — | — | 2026-05 |
| 002B | Birthday/Anniversary | Closed | 🟢 | — | — | 2026-05 |
| 003 | Coupon analytics dashboard | Closed Phase 1 | 🟢 | — | Phase 2 backlog | 2026-05 |
| **004** | **WhatsApp Utility + Marketing** | **Closed (P3.5)** | **🟢** | — | Optional Commit 8 hardening (IP allowlist) available, not blocking | **2026-05-28** |
| 005 | (per register) | — | (see register) | — | — | — |
| 006 | (per register) | — | (see register) | — | — | — |
| 007 | (per register) | — | (see register) | — | — | — |
| 008 | (per register) | — | (see register) | — | — | — |
| 009 | (per register) | — | (see register) | — | — | — |
| 010 | (per register) | — | (see register) | — | — | — |
| 011 | Coupon Optimizer | Discovery | ⏸ | — | (see register) | — |
| 012 | WhatsApp Template Builder | Planning | 🔵 | — | (see register) | — |
| 013 | Template Gallery | Discovery | 🔴 blocked by CR-012 P1 | — | (see register) | — |
| **014** | **E-Invoice PDF + Mobile HTML Link** | **Phase 1+2+3 ALL IMPLEMENTED — live test passed (food), hotel folio verified** | **🟡** | ~8-10 days | All 4 buckets from Phase 1+2 implemented + live-tested. **Phase 3 (Hotel Folio Mode C)**: 2 patterns — Pattern A "HOTEL FOLIO" (`room_info` struct, room charges + F&B) + Pattern B "GUEST FOLIO" ("Check In" item, day-grouped F&B folio). Auto-detection in `invoice_generator.py`. Templates: `invoice_hotel_room.html` + `invoice_hotel_folio.html`. Verified with real data: sunildev #000130 + Palm House #006644. POS contract shared (`handoff/CR_014_POS_HOTEL_FOLIO_DATA_CONTRACT.md`) for 7 new `room_info` fields. **Next**: POS team adds P0 fields (`room_number`, `check_in`, `check_out`). | **2026-06-06** |
| **015** | **WhatsApp Template Variable Mapping Fidelity** | **CLOSED — live test passed** | **🟢** | done | T1-T7 done. T2 skipped. {{6}} mismatch fixed. Full audit passed. Live test: orders 869331+869333, 7/7 slots correct, status=read. | **2026-05-29** |
| **017** | **/pos/max-redeemable Projected Points Earned** | **CLOSED — implemented + verified** | **🟢** | done | Hot fix. 3 additive fields: `projected_points_earned`, `projected_earn_percent`, `earn_ratio_display`. Curl-verified. POS handoff updated. | **2026-05-29** |
| **018** | **/pos/max-redeemable Projected Tier Upgrade** | **CLOSED — implemented + verified** | **🟢** | done | 3 additive fields: `projected_tier_after`, `tier_upgrade`, `tier_upgrade_message`. Curl-verified. POS handoff updated. | **2026-05-29** |
| **015a** | **Preview Sample Data Gap for T5 Variables** | **Implemented & verified** | **🟢** | done | Preview "NA" fixed: 14 T5 sample values in `customers.py` sample-data + frontend registry-`example` fallback. Closeout: `implementation/CR_015A_PREVIEW_SAMPLE_DATA_CLOSEOUT.md`. | **2026-05-29** |
| **015b** | **Dead Variable-Mapping Code Removal** | **Implemented & verified** | **🟢** | done | Removed orphaned/unreachable mapping modal cluster on WhatsApp Automation page + unused `availableFields`/`getPreviewMessage` on Segments. Mapping is **Templates-page-only**. Closeout: `implementation/CR_015B_DEAD_VARIABLE_MAPPING_CODE_CLOSEOUT.md`. | **2026-05-29** |
| **015c** | **Remove Demo Login** | **Implemented & verified** | **🟢** | done | Demo login fully removed (was 404). Backend endpoint/constants/`is_demo` + frontend button/banner/context. Tests → real login (11 pass). Closeout: `implementation/CR_015C_REMOVE_DEMO_LOGIN_CLOSEOUT.md`. | **2026-05-29** |
| **016** | **Dynamic Event Registry + Trigger Configuration UI** | **Discovery Phase 0 done — DEFERRED to next sprint** | **⏸ next-sprint** | ~9-10 days | **Deferred 2026-05-29 by owner**: existing event mapping/firing fidelity (CR-015) takes priority. §7 Q1–Q8 still open. | **2026-05-29** |
| **019** | **`send_bill` Event-Key Mismatch (UI vs Trigger Code)** | **CANCELLED — owner says not needed** | **❌** | — | Owner closed 2026-06-05: "not needed". | **2026-06-05** |
| **020** | **Template Variable Picker — Grouped UX + Menu Variable Family** | **CLOSED — QA 18/18 pass, all gates passed** | **🟢** | ~1.5 days | HTML mock approved → planning approved → implemented → QA report written. 40 variables with block field, 7 grouped blocks, Menu Pick mode, reusable VariablePicker component. All V1–V10 backend validations pass. Frontend compiled + screenshots verified. QA: `qa/CR_020_TEMPLATE_VARIABLE_PICKER_QA_REPORT.md`. | **2026-06-05** |
| **022** | **Coupon POS-side bug fixes: alias, display_title, same_item_required** | **CLOSED — 142/142 QA pass** | **🟢** | ~½ day | 4 owner-reported bugs fixed: (B1) POSCartItem.food_id alias didn't accept `item_id` → NTH/BOGO items not matched in validate; (B2) `category_id: None` hardcoded in order cart_dicts; (B3) `display_title` missing from POS coupon APIs — added `build_display_title()` helper; (B4) `same_item_required` form default/hydration forced true on all BOGO coupons. Files: `models/schemas.py`, `routers/pos.py`, `core/coupon.py`, `pages/CouponsPage.jsx`. | **2026-06-06** |
| **023** | **WhatsApp Template Builder — Production Readiness** | **Phase 1 + 2 + 3 IMPLEMENTED — awaiting owner E2E test** | **🟡** | ~2 days | **Phase 1**: Meta API v21, en_US locale, image header examples, status check, duplicate check, Meta error detail, full builder UI with WhatsApp preview. **Phase 2**: V1-V10 Meta compliance validations — `validateMetaCompliance()` frontend gate + real-time inline warnings + backend V1-V4 safety net. **Phase 3**: "Add Variable" button (body auto-increment at cursor + header {{1}} with disable), Dynamic URL button (Static/Dynamic toggle, base URL + {{1}} chip, sample URL, backend `example` array). `einvoice_token` variable added to registry (41 total). E2E submission tested: payload correctly formatted with dynamic URL button, reached Meta. Planning: `CR_023_PHASE2_*.md` + `CR_023_PHASE3_*.md`. **Next**: owner E2E with longer body + View Bill button → Meta approval. Then AuthKey button param wiring. | **2026-06-06** |
| **024** | **Segments & Marketing Campaigns — Production Readiness** | **Phase 1 IMPLEMENTED + live tested — PARKED for owner verification** | **🟡** | ~4-5 days (4 phases) | **Phase 1 implemented**: Backend `routers/campaigns.py` (CRUD + execution engine + history + daily limit). Frontend 4 new pages (CampaignsPage, CampaignWizardPage, AudiencesPage, CampaignHistoryPage) matching approved mock. Sidebar restructured (WhatsApp + Marketing groups). Seed data: 4 segments + 4 campaigns + 3 runs. **Live test**: 1 WhatsApp sent to abhishek jain via AuthKey (`Success`). React.Fragment bug fixed. **Phase 2-3 NOT built**: Scheduled/Recurring sends fire immediately. Planning: `CR_024_PHASE1_MARKETING_CAMPAIGNS_PLAN.md`. | **2026-06-06** |
| **025** | **Virtual Wallet Management** | **Discovery Phase 0 complete — PARKED awaiting Q1-Q10** | **⏸** | ~11-15 days (4 phases) | Canteen/student/mess/subscription wallet. Current state: placeholder UI, basic credit/debit backend, 0 tenants enabled. 12 gaps identified (G1-G12). 4 phases planned: P0 (dashboard + bulk recharge + ledger + rules), P1 (refund + reports), P2 (meal plans + expiry), P3 (self-recharge via payment gateway). Discovery: `CR_025_VIRTUAL_WALLET_MANAGEMENT_DISCOVERY.md`. **Next**: Owner answers Q1-Q10 → planning doc. | **2026-06-06** |
| **026** | **Campaign "View Messages" Deep-Link** | **Registered — P3 priority** | **📋** | ~½ day | Add "View Messages" button on each campaign card (CampaignsPage) that navigates to Message Status pre-filtered by `campaign_id`. Requires: (1) route param support on MessageStatusPage (e.g., `/messages?campaign_id=xxx`), (2) button on CampaignsPage campaign rows, (3) auto-apply filter on mount. Depends on BUG-005+BUG-006 being fixed (✅ done 2026-06-17). | **2026-06-17** |

> When a row's first column shows a number ≤ 010 with no detail above, look up the full row in `crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md`.

---

## Active queue (in priority order — recommended sequence)

Owner can re-order; this is a recommendation. **CR-016 deferred to next sprint as of 2026-05-29.**

| Order | CR | Why first |
|---|---|---|
| 1 | **CR-024** | Marketing Campaigns — Phase 1 done. Phase 2-3 (Scheduled/Recurring via APScheduler) next. |
| 2 | **CR-014** | E-Invoice — Phase 1+2+3 done. Awaiting POS team for hotel folio `room_info` fields (P0: room_number, check_in, check_out). |
| 3 | **CR-023** | WhatsApp Template Builder — Phase 1+2+3 done. Awaiting owner E2E test + AuthKey button param verification. |
| — | ~~CR-022~~ | **🟢 CLOSED** (2026-06-06) — POS coupon bug fixes. 142/142 QA pass. |
| — | ~~CR-021~~ | **🟢 CLOSED** (2026-06-06) — coupon engine distribute-first + POS-zero. 142/142 QA pass. |
| — | ~~CR-015~~ | **🟢 CLOSED** — live test passed (2026-05-29). |
| — | ~~CR-016~~ | **Deferred to next sprint** (2026-05-29). |

---

## Out-of-sprint backlog (not yet registered)

| Idea | Source | Notes |
|---|---|---|
| Force re-send admin action for stuck-Pending rows | Suggested in CR-004 P3.5 finish summary | Owner declined backfill but per-row manual nudges may be useful |
| OR / nested condition logic | CR-016 out-of-scope | Would become CR-016b |
| Custom webhook signals (tenant-defined) | CR-016 out-of-scope | Would become CR-016c |
| Per-customer event mute / unsubscribe | CR-016 out-of-scope | Privacy / DPDP compliance CR |
| Event analytics dashboard | CR-016 out-of-scope | Read-side analytics CR |
| Multi-channel events (SMS, email, push) | CR-016 out-of-scope | Separate channel CR per provider |
| Credit notes (mutability of invoices) | CR-014 out-of-scope | GST compliance for amendments |
| Email invoice channel | CR-014 out-of-scope | When email channel exists |
| AuthKey button URL param wiring | CR-023 Phase 2 of einvoice_token | Pending owner AuthKey curl/docs for button params. Likely `bodyValues` sequential. |
| Rich text formatting toolbar (Bold/Italic/Strike) | CR-023 reference screenshot | Non-blocking cosmetic enhancement |
| Template gallery / pre-built restaurant templates | CR-023 future | Reduce template creation friction |

---

## Recent transitions (newest first)

| Date | CR | From → To |
|---|---|---|
| 2026-06-17 | **BUG-005/006/007** | 🔴 OPEN → **✅ FIXED**. BUG-005: Campaign filter queried `db.segments` → fixed to `db.campaigns`. BUG-006: Campaign messages logged with `run_id` as `campaign_id` → fixed to use actual `campaign_id`, backward-compatible `$or` filter added. BUG-007: Template preview literal `\n` → normalized at data load time across 3 frontend files. |
| 2026-06-17 | **CR-026** | — → **📋 Registered (P3)**. Campaign "View Messages" deep-link: add button on CampaignsPage rows to navigate to Message Status pre-filtered by `campaign_id`. ~½ day effort. |
| 2026-06-06 | **CR-025** | — → **⏸ Discovery Phase 0 complete — PARKED**. New CR registered: Virtual Wallet Management. Current state audit: placeholder frontend, basic credit/debit backend, 0 tenants enabled, 12 transactions (historical sync), 0 orders using wallet. 12 gaps identified. 4 phases planned (P0-P3, ~11-15 days). Primary use case: canteen/student/mess/subscription. Discovery: `CR_025_VIRTUAL_WALLET_MANAGEMENT_DISCOVERY.md`. 10 owner questions (Q1-Q10) block planning. |
| 2026-06-06 | **CR-014 Phase 3** | ⏸ Code complete → **🟡 Phase 3 (Hotel Folio Mode C) IMPLEMENTED**. Two patterns: (A) "HOTEL FOLIO" — auto-detected via `room_info.room_price > 0`, shows room charges + advance/balance + F&B items. Template: `invoice_hotel_room.html`. Tested with sunildev #000130 (Rs.5,945). (B) "GUEST FOLIO" — auto-detected via "Check In" item at Rs.0, shows day-grouped F&B breakdown with stay summary bar (60 Days / 200 Items / Rs.49,355). Template: `invoice_hotel_folio.html`. Tested with Palm House #006644 (Ms. Jamie Finlayson, 61-day stay). Mode detection + routing added to `invoice_generator.py`. POS data contract shared (`handoff/CR_014_POS_HOTEL_FOLIO_DATA_CONTRACT.md`) requesting 7 new `room_info` fields. Normal food invoices (Mode A/B) unchanged. |
| 2026-06-06 | **CR-024 Phase 1** | 🔵 Planning approved → **🟡 Phase 1 IMPLEMENTED + live tested**. S1 approved by owner. Backend: `routers/campaigns.py` (CRUD + execution engine + history + daily limit, 7 endpoints, 2 new collections). Frontend: 4 new pages matching approved mock — CampaignsPage (5 stat cards, columnar stats), AudiencesPage (3-col grid with counts + filter tags + "Create New" card), CampaignHistoryPage (table with delivery % bars), CampaignWizardPage (numbered circle steps, 2-col template picker, all schedule options enabled). Sidebar: WhatsApp + Marketing groups. Seed data: 4 segments + 4 campaigns + 3 runs. Live test: 1 msg sent to abhishek jain — AuthKey `Success`. React.Fragment bug fixed. Phase 2-3 (Scheduled/Recurring) not built. |
| 2026-06-06 | **CR-024** | — → **⏸ Discovery** → **🔵 Mock approved**. New CR registered: Segments & Marketing Campaigns Production Readiness. Deep audit found 13 gaps (4 CRITICAL: "Send Now" doesn't send, no execution engine, no scheduled/recurring). Q1-Q5 answered: Phase 1 first, 1000/day limit, skip opted-out, campaign name required, double confirm >500. Architecture locked: 3 pages (Campaigns/Audiences/History), multi-step wizard, full-page builder, sidebar rename to "Marketing". HTML mock built (`/cr024_mock.html`) with 6 screens — owner approved. Discovery: `CR_024_SEGMENTS_MARKETING_CAMPAIGNS_DISCOVERY.md`. Next: planning doc. |
| 2026-06-06 | **einvoice_token** | — → **IMPLEMENTED**. New variable `einvoice_token` added to `whatsapp_variables.py` (Order/Bill block, 41 total vars). Raw 32-char hex token for dynamic URL button suffix. Forwarded in `pos.py` send_bill event_data alongside `einvoice_link`. Discovery: token available in invoice_generator return but not forwarded. Phase 2 (AuthKey button param wiring) deferred — owner to verify AuthKey includes button vars in `bodyValues`. |
| 2026-06-06 | **CR-023 Phase 3** | 🟡 Phase 2 done → **🟡 Phase 2 + 3 IMPLEMENTED**. Two features: (A) "Add Variable" button — orange pill below body textarea, inserts `{{N}}` at cursor position, auto-increments (max+1). Header gets "Add {{1}}" button, disabled after first use (Meta 1-var limit). (B) Dynamic URL button — Static/Dynamic radio toggle on URL buttons. Dynamic: base URL input + `{{1}}` chip + sample URL input (labeled "BASE URL" / "SAMPLE URL (REQUIRED BY META)"). Backend sends `example` array to Meta. V5 validation updated for dynamic URLs. UX fix: clearer labels replaced confusing placeholders. E2E submission test: `invoice_bill_test_2` template with dynamic "View Bill" button — payload correctly formatted, reached Meta (rejected for body length, not our code). Planning: `CR_023_PHASE3_ADD_VARIABLE_DYNAMIC_URL_PLAN.md`. |
| 2026-06-06 | **CR-023 Phase 2** | 🟡 Phase 1 implemented → **🟡 Phase 1 + Phase 2 IMPLEMENTED**. Investigation: owner's `order_bill_test` template was REJECTED by Meta (`INVALID_FORMAT` — body `{1}` not `{{1}}`). Local status stale (pending, never synced). Root cause: zero frontend validation against Meta standards. **Phase 2 implemented**: `validateMetaCompliance()` function with 10 checks (V1 single-brace, V2 sequential vars, V3 footer no vars, V4 header max 1 var, V5 URL button, V6 phone button, V7 QR text required, V8 media URL, V9 no leading underscore, V10 examples no curly braces). Real-time inline warnings for V1/V3/V4/V9. Full error box on submit attempt. Backend safety net (V1-V4) in `create_meta_template()`. Files: `TemplateBuilderPage.jsx` (validation + inline hints), `routers/whatsapp.py` (backend gate). Verified: 4/4 backend curl pass, 5 frontend screenshots confirmed. Planning doc: `planning/CR_023_PHASE2_META_VALIDATION_V1_V10_PLAN.md`. |
| 2026-06-06 | **CR-023** | — → **🟡 Discovery** → **🔵 Planning + Mock approved** → **🟡 Phase 1 IMPLEMENTED**. Backend: Meta API v21, en_US locale, image header examples, status check endpoint, duplicate name check, detailed Meta errors. Frontend: new full-page `/template-builder` with name validation, char limits, 5 header types, body variable examples, buttons UI (3 types, max 3), WhatsApp live preview, status tracker with auto-polling, duplicate warning. Access via Templates page → "+ Add Template". All existing modules untouched. 52/52 regression pass. Next: owner E2E test with real Meta submission. |
| 2026-06-06 | **CR-022** | — → **🟢 CLOSED**. 4 POS-side coupon bugs fixed: (B1) `POSCartItem.food_id` alias now accepts `item_id` — POS validate was not matching items by `eligible_food_ids` because POS sends `item_id` not `food_id`. (B2) Order webhook cart_dicts `category_id` was hardcoded to `None` — now maps from `oi.item_category`. (B3) `display_title` added to `/pos/coupons/available` and `/pos/coupons/validate` — auto-generated descriptive titles (e.g., "Buy 1 Get 2 Free", "Every 3rd Rs.100 off"). (B4) `same_item_required` frontend edit hydration fixed — was defaulting to `true` via `!== false` check, causing BXG coupons to load as same-item BOGO. Changed to `=== true \|\| offer_type === "bogo"`. **QA: 142/142 pass** (all existing suites green). Files: `models/schemas.py`, `routers/pos.py`, `core/coupon.py`, `pages/CouponsPage.jsx`. Decisions: D1-D4 in DECISIONS_LOG.md. |
| 2026-06-06 | **CR-021** | — → ⏸ discovery → ⏸ planning → 🟡 implemented → **🟢 CLOSED**. Coupon engine: (B1) distribute-first benefit selection across distinct eligible item-lines (was: cheapest greedy single-line) — fixes BOGO/BXG/Nth landing on cheapest item only. (B2) Universal POS-zero CRM safety net — when POS sends `coupon_discount=0` AND CRM computes > 0, CRM records with `discount_mismatch=True` and increments `total_used`. Applies to V1/V2/V3-B/V3-C (no whitelist per owner D3 "if POS sends by mistake CRM shd honour and record drift in log"). Closes silent usage-limit loop. (B3) `per_user_limit` default flipped to Unlimited (was 1); Pydantic + runtime coercions fixed. (Hidden) Runtime `or 1` in `core/coupon.py:1727` + `routers/coupons.py:194` caught during planning audit. **QA: 142/142 pass** (V3-B 49/49 + V3-C 41/41 + new `qa_cr021` 52/52). Files: `core/coupon.py`, `routers/pos.py`, `routers/coupons.py`, `models/schemas.py`, `pages/CouponsPage.jsx`, new `tests/qa_cr021_distribute_and_pos_zero.py`. Docs: discovery/planning/closeout/impl_report. |
| 2026-06-05 | **CR-014** | 🟡 In flight → **⏸ CODE COMPLETE — live test PARKED**. All 4 buckets implemented: (B1) Profile page expansion — 10 fields + VAT + MyGenie auto-fetch on login; (B2) Bill Settings — 18 configurable fields, logo upload, color pickers; (B3) Invoice generator — Jinja2 HTML template + weasyprint PDF, fully dynamic from bill_settings, Mode A (food GST) + receipt fallback; (B4) Invoice public routes — `/api/invoices/{token}` (HTML) + `/pdf`, invoices collection with dedup; (B5) POS webhook hook — invoice generated inline before send_bill trigger, einvoice_link injected, failure-safe. Test invoice KM/010585 verified live (HTML + PDF). **PARKED**: POS + AuthKey webhooks not pointed at this pod. |
| 2026-06-05 | **CR-019** | ⏸ Plan drafted → **❌ CANCELLED**. Owner: "not needed". |
| 2026-06-05 | **CR-014** | ⏸ Discovery parked → **🟡 Phase 1 discovery in progress**. Owner answered C1=a (replace address with 4-field split), C2=a (allow blank GSTIN/FSSAI). Profile page fields from login API. Phase 1 = Profile page expansion. |
| 2026-06-05 | **CR-020** | 🟢 IMPLEMENTED → **🟢 CLOSED — QA report written, 18/18 ACs pass, owner confirmed all gates passed**. QA doc: `qa/CR_020_TEMPLATE_VARIABLE_PICKER_QA_REPORT.md`. Backend V6–V10 curl pass. Frontend S1–S5 screenshots verified. |
| 2026-06-05 | **CR-020** | ⏸ Planning → **🟢 IMPLEMENTED + VERIFIED**. S1–S5 sign-off approved → full implementation. Backend: `block` field on 40 vars (7 blocks), 3 menu vars, `menu_pick` mode validation + resolution, menu sample data. Frontend: `<VariablePicker />` reusable grouped popover (search, suggested, recently-used, alphabetical sort, green/amber dots), `<MenuPickModal />` (Items/Categories tabs), TemplatesPage rewired (wider modal). V1–V10 curl pass. Screenshots verified. Post-fix: alphabetical sort + wider modal per owner feedback. |
| 2026-06-05 | **CR-020** | ⏸ Discovery → ⏸ **Planning drafted**. HTML mock approved. Q1–Q9 answered (Q1=static menu from POS API, Q3=POS sync, Q6=menu last, Q8=reusable). Planning doc: 7 files, 18 ACs, mandatory live API validation protocol. S1–S5 sign-off approved. Doc: `planning/CR_020_TEMPLATE_VARIABLE_PICKER_PHASE_1_PLAN.md` |
| 2026-06-05 | **CR-020** | — → ⏸ **Discovery drafted**. UX restructure: flat 37-var dropdown → single intelligent popover w/ 7 grouped blocks + Menu variable family. Doc: `discovery/CR_020_TEMPLATE_VARIABLE_PICKER_GROUPED_UX_DISCOVERY.md` |
| 2026-06-05 | **CR-019** | — → ⏸ **Planning drafted**. Root cause: UI exposes `send_bill_manual`/`auto`, trigger code only reads `send_bill` after hard-coded collapse. 3 tenants silently broken (Mygenie Dev / Mayur's Kitchen / Jeh's Nest = 2,388 unsent bills). Plan: remove dead UI keys, move `send_bill` from CRM_EVENTS → POS_EVENTS, migration script (idempotent, dry-run mandatory), loud-log skip. Awaiting Q1/Q2/Q3. Docs: `discovery/CR_019_*.md` + `planning/CR_019_*.md` |
| 2026-06-05 | live debug | Owner repointed POS → orders 000457 (Mygenie Dev) + 010585 (Kunafa) landed @ 04:20 UTC. `send_bill` fired E2E both tenants. Kunafa delivered+read in 8s. Mygenie Dev customer received WhatsApp but DB stuck at `pending` — AuthKey delivery webhook URL on Mygenie Dev's AuthKey account points elsewhere. Owner deferred fix. |
| 2026-06-05 | Mygenie Dev | Owner added missing `send_bill` mapping via CRM tab (template 36320 `payment_bill`, enabled, 2026-06-05 04:03:40 UTC) — workaround for CR-019 bug until proper fix lands. |
| 2026-06-05 | repo | Re-bootstrapped from `main` (HEAD `18e879d`, 2026-05-29). First clone went to `dev` (repo default) — caught and re-cloned with `-b main`. memory/ folder on main preserved (8 docs). Pod URL: `63c9eabd-…`. |
| 2026-05-29 | **CR-018** | ⏸ discovery → **🟢 CLOSED**. Approved, implemented, verified in single session. 3 fields added to `/pos/max-redeemable`: tier upgrade projection. POS handoff updated. |
| 2026-05-29 | **CR-018** | — → ⏸ **REGISTERED + Discovery complete**. Feature: projected tier upgrade on `/pos/max-redeemable`. Awaiting owner approval. |
| 2026-05-29 | **CR-017** | — → ⏸ → **🟢 CLOSED**. Registered, discovered, approved, implemented, verified in single session. 3 fields added to `/pos/max-redeemable`. POS handoff updated. |
| 2026-05-29 | **CR-015** | 🟡 code complete + data clean → **🟢 CLOSED — live test passed**. Orders 869331 (009577, Rs.409, abhi123, points_balance=70) and 869333 (009579, Rs.2571, abhishek jain, points_balance=128) — both WhatsApp sent + read, all 7 slots correct. |
| 2026-05-29 | CR-015 | 🟡 Code complete, live test parked → 🟡 **CODE COMPLETE + DATA CLEAN**. POS repointed to preview. Order 869329 received (WhatsApp sent+read). {{6}} semantic mismatch found (`points_earned` mapped where template says "Loyalty Points Used") → fixed to `loyalty_points_used`. Full audit across all 4 R689 templates (18 slots): **0 remaining mismatches**. Awaiting 1 clean order for formal closure. |
| 2026-05-29 | CR-015 | 🟡 Day 3 done, T7 pending → 🟡 **CODE COMPLETE, live test parked**. T7 committed ({{7}} `points_earned`→`points_balance`; {{4}}/{{5}} were already fixed via UI). T2 skipped (owner: resolver handles int→str). Live test parked (POS at prod, order 009573 didn't land on preview). |
| 2026-05-29 | CR-015a | ⏸ frozen spec → 🟢 **IMPLEMENTED** (backend: 14 T5 sample values in `customers.py` sample-data — curl-verified 37 keys; frontend: registry-example fallback in `WhatsAppAutomationContent.jsx` + `TemplatesPage.jsx`; preview shows values, no "NA"). Doc: `planning/CR_015A_PREVIEW_SAMPLE_DATA_FROZEN_SPEC.md` |
| 2026-05-29 | CR-015c | — → 🟢 **Demo login FULLY REMOVED** (owner-approved). Backend `/demo-login` endpoint + constants + `is_demo` schema field; frontend Demo Login button + AuthContext demo code + DemoModeBanner (deleted) + CustomersPage `isDemoMode`. Tests switched to real login (11 passed). demo-login now 404. Doc: `discovery/CR_015C_REMOVE_DEMO_LOGIN_DISCOVERY.md` |
| 2026-05-29 | CR-015b | — → 🟢 **Dead variable-mapping code REMOVED** (owner-approved B2 + Segments leftovers; orphaned mapping modal cluster on WhatsApp Automation page + unused `availableFields`/`getPreviewMessage` on Segments deleted; lint/compile clean, zero residual refs). Doc: `discovery/CR_015B_DEAD_VARIABLE_MAPPING_CODE_DISCOVERY.md` |
| 2026-05-29 | CR-015a | — → ⏸ **Frozen spec written** (`planning/CR_015A_PREVIEW_SAMPLE_DATA_FROZEN_SPEC.md`, Option A + partial B); awaiting impl after CR-015b |
| 2026-05-29 | CR-015 | 🟡 Day 3 frozen → 🟡 **Day 3 DONE — T4+T6 landed, T7 dry-run complete, awaiting owner commit** (119/119 tests, 5/5 smoke probes, frontend compiles) |
| 2026-05-29 | CR-015 | 🟡 Day 2 done → 🟡 **Day 3 spec FROZEN** (T6+T7+T4 freeze doc at `planning/CR_015_DAY_3_FROZEN_SPEC.md`, 17 acceptance checks) |
| 2026-05-29 | CR-015 | 🟡 Day 2 frozen → 🟡 **Day 2 DONE — T3 landed** (`build_order_event_context` + 3 pos.py callsites refactored, 119/119 tests, lint clean) |
| 2026-05-29 | CR-015 | 🟡 Day 1 done → 🟡 **Day 2 spec FROZEN, T3 ready for implementation** (freeze doc at `planning/CR_015_DAY_2_FROZEN_SPEC.md`) |
| 2026-05-29 | CR-015 | 🟡 Phase 1 plan approved → 🟡 **Day 1 DONE** (T1 resolver hardening + T5 registry expansion landed, 109/109 tests, live smoke confirmed Bug #1 resolved) |
| 2026-05-29 | CR-015 | ⏸ discovery parked → 🟡 **Phase 1 plan drafted, awaiting sign-off** (Q1–Q8 all answered `a`) |
| 2026-05-29 | CR-016 | ⏸ discovery parked → ⏸ **deferred to next sprint** (owner: "we have almost definate event we used need to ensure they map and fire correctly") |
| 2026-05-29 | sprint queue | reaffirmed: CR-015 (P1) → CR-014 (P2); CR-016 out of this sprint |
| 2026-05-29 | pod URL | rotated to `a28cb9e3-…` (AuthKey webhook updated by owner) |
| 2026-05-28 evening | CR-016 | created → ⏸ discovery parked (cooldown removed per owner) |
| 2026-05-28 evening | CR-015 | created → ⏸ discovery parked |
| 2026-05-28 evening | CR-014 | discovery parked → discovery parked + Profile fields appendix added |
| 2026-05-28 evening | **CR-004 P3.5** | parked → **🟢 closed (Option A live test passed; 17/17 ACs)** |
| 2026-05-28 afternoon | CR-004 P3.5 | implementation complete → ⏸ parked awaiting Option A live test |
| 2026-05-28 afternoon | CR-004 P3.5 | receive-side hotfix applied (form-urlencoded parser) |
| 2026-05-28 morning | CR-014 | created → ⏸ discovery parked |
| 2026-05-26 | CRM 1.0 baseline | closed |

---

## How to update this dashboard

1. After any CR phase transition, edit the row's `Phase` + `Status` + `Last touched` cells.
2. Append a row to "Recent transitions" with date + CR + from→to.
3. If a brand-new CR is registered, add a new row above the relevant section and reference its discovery doc.
4. If a CR is closed, change light to 🟢 and clear "Blockers / Owner asks" column.

---

**End of dashboard.**
