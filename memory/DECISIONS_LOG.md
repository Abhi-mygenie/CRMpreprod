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

---

## How to add a new decision

1. Append a new `### YYYY-MM-DD [CR-XXX] §<section> — <title>` block at the bottom of the appropriate session group.
2. If creating a new session group, add it as a `## YYYY-MM-DD — Session decisions` heading.
3. Include verbatim source quote (or close paraphrase) — this is the audit trail.
4. If the decision reverses an earlier one, add a `**Reverses**:` line linking to the older decision title.

---

**End of decisions log.**
