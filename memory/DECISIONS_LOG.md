# Decisions Log — `crm_roi_sprint`

> **Append-only.** Every owner-locked decision gets a row. Never edit historical rows; if a decision is reversed, add a NEW row referencing the old one.
> Source quote should be a verbatim paraphrase or direct quote from the chat.

---

## Format
```
### YYYY-MM-DD [CR-XXX] §<section> — <short title>
**Decision**: <what was decided>
**Source**: <verbatim quote or close paraphrase from owner>
**Rationale**: <why, if explained>
**Reverses**: <prior decision ID if applicable>
**Locks**: <what field/section/file this constrains>
```

---

## 2026-05-28 — Session decisions

### 2026-05-28 [project] — Repo bootstrap
**Decision**: Wipe `/app` (including hidden folders) and clone `Abhi-mygenie/CRMpreprod` branch `28-may` fresh.
**Source**: "Yes, wipe everything including hidden folders" (response to bootstrap prompt).
**Rationale**: Clean state for branch-specific work.
**Locks**: `/app` contents.

### 2026-05-28 [project] — MongoDB only remote
**Decision**: Use remote MongoDB at `52.66.232.149:27017/mygenie`. No local DB.
**Source**: "yes remote".
**Rationale**: Prod and preview share data; preview is operating on live data.
**Locks**: `/app/backend/.env::MONGO_URL`, `DB_NAME=mygenie`.

### 2026-05-28 [project] — Testing agent OFF
**Decision**: Do NOT call `testing_agent_v3` for this sprint.
**Source**: Repeated across initial brief: "Do not run a testing agent" + "no testing agent".
**Locks**: All testing must use curl / `python -c` / screenshots / live trace scripts.

---

### 2026-05-28 [CR-004 P3.5] — Form-urlencoded webhook hotfix authorized
**Decision**: Patch `routers/whatsapp.py::message_status_callback` to handle `application/x-www-form-urlencoded` in addition to JSON.
**Source**: "A only" in response to options (A fix parser / B docs only / C both).
**Rationale**: Real AuthKey delivery callbacks arrive as form-encoded, not JSON as originally documented.
**Locks**: Parser content-type detection branch in webhook handler.

### 2026-05-28 [CR-004 P3.5] — Option A live test path
**Decision**: Fire synthetic POS order at preview's `/api/pos/orders` (not push to prod).
**Source**: "CR-004 P3.5 we need to test an order with option A ready".
**Rationale**: Validates send-side end-to-end without requiring prod push.
**Locks**: Live-test artifact at `qa/CR_004_PHASE_3_5_LIVE_TEST_REPORT.md`.

### 2026-05-28 [CR-004 P3.5] — CLOSED
**Decision**: CR-004 P3.5 status moves to `cr_004_p3_5_closed_live_test_passed` (17/17 ACs).
**Source**: Live test of synthetic order `E2E1779979662` — full `pending → delivered → read` in 71 sec.
**Locks**: No further code changes needed for P3.5. Prod push remains optional.

---

### 2026-05-28 [CR-014] §2 Q1 — Invoice modes
**Decision**: 3-mode renderer — GST Tax Invoice (Mode A) / Simple Receipt (Mode B) / Hotel Folio (Mode C). Auto-detect per order.
**Source**: "Both — render GST fields if available in POS payload, else fall back to simple receipt; also consider rooms".
**Locks**: Mode-detection logic + 3 Jinja2 partials.

### 2026-05-28 [CR-014] §2 Q3 — Customer-facing format
**Decision**: Mobile-friendly HTML web page + "Download PDF" button. Not pure PDF.
**Source**: Owner selected option b.
**Locks**: Renderer outputs HTML primarily; PDF via reportlab (or weasyprint) secondary.

### 2026-05-28 [CR-014] §2 Q4 — Access control
**Decision**: Public token URL. No auth, no expiry by default.
**Source**: "Anyone with link".
**Locks**: URL pattern `/api/invoices/{32-char-token}`; no auth middleware on this route.

### 2026-05-28 [CR-014] §2 Q5 — Branding storage
**Decision**: Add missing fields to Profile page (extends `users` collection). Logo is already stored elsewhere — skipping logo in this CR.
**Source**: "we need to add missing feilds in profile page... including logo is already stored".
**Locks**: ~9 new fields on `users` doc (see CR-014 §15); `/api/auth/profile` whitelist expansion.

---

### 2026-05-28 [CR-015] (registered) — Variable mapping scope
**Decision**: CR scope is the **WhatsApp template variable mapping system as a whole**, not just `send_bill`.
**Source**: "no make make clean Another CR... scope it variable mapping" (re CR-015).
**Locks**: 7-track plan in CR-015 covers resolver + DB normalization + event-data forwarding + registry expansion + admin UI hardening + cleanup.

---

### 2026-05-28 [CR-016] §4 — Reuse existing Automation page for events UI
**Decision**: Do NOT create a new "Events" sidebar page. Extend `frontend/src/components/shared/WhatsAppAutomationContent.jsx` (already 1831 LoC, already has the events list + template-mapping UX).
**Source**: "all have event page we can use page page, for new event creation modal can be used".
**Locks**: CR-016 §4.1; modal pattern reuses existing Dialog component.

### 2026-05-28 [CR-016] §3 — NO cooldown mechanism
**Decision**: Remove cooldown design from CR-016 entirely. Frequency is controlled by source-signal cadence + conditions. Events are inherently event-driven.
**Source**: "Cooldown no these not have any re trigger these are events based message".
**Rationale**: Each system signal (POS order received, customer registered, daily birthday match, etc.) has natural single-shot semantics. If finer control needed, use conditions like `customer.total_visits == 5`.
**Reverses**: Earlier CR-016 §3.4 cooldown design proposal.
**Locks**: No `cooldown_seconds` field on `events` collection; no cooldown UI tab; dispatcher has no cooldown lookup.

### 2026-05-28 [CR-016] §3 — Reduced owner questions 10 → 8
**Decision**: Drop former Q5 (cooldown scope) and Q6 (cooldown max) from CR-016 owner-question list. Remaining 8 questions for owner.
**Source**: Downstream of cooldown removal.
**Locks**: CR-016 §7 question list.

---

## 2026-05-29 — Session decisions

### 2026-05-29 [CR-016] — Deferred to next sprint
**Decision**: CR-016 (Dynamic Event Registry + Trigger Configuration UI) is **deferred to the next sprint**. Owner-question round (Q1–Q8) is not answered in this sprint. Discovery doc remains parked as-is.
**Source**: "actually it will come very complex we have almost definate event we used need to ensure they map and fire correctly for now we can mark cr to be taken in next spirint" (owner, 2026-05-29, in response to CR-016 §7 question list).
**Rationale**: Dynamic event registry is a 9–10 day refactor whose value is unlocked only after the existing event surface is reliable. Owner is reprioritizing toward "the events we already have must map + fire correctly" — i.e. CR-015 territory. CR-016 stays valuable but later.
**Locks**:
- CR-016 status → `cr016_discovery_phase_0_deferred_next_sprint`
- No planning doc to be written this sprint.
- Active queue this sprint: CR-015 → CR-014 (CR-016 removed from order).
- Out-of-sprint backlog gains: "Resume CR-016 next sprint with §7 Q1–Q8 still open".

### 2026-05-29 [sprint] — Reaffirmed sprint focus
**Decision**: Active sprint focus is now exclusively (a) hardening firing + variable rendering of the **existing 27 hardcoded events** (CR-015) and (b) E-Invoice mobile link (CR-014). No new event-engine work.
**Source**: Same owner message as above ("we have almost definate event we used need to ensure they map and fire correctly").
**Locks**: Sprint queue → CR-015 (P1) → CR-014 (P2).

---

### 2026-05-29 [CR-015] §7 — Owner answers to all 8 questions (defaults accepted)
**Decision**: All Q1–Q8 answered as the recommended default (option `a`).
**Source**: Owner reply "1 a / 2 a / 3 a / 4 a / 5 a / 6 a / 7 a / 8 a" to CR-015 §7 question list.
**Locked answers**:
- **Q1** Canonical `template_id` type across `whatsapp_event_template_map` and `whatsapp_template_variable_map` = **`str`** (matches AuthKey `LogID` + Meta convention).
- **Q2** T7 cleanup of R689 template 25140's 3 bad mappings → **DB script with dry-run + owner approval before commit**.
- **Q3** T3 event-data expansion strategy → **pass a single giant `order_event_context` dict** (full POS payload + derived fields) to every order-triggered event. Additive, v1 simplicity. Per-event projections deferred to v2.
- **Q4** T6 admin UI on unknown var_key → **block save with inline error "Unknown variable. Pick from list."** (server-side + client-side).
- **Q5** T4 scope → **audit ALL 15 trigger callsites** in this CR (POS + wallet + auth + coupons + loyalty cron + feedback). Single CR, single QA pass.
- **Q6** New `titlecase` formatter → **yes**, applied to `order_type` (`dine_in` → `Dine-In`).
- **Q7** `order_date` granularity → **separate `order_date` + `order_time` variables**; template designers compose.
- **Q8** 12-entry registry expansion → **single PR** (pure additive, no rename/removal).
**Locks**: CR-015 planning-doc decision matrix; Phase 1 plan can now be drafted.

### 2026-05-29 [CR-015] B1–B3 process defaults (applied unless owner overrides at planning sign-off)
**Decision**: Pending explicit owner override at planning sign-off, the following process defaults apply:
- **B1** Pre-T2 backup: `mongodump` of `whatsapp_event_template_map` + `whatsapp_template_variable_map` to `/tmp/cr015_pre_t2_backup_<UTC-iso>/` before any write.
- **B2** Live-test plan: Option-A pattern (fire synthetic POS order at preview's `/api/pos/orders` for R689 against template 25140, watch full trace).
- **B3** Work sequencing: T1 → T5 → T3 → T6 → T7 → T4 → T2 (resolver first, registry next, event-data expansion, UI guard, R689 cleanup, broader callsite audit, finally DB normalization).
**Source**: B1–B3 were posed but unanswered in the Q1–Q8 reply; treating recommended-default as locked unless owner amends during planning sign-off.
**Locks**: Implementation sequencing baseline; revisit possible at planning approval.

---

### 2026-05-29 [CR-015] Phase 1.5 ground-truth probe — findings + Q9
**Decision (Q9)**: Leave R689's empty brand fields (`einvoice_link`, `instagram_link`, `google_review_link`, `feedback_link`) empty for CR-015. Out-of-scope; handled by CR-014/future.
**Source**: Owner reply "Q9 a" (2026-05-29) after reviewing probe report.
**Probe report**: `/app/memory/crm/crm_roi_sprint/investigations/CR_015_PRE_IMPL_GROUND_TRUTH_2026_05_29.md`
**Key findings**:
- Bug #1 confirmed active on R689 `send_bill` (template_id=25140 stored as `int`; last 5 `send_bill` logs show 0/0 bodyValues populated when template_id is int, 5/5 when str)
- Bug #2 confirmed: R689 template 25140 slots {{4}}/{{5}} hold text-mode garbage strings; {{7}} duplicates {{6}}
- **T2 scope drastically smaller than planned**: only R689 has int rows (2 rows total); variable_map collection is uniformly str (3 rows)
- **T7 broader scope clean**: 0 unknown var_keys across all tenants in map mode; only R689 template 25140 has text-mode garbage
- Effort revises **5 days → ~3.5 days**
**Locks**: implementation can start Day 1 (T1 + T5).

### 2026-05-29 [CR-015] Plan v1.1 APPROVED — implementation authorized
**Decision**: Phase 1 plan v1.1 approved. All 11 sign-off boxes accepted (10 from v1.1 + Q9). Implementation begins Day 1 with T1 (resolver hardening) + T5 (registry expansion + 2 new formatters).
**Source**: Owner reply "approved" 2026-05-29 after probe review.
**Locks**:
- Plan doc status → `cr015_planning_phase_1_approved_implementation_authorized`
- Implementation closeout doc: `/app/memory/crm/crm_roi_sprint/implementation/CR_015_VARIABLE_MAPPING_FIDELITY_CLOSEOUT.md`
- Sequence: T1+T5 (Day 1) → T3 (Day 2) → T6+T7+T4-minor (Day 3) → T2 + live test (Day 4)

---

### 2026-05-29 [CR-015] Day 2 — Frozen spec produced after deep audit
**Decision**: Before any Day-2 code lands, agent performed a second deep code audit (owner-requested after v1.0 → v1.1 drift episode). All claims in plan v1.1 §5.2 and §5.4 re-verified file-by-file. Net result: 2 minor refinements (dropped `coupon` param from helper signature; clarified `/api/pos/events` is out-of-T3-scope per POS contract) and 1 import-placement note. **No scope changes**. Frozen spec at `/app/memory/crm/crm_roi_sprint/planning/CR_015_DAY_2_FROZEN_SPEC.md` is now the single source of truth for the implementation agent — every line number, every field name, every reachability claim verified at audit time.
**Source**: Owner instruction "the documents did not match … I wanted to go through the planning in deep … check each and every file … freeze the planning for day two … clean handoff document for implementation agent."
**Locks**:
- T3 scope = 3 callsites in `routers/pos.py` only (lines 1462, 1481, 1497)
- T3 touches exactly 3 files: `core/whatsapp.py`, `routers/pos.py`, NEW `tests/test_cr015_event_context.py`
- `/api/pos/events` (line 2194) explicitly OUT of T3 scope (POS owns event_data shape)
- Helper signature: NO `coupon` param (coupon fields read directly from `order_data`)
- Acceptance gate = 10 checks in §8.3 of freeze doc

### 2026-05-29 [CR-015c] — Full demo login removal
**Decision**: Remove demo login entirely — backend endpoint, frontend button, auth context, banner, schema field, test helpers. No demo user existed in DB; code was already 404.
**Source**: "there should not be any demo login" (owner, 2026-05-29).
**Rationale**: Demo login was broken (no `demo@restaurant.com` in remote DB) and misleading. Owner wants real-auth-only testing path.
**Locks**:
- `POST /api/auth/demo-login` endpoint must remain deleted — no re-introduction
- No `is_demo` field in `TokenResponse` schema
- No Demo Login button on `LoginPage.jsx`
- No `demoLogin`/`isDemoMode` in `AuthContext`
- No `DemoModeBanner` component
- `test_segments_crm.py` uses real login only

### 2026-05-29 [CR-015b] — Dead variable-mapping code removal approved
**Decision**: Remove the orphaned/unreachable variable-mapping modal cluster on the WhatsApp Automation page + unused `availableFields`/`getPreviewMessage` on Segments. Variable mapping is edited **exclusively on the Templates page**.
**Source**: Owner flagged "variable mapping is editable only on the Templates page" (2026-05-29); approved option B2 (full removal of WhatsApp Automation orphaned modal) + Segments leftovers.
**Rationale**: `openVariableMappingModal` was never wired to any button — dead code. Templates page is the single live mapping surface (incl. coupon picker).
**Locks**:
- Variable mapping UI lives exclusively on the Templates page — by design, not by accident
- WhatsApp Automation page must NOT have any mapping modal (orphaned `openVariableMappingModal` cluster stays deleted)
- SegmentsPage must NOT have `availableFields` / `getPreviewMessage`
- Templates page mapping modal + coupon picker untouched (the one live surface)

### 2026-05-29 [sprint] — CR-015a prioritized before T7/Day 4
**Decision**: Preview-NA fix (CR-015a) takes priority over T7 commit + Day 4 (T2 DB normalization + live test).
**Source**: "work on mapping fix" (owner, 2026-05-29) — directed agent to fix the preview "NA" issue for 14 T5 variables before proceeding with T7 commit.
**Rationale**: Preview UX defect was visible and blocking owner review of template mappings. T7 commit is a DB write requiring separate owner approval anyway.
**Locks**:
- Sprint sequence: CR-015a implemented before T7 commit + Day 4
- T7 commit still requires explicit owner "commit" command — not auto-queued

### 2026-05-29 [project] — Real owner credentials provided for testing
**Decision**: Owner provided `owner@kunafamahal.com` as the canonical test login. Saved to `test_credentials.md`.
**Source**: Owner provided real credentials (2026-05-29) after demo login was removed.
**Rationale**: Replaces the now-deleted demo login as the testing path. All verification flows use real auth.
**Locks**:
- `owner@kunafamahal.com` is the canonical test login (stored in `test_credentials.md`)
- Replaces the now-deleted demo login as the testing path
- All future test/verification flows must use real auth, not demo

### 2026-05-29 [CR-015] T7 — Script narrowed + committed ({{7}} only)
**Decision**: T7 cleanup script updated to fix only `{{7}}` (`points_earned` → `points_balance`). Slots `{{4}}` and `{{5}}` were already corrected (via Templates page UI) before this session — script safety-abort confirmed they were clean. Committed against remote DB.
**Source**: Owner said "commit" (2026-05-29) after reviewing dry-run output showing single-slot change.
**Rationale**: Original T7 targeted 3 slots but 2 were already fixed. Safety check caught this; script narrowed to avoid overwriting good data.
**Locks**:
- R689 template 25140 all 7 slots now correct: `{{1}}`=customer_name, `{{2}}`=amount, `{{3}}`=restaurant_order_id, `{{4}}`=payment_method, `{{5}}`=order_date, `{{6}}`=points_earned, `{{7}}`=points_balance
- `scripts/cr015_t7_cleanup_r689_template_25140.py` updated to reflect narrowed scope
- DB write verified: `matched=1, modified=1`, re-read confirmed

### 2026-05-29 [CR-015] T2 — Skipped (resolver handles int→str)
**Decision**: Skip T2 DB normalization (converting 2 int `template_id` rows to str in `whatsapp_event_template_map`). Owner does not care about old data as long as new messages work.
**Source**: Owner: "if we dont care of old date will decision change" → confirmed skip after explanation that T1 resolver already handles int→str coercion.
**Rationale**: T1 hardened the resolver with int→str coercion + fallback lookup. The 2 legacy int rows (R689 `send_bill`=25140, `new_order_customer`=28311) cause zero functional issues. Skipping avoids a DB write on shared prod data for no user-facing benefit.
**Locks**:
- T2 normalization script NOT created, NOT run
- 2 int `template_id` rows remain in `whatsapp_event_template_map` (tech debt, non-blocking)
- Resolver int-fallback branch in `get_event_template_config` stays (minor dead-code, functional safety net)
- CR-015 can close without T2

### 2026-05-29 [CR-015] — Live test parked
**Decision**: Live integration test (synthetic POS order → WhatsApp trace) parked. POS is pointed at production, not this preview pod.
**Source**: Owner: "ok we will park this, whats next" (2026-05-29) after confirming order 009573 was hitting production not preview.
**Rationale**: Preview pod cannot receive real POS orders unless POS endpoint is repointed. Test can be performed when POS points at preview or after code is pushed to production.
**Locks**:
- CR-015 status → `cr015_code_complete_live_test_parked`
- Live test remains a prerequisite for formal closure (`cr015_closed_live_test_passed`)
- Can be unparked anytime by either repointing POS to preview or pushing code to prod and testing there

### 2026-05-29 [CR-015] — Live test: POS repointed to preview, order 869329 received
**Decision**: Owner repointed POS + AuthKey webhook URLs to preview pod. Order 869329 (R689, Rs.745, cash, 1106 loyalty points redeemed) landed successfully. WhatsApp sent and delivered (status=read). Identified `{{6}}` semantic mismatch during live trace.
**Source**: Owner: "check for this order 869329 in 689 — i received this message" + "i think its code issue we have not moved code only api url we pointed here"
**Locks**:
- POS + AuthKey webhook now point at preview pod `c158ad1e-…`
- Live test is no longer parked — orders are flowing through preview code

### 2026-05-29 [CR-015] — {{6}} semantic mismatch found + fixed
**Decision**: Template 25140 slot `{{6}}` remapped from `points_earned` → `loyalty_points_used`. The Meta template text says "Loyalty Points Used: {{6}}" but was mapped to `points_earned` (how many earned, not used). Order 869329 showed "Loyalty Points Used: 0" when customer actually used 1106 points. The CR-015 probe (Phase 1.5) missed this because it only checked if var_keys were valid registry entries — not whether they semantically matched the template text.
**Source**: Owner reported wrong values in received WhatsApp; confirmed "ok fix this only" after root cause analysis.
**Locks**:
- R689 template 25140 `{{6}}` = `loyalty_points_used` (was `points_earned`)
- DB write verified: `matched=1, modified=1`

### 2026-05-29 [CR-015] — Full template-vs-mapping audit: all clear
**Decision**: Ran systematic read-only audit across all 4 R689 templates (18 slots total), cross-referencing AuthKey template body text with DB variable mappings. Result: 0 remaining mismatches after the `{{6}}` fix. 3 slots use intentional text-mode (static values). 27 of 37 registry variables are available but unmapped (ready for future templates).
**Source**: Owner: "we have 23 variables is there a similar issue for any other variable, can we run a audit summary" → confirmed "ok update docs"
**Locks**:
- All R689 template mappings verified correct as of 2026-05-29
- Audit methodology documented: fetch AuthKey template body → compare slot context vs mapped variable semantically
- Future T7-style fixes should cross-check template TEXT, not just registry validity

### 2026-05-29 [CR-015] — CLOSED: Live test passed
**Decision**: CR-015 formally closed. Two clean live orders verified on R689 (orders 869331/009577 and 869333/009579) with all 7 template slots rendering correctly. Status=read on both. This validates the full CR-015 stack: T1 resolver, T5 registry, T3 event context, T4 enrichments, T6 validation, T7 cleanup, and the {{6}} semantic fix.
**Source**: Owner triggered real POS orders on R689 (customer 7505242126 / abhishek jain). Both WhatsApp messages delivered + read with correct values.
**Locks**:
- CR-015 status → `cr015_closed_live_test_passed`
- All code tracks (T1-T7) + data fixes ({{4}}-{{7}}) + full audit verified in production-equivalent conditions
- No further CR-015 work unless regression discovered

### 2026-05-29 [CR-017] — Registered as hot production fix
**Decision**: Register `/pos/max-redeemable` missing projected points earned as CR-017. Hot production priority.
**Source**: Owner: "register bug/cr, this will be hot production bug" (2026-05-29).
**Locks**: CR-017 registered, discovery doc created.

### 2026-05-29 [CR-017] — Owner added `earn_ratio_display` field
**Decision**: Add a third field `earn_ratio_display` (string, e.g. "₹1 per ₹20 spent") to the `/pos/max-redeemable` response so the cashier sees a human-readable earn rate without POS frontend needing to format `projected_earn_percent`.
**Source**: Owner suggestion: "Consider also adding earn_ratio_display (string, e.g., '₹1 per ₹20 spent') so the cashier sees a human-readable rate without frontend having to format projected_earn_percent."
**Locks**:
- CR-017 scope expanded from 2 fields to 3 fields
- `earn_ratio_display` is a server-formatted string — POS displays as-is
- Discovery doc + acceptance criteria updated (AC-3 added, total 7 ACs)

### 2026-05-29 [CR-017] — Approved + implemented
**Decision**: CR-017 approved. 3 additive fields added to `/pos/max-redeemable`: `projected_points_earned`, `projected_earn_percent`, `earn_ratio_display`. Implemented, verified (2 curl tests), POS handoff doc updated.
**Source**: Owner: "approved" (2026-05-29) after reviewing discovery doc with 7 ACs.
**Locks**:
- `/pos/max-redeemable` now returns 10 fields (was 7)
- POS handoff doc (`CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` §3.2) updated with new fields
- CR-017 status → `cr017_closed_implemented_verified`

### 2026-05-29 [CR-018] — Registered: projected tier upgrade
**Decision**: Register CR-018 — add `projected_tier_after`, `tier_upgrade` (bool), `tier_upgrade_message` to `/pos/max-redeemable`. Conversion nudge: "Complete this order and you'll upgrade to Silver!".
**Source**: Agent recommendation accepted by owner: "yes register a CR and go by play book" (2026-05-29).
**Locks**: CR-018 registered, discovery doc created, awaiting owner approval before implementation.

### 2026-05-29 [CR-018] — Approved + implemented
**Decision**: CR-018 approved. 3 additive fields added to `/pos/max-redeemable`: `projected_tier_after`, `tier_upgrade`, `tier_upgrade_message`. Implemented, verified (2 curl tests), POS handoff doc updated.
**Source**: Owner: "approve" (2026-05-29) after reviewing discovery doc with 8 ACs.
**Locks**:
- `/pos/max-redeemable` now returns 13 fields (was 10 after CR-017)
- POS handoff doc updated with new fields
- CR-018 status → `cr018_closed_implemented_verified`

---

## 2026-06-05 — Session decisions

### 2026-06-05 [project] — Bootstrap from `main` (not `dev`)
**Decision**: Wipe `/app` (preserving `.git`/`.emergent`), clone `Abhi-mygenie/CRMpreprod` with explicit `-b main` after first clone landed on `dev` (the repo's default branch).
**Source**: *"please wipe local and re pull from main branch"* — after agent noticed default branch was `dev`.
**Rationale**: Owner asked for `main` explicitly. `dev` had a `craco visual-edits` babel-plugin crash on `CustomerLifecyclePage.jsx`; `main` compiles cleanly.
**Locks**: branch = `main`, HEAD `18e879d` (2026-05-29).

### 2026-06-05 [debug] — Pinpointed `send_bill` event-key mismatch as root cause of "WhatsApp not delivering" for Mygenie Dev
**Decision**: Confirmed via live DB read that UI exposes `send_bill_manual`/`send_bill_auto` (POS Events tab) but `routers/pos.py:1511,2133` collapses both to internal `send_bill` and only looks up that key. 3 tenants (Mygenie Dev / Mayur's Kitchen / Jeh's Nest) silently broken; 2 tenants (Kunafa, Hungry Keya) work only because someone also used the CRM tab (which DOES write `send_bill`).
**Source**: live debug 2026-06-05 — owner confirmed receipt on Kunafa, no receipt on Mygenie Dev; agent verified 0 `send_bill` rows in DB for affected tenants despite 2,388 orders.
**Locks**: CR-019 problem statement.

### 2026-06-05 [CR-019] §8 — Solution approach Option 1 chosen
**Decision**: Fix via UI cleanup (remove `send_bill_manual`/`auto` from POS_EVENTS, move `send_bill` from CRM_EVENTS → POS_EVENTS) + one-off idempotent migration script + loud-log silent-skip. Not Option 2 (migration-only — doesn't fix UI trap for future tenants) and not Option 3 (split auto/manual semantically — too big for tonight).
**Source**: *"sound fine for option 1, no discovery is important, so we know we doing quick fix"*
**Rationale**: Smallest blast radius, fixes 3 broken tenants and prevents new ones, ~½ day effort, no regression on Kunafa.
**Locks**: CR-019 implementation plan.

### 2026-06-05 [Mygenie Dev workaround] — Owner added `send_bill` mapping via CRM tab manually
**Decision**: Mygenie Dev's `whatsapp_event_template_map` was upserted with `{event_key: "send_bill", template_id: "36320", template_name: "payment_bill", is_enabled: true, created_at: 2026-06-05 04:03:40 UTC}` by owner action through the CRM tab — explicit workaround until CR-019 migration lands.
**Source**: owner action during live debug; verified by post-config DB read.
**Locks**: Mygenie Dev `send_bill` config — do not remove. CR-019 migration must be idempotent here (re-asserting same data is a no-op).

### 2026-06-05 [out-of-scope] — Mygenie Dev AuthKey delivery callback URL fix deferred
**Decision**: Customer phone *does* receive Mygenie Dev WhatsApp, but the AuthKey delivery callback URL on Mygenie Dev's AuthKey account points elsewhere — every send sits at `status=pending` in this DB. Owner explicitly out of scope.
**Source**: *"AuthKey-callback Mygenie Dev fix. nothing is needed here"*
**Locks**: Do not chase Mygenie Dev `status=pending` from CRM side — it's an AuthKey-console webhook URL setting only owner can change.

### 2026-06-05 [CR-020] §4 — Variable picker UX restructure locked
**Decision**: Single intelligent popover replaces flat dropdown. **7 grouping blocks** (Order/Bill incl. `einvoice_link`, Loyalty, Customer, Coupon, **Menu NEW**, Brand, Feedback). Cross-block selection native. Search + suggested-for-event + recently-used + per-variable 🟢/🟡 + live preview. Same color palette, web-first.
**Source**: *"yes direction is fine"* after agent proposed wireframe; owner additions: *"invoice link will be part of order/bill"*, *"in one template user can choose from any field UI should be intelligent"*, *"color palette will be same"*, *"we will usually use CRM on web"*.
**Locks**: CR-020 §4 (L1–L9 in discovery doc).

### 2026-06-05 [CR-020] §5 — Menu variable family: 3 keys, static binding (mirrors coupon_pick) for v1
**Decision**: Add `menu_item_name`, `menu_item_price`, `menu_category_name`. Owner-bound at mapping time via a sub-picker; storage `menu_item:<id>:<field>` in `whatsapp_template_variable_map.mappings`; new `modes` enum value `menu_pick`. Dynamic resolution (auto-pulled from current order) deferred to a follow-up CR.
**Source**: *"we need to add menu also. We already have a menu API … somebody should be able to use a menu item or a, uh, yeah, menu item as a variable or a category as a variable"* + Q1 default acceptable.
**Locks**: CR-020 §5.

### 2026-06-05 [CR-020] §10 — Planning phase starts with HTML mock, not planning doc
**Decision**: Before writing a planning doc with exact files/lines, build a standalone HTML mock at `/app/scripts/cr020_mock.html` for owner reaction. Only after mock approval does the planning doc get written.
**Source**: *"during planning phase i will like to see HTML mock first"*
**Locks**: CR-020 phase sequencing.

### 2026-06-05 [register] — CR-019 + CR-020 registered (rows 23 + 24)
**Decision**: Both CRs added to `ROI_MEASUREMENT_CR_REGISTER.md`. CR-019 status `cr019_plan_drafted_awaiting_signoff`. CR-020 status `cr020_discovery_drafted_awaiting_signoff`.
**Locks**: Sprint register.

### 2026-06-05 [CR-020] — Q1–Q9 answered + HTML mock approved
**Decision**: All 9 questions answered. Q1=static menu binding from POS API ("send today's menu"), Q2=deferred, Q3=POS menu sync, Q4=fills_on+curated, Q5=per-owner localStorage, Q6=menu block last, Q7=lucide-react icons, Q8=reusable component, Q9=existing preview approach.
**Source**: Owner answers 2026-06-05: "q1 it will be menu items from menu API so user can send todays menu / q3 b / q4 a / q5 a / q6 menu at last / q7 a / q8 a / q9 a". HTML mock reviewed at `/cr020_mock.html` — "this seems fine".
**Locks**: CR-020 discovery questions closed. Planning doc can be written.

### 2026-06-05 [CR-020] — Live API validation mandatory before implementation
**Decision**: Every backend change and every API consumed by frontend must be validated with live curl calls before implementation is considered complete. Planning doc includes a 10-step pre/post validation protocol (V1–V10) and 10-step screenshot protocol (S1–S10).
**Source**: Owner: "in planning we need to include live API validation for each field is mandatory before actual implementation".
**Locks**: §1 of planning doc; implementation cannot skip validation steps.

### 2026-06-05 [CR-020] — Planning doc written, awaiting S1–S5 sign-off
**Decision**: Planning doc at `planning/CR_020_TEMPLATE_VARIABLE_PICKER_PHASE_1_PLAN.md` covers 7 files, 18 acceptance criteria, block-assignment table, menu_pick storage design (menu_pick_resolved alongside mappings), implementation sequence (backend first → frontend). 5 sign-off questions in §8.
**Source**: Agent-authored after Q1–Q9 lock + mock approval.
**Locks**: CR-020 status → `cr020_planning_phase_1_awaiting_signoff`.

### 2026-06-05 [CR-019] — CANCELLED by owner
**Decision**: CR-019 (`send_bill` event-key mismatch) is cancelled. Owner says it's not needed.
**Source**: *"CR-019 — send_bill event-key mismatch (½ day, 3 broken tenants) close this its not needed"*
**Locks**: CR-019 status → `cr019_cancelled`. No implementation, no migration script. Mygenie Dev workaround (manual `send_bill` row) stays as-is.

### 2026-06-05 [CR-014] §15.6 C1 — Address strategy: replace
**Decision**: Replace current single-line `address` field with 4-field split: `address_line1`, `address_line2`, `city`, `pincode`. Remove old `address` field from frontend.
**Source**: *"c1 a"*
**Rationale**: `address` field is empty for all 14 tenants — safe to replace. Structured fields needed for GST invoice (place-of-supply state derivation).
**Locks**: ProfilePage.jsx removes old "Address" textarea; backend whitelist adds 4 new fields; old `address` key stays in DB (no deletion) but is no longer exposed in UI.

### 2026-06-05 [CR-014] §15.6 C2 — Required-vs-optional: allow blank
**Decision**: Allow blank for GSTIN, FSSAI, PAN, and all other new fields. Save button never blocks on missing compliance fields. Restaurants without GSTIN fall back to Mode B (simple receipt).
**Source**: *"c2 a"*
**Rationale**: Restaurants without GST registration shouldn't be locked out of CRM. The invoice renderer handles missing fields gracefully by falling back to simpler invoice modes.
**Locks**: No required-field validation on GSTIN/FSSAI/PAN. Only format-validation (regex) when a value IS provided.

### 2026-06-05 [CR-014] — Profile page is the data source for invoice fields
**Decision**: Invoice branding/tax fields come from the `users` collection, populated via the Profile page. On first login, `GET /api/auth/profile` returns existing data; owner fills missing values from Profile page.
**Source**: *"it needs to come from profile page when u login first time in profile API u will get this first time u will fetch and map this in profile later user can edit from here, it any value is missing user will update in profile page"*
**Locks**: No separate `restaurant_branding` collection. All fields live on `users` doc. Profile page is the single admin surface for invoice branding data.

---

## How to add a new decision

1. Append a new `### YYYY-MM-DD [CR-XXX] §<section> — <title>` block at the bottom of the appropriate session group.
2. If creating a new session group, add it as a `## YYYY-MM-DD — Session decisions` heading.
3. Include verbatim source quote (or close paraphrase) — this is the audit trail.
4. If the decision reverses an earlier one, add a `**Reverses**:` line linking to the older decision title.

### 2026-06-05 [CR-014] — Logo: skip auto-fetch, manual only for now
**Decision**: Skip MyGenie bill_logo CDN auto-fetch. Logo is manual upload/URL only. Owner will provide CDN base URL later.
**Source**: *"1 skip will provider later"*
**Locks**: `_sync_mygenie_profile_fields` does NOT extract `bill_logo`. Profile page has manual upload + URL input.

### 2026-06-05 [CR-014] — SAC code: default empty
**Decision**: SAC code defaults to empty string (not 996331). Restaurant fills it themselves if they want it on the invoice.
**Source**: *"2 no keep empty"*
**Locks**: `bill_settings.sac_code` default = "".

### 2026-06-05 [CR-014] — PDF: weasyprint for pixel-perfect quality
**Decision**: Use weasyprint (HTML→PDF) instead of reportlab. Gives pixel-perfect match between HTML view and PDF download.
**Source**: *"3 need quality weasyprint"*
**Locks**: `weasyprint==69.0` installed. `services/invoice_generator.py` uses `weasyprint.HTML(string=html).write_pdf()`.

### 2026-06-05 [CR-014] — Invoice number: prefix/bill_number (not sequential)
**Decision**: Invoice number = `{invoice_prefix}/{restaurant_order_id}` from POS. Not sequential. No invoice_counters collection needed. Example: `KM/010585`.
**Source**: *"6 not sequential /bill number pls note this"*
**Locks**: No `invoice_counters` collection. `invoice_prefix` configurable in bill_settings.

### 2026-06-05 [CR-014] — Totals structure locked
**Decision**: Item Total → Delivery Charge (before subtotal) → Subtotal → Discounts → Taxable Amount → CGST/SGST → Grand Total.
**Source**: *"2 yes on subtotal tax is charge, delivery charge is before subtotal"*
**Locks**: `invoice_food.html` template totals section.

### 2026-06-05 [CR-014] — Bill Settings: dynamic personalization in Profile page
**Decision**: New "Bill / Invoice Settings" card in Profile page with 18 configurable fields. All stored as `bill_settings` sub-doc on users collection. Invoice template reads all settings dynamically.
**Source**: *"7 yes please plan all these"*
**Locks**: `bill_settings` sub-doc schema with 18 keys (branding + display toggles + footer/social).

### 2026-06-05 [CR-014] — Live test PARKED
**Decision**: CR-014 code is complete across all 4 buckets. Live test parked — POS + AuthKey webhooks need to be repointed to this preview pod.
**Source**: *"ok we will park this"*
**Locks**: CR-014 status → `cr014_code_complete_live_test_parked`. Unpark when owner repoints POS.

---

## 2026-06-06 — CR-021 (Coupon engine: distribute + POS-zero + Unlimited defaults)

### 2026-06-06 [CR-021] D1 — Distribute-first benefit selection
**Decision**: `_v3b_select_get_units` selects benefit units by grouping candidates by identity (food_id, item_id, name), sorting groups by unit_price (ascending by default; descending when `apply_to_highest_item=True`), then round-robin picking one unit per group before re-dipping. Replaces legacy cheapest-greedy single-line behavior. Same helper serves V3-B (BOGO/BXG) and V3-C (Every-Nth) compute paths.
**Source**: Owner answer to Q1 → "ii" (distribute-first); Gap A repro showed cart `mtest=1 + xyz12=1 + 5Star=2` (Nth=2) discounting 2× 5Star instead of distributing.
**Rationale**: Customer expectation when offer states "every Nth free" — should free one of each distinct eligible line first, not greedily exhaust the cheapest SKU.
**Locks**: `backend/core/coupon.py:743-807`. Algorithm: group → sort → round-robin. Deterministic.

### 2026-06-06 [CR-021] D2/D3 — Universal CRM safety net on POS-zero discount
**Decision**: `record_coupon_usage_for_order` no longer early-skips when POS sends `coupon_discount=0`. Skip decision deferred until AFTER validation produces `crm_computed`. If POS=0 AND CRM>0 → record using `crm_computed`, set `discount_mismatch=True`, log `coupon_pos_zero_drift_recorded`, increment `total_used`. If POS=0 AND CRM=0 → skip with `coupon_zero_discount_skipped` warning. Applies to ALL coupon classes (V1 simple, V2 item-scope, V3-B BOGO/BXG, V3-C Nth) — no whitelist.
**Source**: Owner verbatim — *"idea is if pos send my mistake CRM shd honour and record drift in log"*; Q2 answer "a"; D3 answer "for all".
**Rationale**: Today's behavior silently bypassed usage_limit/per_user_limit when POS forgot to apply the discount — customer could re-redeem indefinitely. CRM is now the universal safety net; drift is logged + flagged via `discount_mismatch=True` for ops reconciliation.
**Locks**: `backend/core/coupon.py:2078-2230`. `effective_pos_sent` becomes `crm_computed` when `pos_sent_zero AND crm_computed>0`. CRM never inflates above its own computed value. POS bill is untouched — this is a logging/limit-enforcement fix only.

### 2026-06-06 [CR-021] D4 — `per_user_limit` default flipped to Unlimited
**Decision**: Default value for `per_user_limit` on new coupons is now `null` (Unlimited). Pydantic `CouponCreate.per_user_limit` and `Coupon.per_user_limit` both `Optional[int] = None`. Frontend form field defaults to empty with placeholder "Unlimited". Runtime coercions `or 1` in `core/coupon.py:1727` and `routers/coupons.py:194` removed; both `None` and `0` mean unlimited.
**Source**: Owner Q4 answer — *"yes it shd be default"*; placeholder confirmed as "Unlimited" (D5).
**Rationale**: Form forcing `1` as default was a hidden ceiling — owners thought "Unlimited" was the default and were surprised when usage was capped. UX placeholder shows "Unlimited" to communicate the actual default.
**Locks**: `backend/models/schemas.py:584, 757`, `backend/core/coupon.py:1727`, `backend/routers/coupons.py:194`, `frontend/src/pages/CouponsPage.jsx:76, 295, 364, 938`.

### 2026-06-06 [CR-021] D-runtime-fix — Schema change alone is insufficient
**Decision**: Future schema-default changes must grep for runtime `or N` / `get(field, N)` coercions before declaring done. Caught during CR-021 planning §3.5 audit: schema accepted `null` but runtime still coerced to 1 in two callsites. Pattern: schema change + runtime sweep is mandatory.
**Source**: Planning §3.5 audit during plan walkthrough.
**Rationale**: Would have been a silent regression — owners create coupon with "Unlimited" intent, DB stores null, but per-user enforcement at validation time still treats it as 1. Worst kind of bug: visible in UI as fixed, broken in practice.
**Locks**: All future Pydantic default-flip CRs must include a grep audit step in the plan.

---

## 2026-06-06 — CR-022 (Coupon POS-side bug fixes: alias, display_title, same_item_required)

### 2026-06-06 [CR-022] D1 — POSCartItem food_id alias must accept item_id
**Decision**: Add `item_id` to the `food_id` field's `AliasChoices` in `POSCartItem` model. POS sends `item_id` as the food identifier in validate requests, but the coupon engine matches against `eligible_food_ids` via `food_id`. Without this alias, items weren't matched in the validate endpoint even though the order webhook mapped them correctly.
**Source**: Investigation of owner report "NTH coupon only applied to category items, not mtest". Root cause: POS sends `item_id` but `POSCartItem.food_id` alias didn't include it → food_id=None → food_id matching failed.
**Locks**: `backend/models/schemas.py` POSCartItem.food_id alias = `("food_id", "foodId", "pos_food_id", "item_id")`.

### 2026-06-06 [CR-022] D2 — POSCartItem category_id alias must accept item_category
**Decision**: Add `item_category` to the `category_id` field's `AliasChoices` in `POSCartItem` model. POS sends `item_category` as the category identifier. Also fixed `category_id: None` hardcoding in `routers/pos.py` order webhook cart_dicts to `category_id: oi.item_category or None`.
**Source**: Same investigation as D1. The order webhook hardcoded `category_id: None` (line 1580) even though `oi.item_category` was available.
**Locks**: `backend/models/schemas.py` POSCartItem.category_id alias = `("category_id", "categoryId", "item_category", "itemCategory")`. `backend/routers/pos.py` cart_dicts line 1580 = `oi.item_category or None`.

### 2026-06-06 [CR-022] D3 — display_title added to POS coupon API responses
**Decision**: Add auto-generated `display_title` field to `/pos/coupons/available` and `/pos/coupons/validate` responses. Examples: "Buy 1 Get 2 Free", "Every 3rd Rs.100 off", "10% off". Existing `title` field (user-entered name) remains unchanged.
**Source**: Owner report "in nth and bogo display title not coming in pos api". POS UI needs a descriptive label but only received the raw `title` (e.g., "BG", "Nthh").
**Locks**: New `build_display_title()` helper in `backend/core/coupon.py`. Field `display_title` additive in both API responses.

### 2026-06-06 [CR-022] D4 — same_item_required edit hydration fix
**Decision**: Frontend edit form hydration for BOGO coupons changed from `coupon.same_item_required !== false` (defaulted to true for all) to `coupon.same_item_required === true || coupon.offer_type === "bogo"`. This ensures coupons stored with `offer_type=bxg` correctly load with same_item_required=false.
**Source**: Owner report "bogo not working for buy one get one same item". Root cause: BOGO1 had `same_item_required=True` in DB because the form default was true and the edit hydration also defaulted to true via `!== false`. With same_item=True and buy_q=1 + get_q=2, the coupon required 3 of the SAME item — not the intended different-item BXG behavior.
**Locks**: `frontend/src/pages/CouponsPage.jsx` line 323. Owner must re-save BOGO1 with correct same_item toggle to fix existing data.

### 2026-06-06 [CR-023] — Registered: WhatsApp Template Builder Production Readiness
**Decision**: Register CR-023. Investigation found 14 gaps (4× P0, 5× P1, 4× P2, 1× P3) preventing template creation from working. P0 blockers: Meta API v17.0 (stale), language code `en` (Meta needs `en_US`), body_text example format, media header examples missing. 3-phase plan proposed. Next gate: Q1-Q5 answers → HTML mock → planning.
**Source**: Owner report "adding a template is not working, user is not able to add a template and submit to meta". Code investigation confirmed wiring exists but has format/version gaps.
**Locks**: CR-023 registered. Discovery doc at `discovery/CR_023_WHATSAPP_TEMPLATE_BUILDER_PRODUCTION_READINESS_DISCOVERY.md`. Sprint queue updated: CR-023 at #2 after CR-014.

---

## 2026-06-06 — CR-023 Phase 2 (Meta Template Validation V1-V10)

### 2026-06-06 [CR-023] — `order_bill_test` root cause: INVALID_FORMAT (single braces)
**Decision**: Investigation confirmed template `order_bill_test` (meta_template_id=992580986971965) was **REJECTED** by Meta with `INVALID_FORMAT`. Body had `hi {1}` (single braces) instead of `hi {{1}}` (double braces). Local CRM status was stale at "pending" — Meta had already rejected. Updated local status to "rejected".
**Source**: Owner report "i created a template and submitted to meta it saves as draft". Agent queried Meta Graph API v21.0 directly — `status: REJECTED, rejected_reason: INVALID_FORMAT, category: MARKETING` (Meta also re-categorized from utility).
**Locks**: Root cause confirmed. Phase 2 scope = V1-V10 frontend + backend validations.

### 2026-06-06 [CR-023] — Phase 2 plan approved (S1-S3 all recommended defaults)
**Decision**: V1-V10 planning doc approved. S1=show all errors at once (not first-only). S2=both frontend + backend validation (defense in depth). S3=warn only (no auto-correct `{N}` → `{{N}}`).
**Source**: Owner: "as suggested" (2026-06-06) after reviewing planning doc with 3 sign-off questions.
**Locks**:
- `validateMetaCompliance()` returns full errors array, shown in red error box
- Backend `create_meta_template()` has V1-V4 safety net returning 400
- No auto-correction of single braces — user must fix manually
- Planning doc: `planning/CR_023_PHASE2_META_VALIDATION_V1_V10_PLAN.md`

### 2026-06-06 [CR-023] — Webhook for template status: existing AuthKey webhook is MESSAGE-only
**Decision**: Confirmed existing `POST /api/whatsapp/status-callback` handles AuthKey **message delivery** status (sent/delivered/read/failed) only — NOT Meta **template approval** status (PENDING/APPROVED/REJECTED). Template status currently uses polling (`GET /custom-templates/{id}/status` every 30s on builder page). No code change needed — existing Message Status dashboard works correctly (confirmed via owner screenshot: 19 Total, 14 Read, 5 Pending, 0 Failed).
**Source**: Owner asked "we have webhook here right" + shared Message Status dashboard screenshot. Agent confirmed: "no just no dashboard, its already mapped check and confirm".
**Locks**: No template status webhook to add. Existing polling approach stays. Message Status page untouched.

### 2026-06-06 [CR-023] — Phase 3 plan approved (Add Variable + Dynamic URL)
**Decision**: Both features approved for implementation. (A) "Add Variable" button below body textarea — inserts `{{N}}` at cursor, auto-increments. Header gets "Add {{1}}" button disabled after first use. (B) Dynamic URL button — Static/Dynamic radio toggle, base URL + `{{1}}` chip, sample URL for Meta approval. Backend sends `example` array for dynamic URLs.
**Source**: Owner: "S1" (2026-06-06) approving both features after reviewing planning doc `CR_023_PHASE3_ADD_VARIABLE_DYNAMIC_URL_PLAN.md`.
**Locks**:
- `insertBodyVariable()` uses `useRef` for cursor position, `max+1` for numbering
- Header limited to single `{{1}}` — button disabled after insert
- Dynamic URL button stores `url_base`, `url_example`, composes `url = url_base + "{{1}}"`
- Backend adds `example` array to Meta payload when URL contains `{{1}}`
- V5 validation updated: dynamic URLs check `url_base` + `url_example` separately

### 2026-06-06 [CR-023] — `einvoice_token` variable: Phase 1 done, Phase 2 deferred
**Decision**: Add `einvoice_token` to variable registry + event_data (Phase 1). AuthKey button parameter wiring (Phase 2) deferred pending owner verification of AuthKey payload format for button URL vars. Discovery found: invoice token available in `invoice_generator.py` return dict but not forwarded to `event_data`. Impact: 2 backend files, 3 lines changed, zero risk.
**Source**: Owner: "yes" to add variable + "do discovery and impact analysis". Phase 2 deferred: owner confirmed AuthKey payload only has `bodyValues`/`headerValues` — no `buttonValues` field. Hypothesis: button URL `{{1}}` is the next sequential number in `bodyValues`. Owner to verify with test send.
**Locks**:
- `einvoice_token` in registry: `whatsapp_variables.py`, block `order_bill`, source `event.einvoice_token`
- `einvoice_token` in event_data: `pos.py` send_bill trigger, from `inv.get("token", "")`
- 41 total variables (was 40)
- Phase 2 (AuthKey wiring): NOT started. Pending owner's AuthKey curl verification.

### 2026-06-06 [CR-023] — E2E submission test: Meta payload correctly formatted
**Decision**: Agent-initiated E2E test of full submission pipeline. Template `invoice_bill_test_2` with body (3 vars) + dynamic URL "View Bill" button (`https://crm.mygenie.online/api/invoices/{{1}}`). Result: passed all V1-V10 validations, backend safety net passed, Meta API called with correct payload (button `example` array included). Meta rejected for content policy ("too many variables for its length") — not a code issue. Proves full pipeline works correctly.
**Source**: Agent test after owner reported dynamic URL validation bug.
**Locks**: Pipeline verified end-to-end. Owner needs to use longer body text for Meta approval.

---

## 2026-06-06 — CR-024 (Segments & Marketing Campaigns)

### 2026-06-06 [CR-024] — Registered + Discovery complete
**Decision**: Register CR-024. Deep audit of Segments section found 13 gaps (4 CRITICAL: "Send Now" only saves config — zero messages sent, no execution engine, no scheduler for scheduled/recurring). 4-phase plan proposed. Q1-Q5 answered.
**Source**: Owner: "Open a new CR... Segment section... idea is marketing campaign... analyze what is working, what is not working, what should be improved".
**Locks**: CR-024 registered. Discovery doc at `discovery/CR_024_SEGMENTS_MARKETING_CAMPAIGNS_DISCOVERY.md`.

### 2026-06-06 [CR-024] — Architecture decisions locked (A1-A4)
**Decision**: A1=3 pages (Campaigns/Audiences/History). A2=Multi-step wizard. A3=Full-page builder. A4=Sidebar rename "Segments" → "Marketing" with 3 sub-items.
**Source**: Owner answers: "1 3 pages", "2 Campaign wizard (multi-step) all step by step", "3 full page", "4 yes".
**Locks**: Sidebar structure: Marketing → Campaigns/Audiences/History. Campaign creation is a full-page 3-step wizard.

### 2026-06-06 [CR-024] — Q1-Q5 answered
**Decision**: Q1=Phase 1 first. Q2=1000/day limit. Q3=Skip opted-out. Q4=Campaign name required. Q5=Double confirm for >500.
**Source**: Owner: "q1 yes / q2 for now keep 1000 per day / q3 yes / q4 required / q5 yes".
**Locks**: Rate limit 1000/day per tenant. Campaign naming is mandatory (not optional). Customers with whatsapp_opt_in=false always skipped. Segments >500 customers require double confirmation.

### 2026-06-06 [CR-024] — Gate sequence: Option A (full mock + planning + approval)
**Decision**: Full gate sequence before implementation: HTML mock for all 3 pages → owner review → planning doc with API contracts → owner approval → implementation.
**Source**: Owner chose "option A" (full gate sequence) over Option B (planning only) and Option C (hybrid).
**Locks**: No implementation starts until: (1) HTML mocks approved, (2) planning doc approved. This applies to all CR-024 phases.

### 2026-06-06 [CR-024] — HTML mock approved (6 screens)
**Decision**: HTML mock at `/app/frontend/public/cr024_mock.html` approved. 6 screens: Campaigns list (stats bar + filter tabs + campaign rows), Audiences grid (segment cards + create card), History table (stats + delivery % bars + resend failed), Wizard Step 1 (name + audience selector + opt-out count), Wizard Step 2 (template picker + variable mapping + WhatsApp preview), Wizard Step 3 (schedule options + confirmation box + daily limit + send button).
**Source**: Owner: "looks good" after reviewing all 6 screenshots.
**Locks**: Mock is the design reference for implementation. Next gate: planning doc.

### 2026-06-18 [CR-027] §config — All 22 env variables must be in .env, zero hardcoding
**Decision**: Every config value (URLs, secrets, feature flags, logging params) must read from `/app/backend/.env` with no hardcoded fallback defaults in code. 22 variables total.
**Source**: Owner: "first i want to map all to code there cannot be any hardcoding, thats part 1 of plan"
**Rationale**: Production deployability — hardcoded preprod URLs would silently call wrong servers.
**Locks**: All `os.getenv("X", "default")` patterns replaced with `os.environ['X']`. Any new env variable must be added to `.env` first.

### 2026-06-18 [CR-027] §safety — CAMPAIGN_SCHEDULER_ENABLED keeps false fallback
**Decision**: `CAMPAIGN_SCHEDULER_ENABLED` is the only variable that retains a `"false"` safety fallback. All other variables fail-fast if missing.
**Source**: Owner: "yes CAMPAIGN_SCHEDULER_ENABLED keep false"
**Rationale**: Accidentally enabling campaign auto-fire would blast WhatsApp messages to real customers.
**Locks**: `os.environ.get("CAMPAIGN_SCHEDULER_ENABLED", "false")` — the only allowed fallback in the codebase.

### 2026-06-18 [project] §testing — Re-enable testing_agent_v3
**Decision**: `testing_agent_v3` is now permitted for QA of un-QA'd CRs (CR-014, CR-023, CR-024, CR-027).
**Source**: Owner: "1" (chose option 1: reverse the opt-out decision)
**Rationale**: 9 CRs have no formal QA. Implementation reports with acceptance criteria now exist. QA agent can validate.
**Reverses**: 2026-05-28 [project] §testing — testing_agent_v3 opt-out
**Locks**: Testing agent may be called for QA validation. Still must not send live WhatsApp messages or run destructive DB operations.

---

## 2026-07-01 — Session decisions

### 2026-07-01 [CR-032] §scope — Introduce CRM Template Builder feature flag (self-service)
**Decision**: Add a per-tenant boolean `features.crm_templates_enabled` on the `users` collection. Default `false` for new tenants. When off, hide the CRM Templates section on TemplatesPage, the "Add Template" button, the "Set Labels" affordance, and the `/template-builder` route.
**Source**: Owner: "in which restaurant CRM template will come shd be configuartion , in setting by default for every one ... coz CRM template is used by only 1 restuarnt right now"
**Rationale**: 22 of 28 tenants (79%) have no custom_templates and don't need to see the CRM section. Hiding it removes visual noise for the majority and reduces exposure to the 5 filter defects documented in INV-002. Backend send path (Freshmarketer webhook, DirectSend) stays flag-independent so no service disruption for existing users.
**Locks**: New field on `users` collection (schema-less, MongoDB). Zero hotspot files touched. Send pipeline unchanged.

### 2026-07-01 [CR-032] §governance — Flag is self-service via Settings page
**Decision**: Each restaurant owner can toggle the flag themselves from Settings — no admin-only gate, no support ticket flow.
**Source**: Owner: "(a) Any restaurant owner can toggle it in their own Settings page (self-service)"
**Rationale**: Marginal build cost over admin-only (~1 hour); eliminates future enablement support burden; Settings placement also acts as feature discovery.
**Locks**: `PATCH /api/settings/features` endpoint accepts self-mutation of the caller's own tenant flag only (must filter by `user_id` from JWT).

### 2026-07-01 [CR-032] §rollout — Auto-enable existing 6 tenants during backfill
**Decision**: All 6 tenants that already have at least one document in `custom_templates` will be set `features.crm_templates_enabled=true` as part of the deploy backfill. New tenants receive `false`.
**Source**: Agent recommendation accepted implicitly by owner focusing on "no user impact" outcome.
**Rationale**: Zero regression for the 6 users currently building templates. Removes need for support tickets on day one.
**Locks**: One-time idempotent script against remote MongoDB. Must be logged in the release report.

### 2026-07-01 [CR-031] §scope — Defer TemplatesPage tab restructure
**Decision**: The tab-based restructure of TemplatesPage (CR-031, planned in `discovery/CR_031_TEMPLATES_PAGE_TAB_RESTRUCTURE_DISCOVERY_AND_PLAN.md`) is parked. Revisit when adoption of the feature flag grows past the current 6 tenants, or when the filter defects (INV-002 BUG-A through BUG-E) escalate for those users.
**Source**: Owner: "if we do this then cr 31 can be done later coz CRM template is used by only 1 restuarnt right now"
**Rationale**: CR-032 hides the buggy view from 79% of tenants; the tab work becomes a nice-to-have refinement instead of urgent bug fix.
**Locks**: CR-031 stays registered but status changes to `⏸ Deferred — awaits CR-032 ship + adoption`. INV-002 findings remain valid documentation.

### 2026-07-01 [CR-033] §scope — Enumerate additional audience filters as its own CR
**Decision**: Split "more filters" and "tag system" into two independent CRs. CR-033 = additional filter dimensions on top of today's 14. CR-034 = free-form user-defined tag system with tag-based audience filter. Both run in parallel; neither blocks the other.
**Source**: Owner: "these are two different CRs probably" (2026-07-01 chat after INV-003 review).
**Rationale**: Filter additions are read-side-only work in `build_customer_query` + UI. Tag system requires new schema field, new endpoints, bulk actions, and a new UI pattern. Different risk profile and different owners on each PR.
**Locks**: CR-033 scope = filter dimension additions only. CR-034 scope = tag system only.

### 2026-07-01 [CR-034] §scope — Use INV-003 Approach A (embedded tags + per-tenant catalog)
**Decision**: Customer tags will be stored as `Customer.tags: List[str]` (free-form strings) with a per-tenant catalog in `users.available_tags: List[str]`. Approach B (normalised `customer_tags` collection with colour/metadata) deferred.
**Source**: Owner: "we need a way to add a tag, and then tag can be attached to any customer" (2026-07-01 chat) — accepted the simpler shipping model implicitly by focusing on the MVP outcome.
**Rationale**: Faster ship (~8-10 hrs vs ~2 days for B), no new collection, uses MongoDB's schema-less flexibility. Metadata (colours) can be added later without breaking migration.
**Locks**: Data model shape is now A. Any future colour/description feature will migrate to B in a follow-up CR.

### 2026-07-01 [CR-033] §scope — Ship all phases together (P0 + P1 + cheap P2)
**Decision**: CR-033 will ship Phase 1 (P0 bug-A fixes) + Phase 2 (P1 quick-win filters) + Phase 3 (cheap P2 cross-join filters) as a single delivery. Expensive P2 (cached order fields) deferred to a future CR.
**Source**: Owner: "Q1 together" (2026-07-01 mockup review).
**Rationale**: All three phases touch the same file (`build_customer_query`) and the same UI (`AudiencesPage`). Single delivery reduces integration risk and gives more immediate value.
**Locks**: CR-033 scope = 20 filters across 5 sections. Expensive P2 (last_order_date, avg_order_value, order_type, payment_method) remains out of scope.

### 2026-07-01 [CR-033] §design — AND/OR combinator: multi-select within filter = OR, cross-filter = AND
**Decision**: Within a single filter dimension, selecting multiple values uses OR semantics (e.g. Tier = Gold OR Silver). Across different filter dimensions, the combination is always AND (e.g. Tier AND LastVisit). No combinator UI toggle needed. This matches how Mailchimp, Wati, and Interakt work.
**Source**: Owner: "2 as recommended" (2026-07-01 mockup review, Q2 response).
**Rationale**: Simplest UX — no toggle widget, no query complexity added. Already how MongoDB `$in` works. Familiar to users of mainstream CRM tools.
**Locks**: `build_customer_query()` uses `$in` for multi-select keys (OR within dimension) and parallel top-level keys (AND across dimensions). No cross-dimension OR support in this CR.

### 2026-07-01 [CR-033] §ux — Filter UI: wider Dialog (max-w-2xl) with collapsible accordion sections
**Decision**: The audience builder dialog expands from `max-w-lg` to `max-w-2xl`. Filters are grouped into 5 collapsible accordion sections (Loyalty & Tier, Dates & Occasions, WhatsApp & Engagement, Customer Flags, Tags). Active filters shown as dismissible chips at the top of the dialog. "Loyalty & Tier" and "Dates & Occasions" open by default; others collapsed.
**Source**: Owner: "3 proposed" (2026-07-01 mockup review, Q3 response).
**Rationale**: Keeps the existing Dialog modal pattern (no new Sheet/drawer). Accordion prevents scroll overload. Active-filter chips give instant visibility of what's applied.
**Locks**: AudiencesPage `Dialog` component stays as the audience builder container. Filter grouping follows the 5-section structure from the mockup. No Sheet/drawer to be introduced for this feature.

### 2026-07-01 [CR-033] §scope — All 20 filters approved as shown in mockup
**Decision**: All 20 filter dimensions shown in the CR-033 + CR-034 mockup are approved. 5 BUG-A/P0 fixes + 12 P1 new filters + 3 P2 cross-join (WA logs) + 2 CR-034 tag filters. No filter removed or re-prioritised from the Q4 table.
**Source**: Owner: "4 ok" (2026-07-01 mockup review, Q4 response).
**Rationale**: All filters have data on the live DB (except P3 deferred set). P2 cross-joins are cheap (WhatsApp logs, already indexed).
**Locks**: Filter list is frozen at 20 dimensions across 5 sections. Any additions must be a new CR or amendment.

---

## 2026-07-03 — Session decisions (batch intake → planning → INV-005 → planning)

### 2026-07-03 [CR-042] §scope — Message report download · scope frozen
**Decision**: Ship both entry-points (MessageStatusPage filter-aware + CampaignHistoryPage per-run row), both formats (CSV + XLSX using CR-035 dropdown pattern), 12 fields (sent_at, phone, name, event_or_campaign, template, status, delivered_at, read_at, rejected_at, error_reason, message_id, is_test), 5000-row cap matching CR-035.
**Source**: Owner: "q1 both / q2 both / q3 show proposed field / q4 5000" (2026-07-03 intake answers). Later "1 freeze" (mockup review).
**Rationale**: Owner needs reconciliation and stakeholder reporting; both entry-points cover both mental models (per-run drill-down + full filter export). Row cap matches existing pattern.
**Locks**: 12 columns and 5000 row cap frozen; changes require new CR.

### 2026-07-03 [BUG-009] §fix — Details button uses deep-link (option a)
**Decision**: Details button on CampaignHistoryPage navigates to `/messages?campaign_id=X&run_id=Y` extending CR-026 URL scheme. MessageStatusPage shows a contextual green banner "🎯 Filtered to run: <name>" when landing with `run_id`. No modal, no dedicated CampaignRunDetailPage.
**Source**: Owner: "2 ok" (2026-07-03 mockup review, accepting Planning recommendation of option (a) with banner).
**Rationale**: Cheapest fix, reuses CR-026 plumbing, matches existing UX. Banner makes run-scope explicit without cluttering the base page.
**Locks**: Details button = deep-link only. Modal / dedicated page options rejected.

### 2026-07-03 [CR-043-A] §scope — Filter for Customer tags = Option C (hybrid chip strip + panel)
**Decision**: Add a compact tag chip strip above the existing filter block on CustomersPage. Chips show top-6 tags by customer count (e.g. `[+ VIP (156)]`), with "More ▾" expanding to full catalog. Active tags shown as dismissible chips + ANY/ALL toggle mirroring AudiencesPage. Backend `/customers` list endpoint gains `tags` (comma-sep) + `tags_mode` (any|all) query params. New `GET /customers/tags?with_counts=true` returns tenant's catalog sorted by customer count.
**Source**: Owner: "1 C" (2026-07-03 CR-043 option review). Recommended by Planning as best UX × functionality combo.
**Rationale**: Hybrid gives both discovery (visible chip strip) and completeness (multi-select in panel). Usage counts turn the strip into a decision-support tool.
**Locks**: CustomersPage only in this CR. Tag filter on MessageStatusPage / other surfaces deferred to future CR (still not registered).

### 2026-07-03 [CR-043-B] §ux — Popover UX = Option C (polished multi-select + autosave, no bulk-apply)
**Decision**: Rework the inline `+ tag` popover on CustomersPage to be a 280px-wide, multi-select popover with autosave per checkbox toggle. Shows customer's current tags as dismissible chips at top; available tags listed with checkboxes + customer counts; inline "Create new tag" affordance appears when search input matches nothing. Single dismiss button ("Done"). Bulk-apply-to-multiple-rows is EXPLICITLY OUT of scope for CR-043 — will be tracked as CR-045 (parked).
**Source**: Owner: "2 ok" (2026-07-03 CR-043 option review). Recommended by Planning as best UX × functionality without scope creep.
**Rationale**: Multi-select is a huge productivity win. Autosave eliminates "did it save?" anxiety. Bulk-apply requires row-selection column which doesn't exist — belongs in its own CR.
**Locks**: Bulk-apply excluded from CR-043; belongs to CR-045.

### 2026-07-03 [CR-045] §register — Parked
**Decision**: Register CR-045 "Bulk actions on customers (bulk-tag, bulk-delete, bulk-export, bulk-message)" in the dashboard with status `⏸ PARKED — pending owner promotion`. Not active work; no discovery / planning until owner promotes.
**Source**: Owner asked "CR-045 register-now or park" as an open question; Planning recommendation: park (safest default — preserves the option cleanly without adding backlog noise). Owner directive was "just update decisions and docs" which I'm reading as "make the call and record it".
**Rationale**: Bulk-apply requires row-selection UI + backend bulk endpoints + confirmation dialogs — a whole feature, not a follow-up. Parking (not deleting) preserves the traceability that this scope was consciously split off from CR-043.
**Locks**: CR-045 dormant; can be promoted at any time with a "please activate CR-045" message.

### 2026-07-03 [INV-005] §finding — Approved media templates fail at send-time (not just approval)
**Decision**: Owner's report is confirmed by code trace. `routers/campaigns.py` never passes `media_url` to `WhatsAppMessage()` in any of 3 send paths (lines 274, 512, 796). AuthKey `sendBulkSMS.php` requires `headerValues.headerData` per-send; without it, message accepted by AuthKey but dropped by Meta at fulfilment. Explains the `premium_lunch_menu_new1` symptom (2 sent, 0 delivered, 0 failed, 0.0% delivery rate).
**Source**: Owner: "CR-036 but exported templates are failing coz header is not going is that case investigated" (2026-07-03).
**Rationale**: Two independent gaps: (a) template approval broken because we send URL where Meta wants opaque handle, (b) template delivery broken because campaigns don't attach media per-send. Both must be fixed for media templates to work end-to-end.
**Locks**: CR-036 scope expanded to Part 1 (approval, original) + Part 2 (delivery, new). Report: `discovery/INV_005_CAMPAIGN_MEDIA_SEND_GAP.md`.

### 2026-07-03 [CR-036] §scope — Expanded to Part 1 + Part 2
**Decision**: CR-036 now covers both template approval fix and send-time media delivery. Part 1 = original scope (new `POST /whatsapp/upload-media-header` endpoint + file picker in Template Builder + Meta `header_handle` in template submission). Part 2 = INV-005 fix (persist a delivery URL per template + campaign send paths look it up + fallback logging). Estimated effort revised from ~5.5 hr → ~10-12 hr. Risk revised from MEDIUM → MEDIUM-HIGH.
**Source**: INV-005 owner directive to fix delivery gap alongside approval gap.
**Locks**: CR-036 ships as single change covering approval + delivery. Splitting into two separate CRs rejected.

### 2026-07-03 [CR-036] §q1 — Media types supported = image + video + document + audio
**Decision**: Template Builder supports all four Meta v21 header media types.
**Source**: Owner: "as per meta standard we have been following that in template builder" (2026-07-03) — Planning interpreted as "match Meta v21 spec". Planning also recommended YES for audio inclusion.
**Locks**: Header type dropdown includes 4 media options + text + none.

### 2026-07-03 [CR-036] §q2 — File size caps = Meta v21 defaults
**Decision**: Image 5MB, Video 16MB, Document 100MB, Audio 16MB (enforced client-side + server-side).
**Source**: Owner "meta standard" answer + Meta v21 published caps.
**Locks**: Any change requires new CR.

### 2026-07-03 [CR-036] §q3 — Meta submission uses pass-through handle
**Decision**: For template SUBMISSION to Meta, we upload the file to Meta `/v21.0/{WABA_ID}/uploads`, receive an opaque `handle` string (~30d validity), pass it in `example.header_handle`. No permanent Meta-side storage on CRM.
**Source**: Owner "meta standard" answer.
**Locks**: `header_handle` field on `custom_templates` stores the Meta handle; used ONLY for template approval, NOT for delivery.

### 2026-07-03 [CR-036] §q5 — Missing Meta credentials → block-early UX
**Decision**: If tenant lacks `meta_waba_id` or `meta_access_token`, the Template Builder blocks the file picker with a banner "Configure Meta API first (Settings > WhatsApp > Meta API)". No inline toast after-the-fact.
**Source**: Owner "block early" answer to Planning Q5.
**Locks**: File picker on TemplateBuilderPage checks credential presence before enabling.

### 2026-07-03 [CR-036] §q6 — Delivery URL storage = Amazon S3
**Decision**: The publicly accessible delivery URL for media header assets is served from Amazon S3. Upload flow uploads once to (a) Meta `/uploads` (for approval handle) AND (b) S3 (for delivery URL); both are stored on the `custom_templates` record as `header_handle` and `send_media_url` respectively.
**Source**: Owner: "we will use amazon s3" (2026-07-03).
**Rationale**: S3 provides scalable, durable, publicly-accessible HTTPS URLs with valid certs — meets Meta's fetch requirements. Owner explicitly chose S3 over GridFS / disk-PV / Meta-download options. `boto3` is already in `requirements.txt`.
**Locks**: Object storage = Amazon S3. Not GridFS. Not local disk. New CR required to change.
**Follow-up needed**: S3 bucket name, AWS access key ID, AWS secret access key, AWS region — owner to supply at Implementation gate. Bucket must allow public-read on uploaded objects (or use signed URLs with sufficient TTL for Meta's fetch window).

### 2026-07-03 [CR-036] §q7 — Missing send_media_url = silent-degrade + log warning
**Decision**: When a campaign sends a media template that lacks `send_media_url` on the template record (e.g. legacy imported templates before tenant re-uploads), send proceeds with text-only payload (no `headerValues`) AND `whatsapp_message_logs` row is tagged with a warning (e.g. `status_note: "media_missing"` or extra logs field). Templates page shows a "re-upload required" banner on affected templates.
**Source**: Owner: "q7 a" (2026-07-03) — chose silent-degrade + log warning option.
**Locks**: No hard-blocking of sends. No auto-fetch-from-Meta fallback.

### 2026-07-03 [CR-036] §q8 — Hotspot approval APPROVED for both files
**Decision**: Owner explicitly approves modifying `routers/whatsapp.py` (template creation section, ~460-540 + new upload endpoint) AND `routers/campaigns.py` (all 3 send paths — normal, test, resend-failed — additive `media_url` argument to `WhatsAppMessage()` constructor). Send semantics NOT changed for text-only templates.
**Source**: Owner: "q8 approved" (2026-07-03).
**Rationale**: Both files are on the CRM HIGH-risk list per §5. Change is additive (opt-in field); text-only sends behave identically; regression risk limited to media templates.
**Locks**: Owner-approval-on-file entry for both files, scoped to CR-036. Any subsequent CR touching these files still needs its own approval per §CRM-SPECIFIC OWNER APPROVAL.
**Timing**: Owner clarified "to be flaged after detailed implementation planning" — approval is granted now, formal hotspot flag will appear in the detailed Implementation Plan doc when it's authored.

### 2026-07-04 [CR-036] §scope-amendment — Bundle bill-logo + invoices into CR-036
**Decision**: Following INV-006 file-upload surface audit, owner chose to ship all 3 S3-migration surfaces as ONE big CR (not 3 separate CRs). CR-036 scope expands from `media headers only` → `media headers + bill logo + invoice HTML/PDF`. Amendment naming: **keep CR-036 number** with a scope-amendment addendum doc (not new CR-048).
**Source**: Owner: "1 ship as one big CR" + "1 a" (2026-07-04, in response to INV-006 §6 Q1 + amendment-naming Q1).
**Rationale**: All 3 surfaces share the same S3 client (`core/s3.py`), same bucket, same IAM credentials, same env vars. Splitting into 3 CRs would triple documentation overhead. Single CR gives owner one review cycle. Effort estimate ~10-12 hr → ~16-20 hr.
**Locks**: CR-036 amended. CR-046 and CR-047 (proposed in INV-006 §3) NOT registered — they are folded into CR-036. Amendment doc: `planning/CR_036_SCOPE_AMENDMENT_2026_07_04.md`.

### 2026-07-04 [CR-036] §q9 — Existing bill logos on disk = dual-mode, no backfill
**Decision**: When CR-036 ships, existing bill logos in `/app/data/logos/{user_id}.*` STAY served via the current `GET /api/auth/profile/logo/{user_id}` fallback endpoint. Only NEW uploads go to S3. Tenants must voluntarily re-upload to move their logo to S3. No migration script.
**Source**: Owner: "9. no back fill needed we will have to keep showing from local disk also until client re uploads" (2026-07-04).
**Rationale**: Zero-risk rollout — existing tenants see no change. Ephemeral-disk risk (pod-restart wipes logos) accepted as trade-off; tenants can re-upload if their logo disappears.
**Locks**: `serve_profile_logo` endpoint at `routers/auth.py:280-292` REMAINS in codebase indefinitely. `bill_logo_url` field on `users` is dual-format: either `"/api/auth/profile/logo/{user_id}"` (legacy) or `"https://{bucket}.s3.{region}.amazonaws.com/bill-logos/{user_id}.{ext}"` (new). Both must be rendered correctly by any consumer (invoice HTML template, ProfilePage preview).

### 2026-07-04 [CR-036] §q10 — Existing invoices on disk = no backfill, accept 404 risk
**Decision**: Invoices already written to `/app/data/invoices/{token}/` STAY on local disk. `GET /api/invoices/{token}` and `GET /api/invoices/{token}/pdf` endpoints continue to read from local disk as fallback. Any pod restart WILL 404 old invoice WhatsApp links — owner accepts this risk. New invoices (post-ship) write to S3.
**Source**: Owner: "10. no backfill" (2026-07-04).
**Rationale**: Backfill for invoices is expensive (re-render PDFs, upload thousands of tokens, potential GST-audit-trail confusion). Owner explicitly accepts 404 risk on legacy invoices. New invoices are durable.
**Locks**: Serve endpoints in `routers/invoices.py` use dual-mode: (1) HEAD S3 for token → if 200, 302 redirect to public S3 URL; (2) else read from local disk; (3) else 404. `services/invoice_generator.py` write points all switch to S3.

### 2026-07-04 [CR-036] §q11 — WeasyPrint base_url = HTTPS S3 approved
**Decision**: When PDF is generated on-the-fly at `services/invoice_generator.py:658`, the `base_url` passed to WeasyPrint changes from `str(invoice_dir)` (local path) → the full HTTPS S3 URL for the invoice folder (`https://{bucket}.s3.{region}.amazonaws.com/invoices/{token}/`). WeasyPrint will fetch the bill logo and any relative CSS/assets over HTTPS on each PDF generation.
**Source**: Owner: "11 ok" (2026-07-04).
**Rationale**: When bill logo migrates to S3 (Q9 for new re-uploads), the invoice HTML template references an absolute HTTPS URL that WeasyPrint must be able to fetch. HTTPS `base_url` is the cleanest solution. Marginal PDF-generation latency (~200ms one-time fetch, then cached by WeasyPrint).
**Locks**: WeasyPrint may fetch external HTTPS assets during PDF generation. If S3 unreachable during PDF gen, PDF will fail — acceptable failure mode (return 503 to client).

### 2026-07-04 [CR-036] §q12 — Hotspot approval APPROVED for 3 additional files
**Decision**: Owner approves modifying (in addition to already-approved `routers/whatsapp.py` and `routers/campaigns.py` from Q8):
- `routers/auth.py` — upload endpoint switches to S3 (line 262-278, ~30 LOC), serve endpoint kept as fallback (line 280-292, unchanged).
- `services/invoice_generator.py` — 3 write points switched to S3 (line 380, 564, 633) + WeasyPrint base_url change (line 658). ~40 LOC.
- `routers/invoices.py` — 2 serve endpoints get dual-mode S3-first-then-local fallback (line 18, 38). ~25 LOC.
**Source**: Owner: "A" (2026-07-04, in response to Q12 spelled-out change matrix).
**Rationale**: All 3 files are on the CRM HIGH-risk list. Changes are additive/dual-mode; legacy behavior preserved for backwards compat (Q9 + Q10). No schema migration.
**Locks**: Owner-approval-on-file entry for `routers/auth.py`, `services/invoice_generator.py`, `routers/invoices.py`, scoped to CR-036 only. Any subsequent CR touching these files needs its own approval. Amendment doc `planning/CR_036_SCOPE_AMENDMENT_2026_07_04.md` is the authoritative reference for hotspot line-ranges.

---

**End of decisions log.**
