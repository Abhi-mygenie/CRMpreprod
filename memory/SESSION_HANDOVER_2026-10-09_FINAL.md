# SESSION HANDOVER — 2026-10-09 · FINAL

**Authoritative. Supersedes every other `SESSION_HANDOVER_2026-10-09_*.md` (keep them; they are earlier drafts of this one) and `SESSION_HANDOVER_2026-10-08_TIER1_SHIPPED_IDENTITY_PIVOT.md`.**

**Next agent — do exactly this on your first turn, then stop:**
1. Tell the owner §1 **as one flowing story**, in order, plain English. Keep the "this happened, then this" sequence; do not compress to bullets.
2. Present §2 — what is left — in its three buckets.
3. Propose §3 — the priority order — and **stop. Boot no role.** Wait for the owner's exact phrase.

**Owner profile:** English. Short imperative messages ("option a", "1 and 2 only", "me", "Gate 3 accepted for …"). Frequently asks "explain in plain English" — answer in prose, not tables, when asked that way. **Holds gates deliberately**: ruled D1–D3 then said "don't jump gate"; opened Gate 3 separately 20 minutes later. Implement only on the exact phrase `Gate 3 accepted for <ID>`, never on intent. Asks "is the handover updated?" — keep this file current before ending.

---

## 1. The story of the session, in order

**It began as a status check.** The session was forked from the 7–8 Oct wave with six shipped items sitting at owner smoke. The owner asked whether there was anything to work on or whether we were waiting on CRM. The agent laid out the four CRM-blocked items (CR-094 loyalty-rules returning 404, CR-095, CR-098 prod stability, CR-096) and the two owner-only items (smoke tests, CA-1 countersign).

**Then the owner asked about "the single smoke-test PDF we maintain."** There wasn't one — the convention was one PDF per item. The audit also found a process miss from the previous session: **CR-2026-10-07-002 (OTP permanent deletion) had passed QA but had no smoke brief**, so it could not legitimately be at SMOKE. The owner chose "1 and 2 only": write the missing brief and build a consolidated PDF, but don't codify the convention. Done — `CR-2026-10-07-002/SMOKE_BRIEF.md/.pdf`, and a new tool `memory/tools/smoke_briefs_all.py` producing `memory/SMOKE_BRIEFS_ALL_<date>.pdf` with a cover index and bookmarks.

**Then CRM's first reply of the day landed.** The owner pasted it: our 10-09 validations accepted (CR-098, 093, 089, 085-A, CA-3, CA-6, CA-7); CRM's **CR-102** shipped (skip-otp honours `country_code`, limiter tweaks); and **four items bounced back** — CA-2 "cutover date", CA-4 four collection names, CA-5 four unclaimed collections, CA-8 "steps 2–3 date". The agent checked CR-102 against our code: already compliant, nothing to change. Filed at `inbox/CRM_REPLY_VALIDATIONS_ACCEPTED_CR102_2026-10-09.md`.

**Then a wrong premise was caught.** The seed handoff — and the agent's own first reply — framed CA-2/CA-8 as "migrate our config and dietary-tag reads from Mongo to the CRM API." The 3 Oct ownership board says the opposite: **`customer_app_config` and `dietary_tags_mapping` are Customer-App-owned**; our backend reading them directly is correct. CRM's **CR-095** is CRM deleting *their own* four orphan routes (`GET/PUT /scan/config/{rid}`, `GET/PUT /scan/menu/dietary-tags/{rid}`) that nobody ever called. CA-2 and CA-8 were the same question twice — "when are you done with your cleanup so we can run CR-095?" — because in September CRM had put CR-095 last in a 4-step sequence even though we'd told them we had no caller. CA-4 and CA-5 were answerable from the 3 Oct reconciliation (CRM's CA-5 guess was wrong). The owner asked to be walked through CR-095 in plain English; the agent did.

**Then the owner asked for Planning on CR-095 — and the agent declined, correctly.** CR-095 is a CRM registry ID; ours had no counterpart, and the control prompt forbids work without a registered ID. The owner chose "register first." Role 1 created **CR-2026-10-09-001** — our side of CR-095: confirm zero callers, rule on the sequencing gate, verify after removal, countersign ownership-map §4d. Code reality: 0 callers across frontend/backend/tests; UAT `customer_app_config` 13 docs all short-form rid, `dietary_tags_mapping` 0. Registry 90 → 91.

**Then the owner ruled D1 = option 1: release CRM from the gate.** Holding CR-095 behind our steps 2–3 protected nothing and kept a back door into our data open longer. Role 2 wrote IA + IP (three phases: confirm → verify after removal → sign §4d). Owner: "Gate 3 accepted." Role 3 ran Phase 1 — pre-flight, baseline, and **`CONFIRMATION_NOTE_TO_CRM.md`** answering CA-2/4/5/8 in one message, pasted in chat. Owner then ruled **D3 = "me"**: the owner signs the §4d row personally; the agent only prepares the text. CR-2026-10-09-001 → IMPLEMENTATION; Phase 2 waits for CRM to say "CR-095 shipped."

**Then two side questions.** "Did any CR change UI?" — none this session; in the 7–9 Oct wave four of six did (Feedback sign-in card, no password page, Profile tabs on CRM v2 with Wallet hidden when off, admin Visibility minus OTP section). "Show me the Feedback UI" — screenshotted both states on 478; matched the brief.

**Then "so now we wait for CRM?" — No.** Two registered CRs needed nobody: **CR-2026-10-03-001** (delete the dead customer-API shim from `server.py`) and CR-2026-09-15-004 (admin login → POS). Owner chose Planning for CR-2026-10-03-001.

**Then the main engineering work: CR-2026-10-03-001 end to end.** Role 2 re-verified the 3 Oct intake against the live file — its line numbers were stale, so everything was re-derived by function name: 13 CRM-collection touches across 9 routes/branches (customer branch of `/auth/login`, customer branch of `get_current_user`, `set-password`, `verify-password`, six `/api/customer/*` routes), zero frontend callers, plus the empty `customer_router` and six orphaned models (one, `ResetPasswordRequest`, left behind by the OTP deletion). Plain-English plan and risks given on request; three decisions walked through. Owner ruled **D1 (a) delete outright · D2 (a) trim the login model fields · D3 (a) backend-only** and said "update docs and decision, don't jump gate." Done; the dead `AuthContext.login()` deletion was handed to CR-2026-09-15-004's notes. Owner asked "is line-by-line planning done?" — honest answer *no, function-level* — so **Appendix A** was added: 15 exact ranges with verbatim anchors, pinned to the file's md5, applied bottom-up, plus 12 "must survive" anchors. Owner chose the implementation role; agent asked for the phrase; got **"Gate 3 accepted for CR-2026-10-03-001."** Executed: pre-flight (md5 match, 14 touches, 8/8 baseline), scripted apply that aborted once on a whitespace-only blank line (harmlessly — md5-guarded), fixed, applied in one pass. **`server.py` 1,741 → 1,367 lines (−378/+5); dead-touch grep 14 → 1**; all anchors intact. New smoke test (12), full smoke 31/31, contract 14/14 with snapshots unchanged; one test made limiter-aware after a 429 from the 5/min login limit. Testing agent `iteration_8.json`: **28/28 + 61/61 regression**, no action items. QA_HANDOVER, SMOKE_BRIEF + PDF; consolidated handout regenerated to **7 items, 16 pages**. Status **SMOKE**. Only behaviour change: admin login no longer checks `customers` first — a latent wrong-token bug, now gone.

**Then housekeeping and a discovery.** Handover written (it had last been done 10-08). Smoke brief confirmed in the consolidated PDF (p. 15). CR-2026-10-03-001 explained in plain English. Then, asked "what next CR", the agent re-probed CRM and found **`GET /scan/loyalty-rules/478` → 200 — CR-094 had gone live** a day early.

**Then CRM's second note confirmed it and asked us to validate.** The owner uploaded `CRM_TO_SCAN_ORDER_CR094_CR096_LIVE_PLEASE_VALIDATE_2026_10_09.md`: **CR-094** (`/scan/loyalty-rules/{rid}`, public, 33 keys, per-tier redemption) and **CR-096** (`POST /scan/feedback` now works without a token) both live. The agent probed read-only against `REACT_APP_CRM_URL`: **all 7 CRM probes plus 4 extra edge cases PASS**, including the feedback token path with a fresh skip-otp token. One harmless deviation: no token *and* no `restaurant_id` → 422, contract says 400 (we always send rid). Written up in `inbox/VALIDATION_OF_CRM_CR094_CR096_NOTE_2026-10-09.md`.

**The honest headline: endpoints validated, but our app consumes neither yet.** Review Order still reads loyalty rules through our own back-door route; the Feedback page still shows the sign-in card. Diffing CRM's 33 keys against what our UI actually reads exposed **real gaps G1–G7** for the B+C plan. The serious ones: **G1** we use a single `redemption_value` everywhere but CRM is per-tier — on 689 a Gold diner is shown ₹1/pt yet entitled to ₹3/pt, so Silver+ diners are **under-rewarded today**; **G2** we gate the loyalty section on POS `is_loyalty` while CRM now sends `loyalty_enabled` — **owner must pick the source of truth**; **G3** we ignore `min_redemption_points` / `max_redemption_percent` / `max_redemption_amount` (689 caps at ₹110) — a diner can be shown a discount CRM won't honour. The rest are housekeeping (response wrapper adapter, our hardcoded 0.25/100 defaults vanish with Part C, only first-visit bonus may be promised — we already comply, 60/min limiter irrelevant). CRM's "remove your `POST /api/config/feedback`" was already done 7 Oct. The agent explained all this in plain language, cleared `blocked_on` for CR-2026-10-03-004 and CR-2026-10-07-001, and drafted a combined reply to CRM — validation results, dated consumer wiring, **and the CA-2/4/5/8 answers repeated** because CRM's note still listed them open (the owner hadn't yet sent the morning note).

**The session closed with "which CRs are unblocked now?"** Three: CR-2026-10-03-004 Parts B+C (by CR-094), CR-2026-10-07-001 (by CR-096), CR-2026-09-15-004 (by our own CR-2026-10-03-001 landing). The owner asked for this final handover. **No role is active.**

---

## 2. What is left

### Waiting on the owner — nobody else can move these

| # | Item | What to do |
|---|---|---|
| 1 | **Smoke 7 items** | `memory/SMOKE_BRIEFS_ALL_2026-10-08.pdf` (16 pp). BUG-2026-10-06-001 · CR-2026-10-03-003 · CR-2026-10-08-001 · CR-2026-09-15-001 · CR-2026-10-03-004 Part A · CR-2026-10-07-002 · CR-2026-10-03-001. Reply per item `Smoke PASS <ID>` / `Smoke FAIL <ID> — step N`. CRM holds formal closure of 098/093/089/094/096 on this |
| 2 | **Send the combined CRM reply** | Pasted in chat at session end (CR-094/096 validation + CA-2/4/5/8). It supersedes the morning's `CR-2026-10-09-001-…/CONFIRMATION_NOTE_TO_CRM.md` — same CA answers plus validation results. One paste |
| 3 | **CA-1** | Countersign `CONTRACT_CUSTOMER_APP_CRM_v1.0 Part 1 §1–§6` |
| 4 | **G2 decision** (needed at B+C planning) | Which flag decides whether the loyalty section shows: CRM `loyalty_enabled` (rec) or POS `is_loyalty` |
| 5 | Later: **sign §4d** on `OWNERSHIP_MAP.md` | After CR-095 Phase 2 PASS; agent prepares text, owner writes initials/date (D3) |

### Waiting on CRM

| Item | Blocker | Trigger |
|---|---|---|
| CR-2026-10-09-001 Phase 2–3 | CRM confirms CR-095 shipped | owner says **"CRM shipped CR-095"** |
| CR-2026-10-08-001 Step 2 (delete `PasswordSetup.jsx` + route) | CR-098 stable in prod one week | ~w/c 20 Oct |

### Ready for the agent — no external dependency

| Item | Status | Notes |
|---|---|---|
| **CR-2026-10-03-004 Parts B+C** (P1) | IMPLEMENTATION (Part A shipped) | Swap `ReviewOrder.jsx:145` `GET /api/loyalty-settings` → CRM `/scan/loyalty-rules`; adapter in `crmService.js` (pattern: `crmLookupCustomer`); fix G1 per-tier redemption in `LoyaltyRewardsSection.jsx:34,91` + `ReviewOrder.jsx:861,1874`; honour G3 caps in `handleUsePoints`; G2 flag per owner; delete `server.py` `loyalty-settings` route (~L971) and retire `customer-lookup` (~L1006, `ReviewOrder.jsx:418`) → dead-touch grep 1 → 0. CRITICAL by file (ReviewOrder). Gap table: `inbox/VALIDATION_OF_CRM_CR094_CR096_NOTE_2026-10-09.md` |
| **CR-2026-10-07-001** (P2) | INTAKE | Remove sign-in card `FeedbackPage.jsx:85-92`; extend `crmSubmitFeedback` (`crmService.js:376`) to no-token `{rating, restaurant_id, phone?, country_code}`; show linked/unlinked thank-you; client-side rating 1–5; 429 toast. Plan after B+C, bundle smokes |
| **CR-2026-09-15-004** | INTAKE | Admin login → POS instead of CRM `users`; also delete dead `AuthContext.login()`. Predecessor landed. **Auth → call `integration_expert` before any code.** CRM-sequence step 3 |
| Any `Smoke FAIL` | — | Pre-empts everything; Role 4/5 per control prompt |

---

## 3. Suggested priority order (present; not yet approved)

1. **Owner smoke run** — 7 coded, QA-passed items idle; CRM's formal closures wait on it. ~45 min.
2. **Send the combined CRM reply** — one paste; releases CR-095, closes CA-2/4/5/8, reports both validations.
3. **`Planning for CR-2026-10-03-004 Parts B+C`** — P1, fixes a live mis-valuation (G1), enforces CRM caps (G3), finishes CRM-sequence step 2, zeroes the boundary grep. Needs G2 ruling.
4. **`Planning for CR-2026-10-07-001`** — small, same customer-facing area; bundle its smoke with B+C's.
5. **`Planning for CR-2026-09-15-004`** — step 3, auth, larger; after the above to avoid colliding in `server.py`.
6. **On "CRM shipped CR-095"** — CR-2026-10-09-001 Phase 2 verify, then prepare §4d text for the owner.
7. Everything else in the registry is older architecture backlog — raise only if asked.

---

## 4. Rulings made this session — do NOT re-ask

| Ref | Ruling |
|---|---|
| CR-2026-10-09-001 D1 | **(i)** release CRM from the 4-step gate; CR-095 ships independent of our steps 2–3 |
| CR-2026-10-09-001 D2 | default (a): 404 probe ×4 + contract tests + doc counts |
| CR-2026-10-09-001 D3 | **owner signs §4d personally**; agent prepares text only |
| CR-2026-10-03-001 D1 | (a) delete outright — **done** |
| CR-2026-10-03-001 D2 | (a) trim `LoginRequest.restaurant_id/pos_id`, `LoginResponse.restaurant_context` — **done** |
| CR-2026-10-03-001 D3 | (a) backend-only; `AuthContext.login()` → CR-2026-09-15-004 |
| Smoke PDFs | per-item PDF is source of truth; consolidated PDF is convenience only (owner declined to codify) |
| Ownership | `customer_app_config` / `dietary_tags_mapping` are **ours**; never propose migrating their reads to CRM |
| From 10-08, still binding | OTP never returns · `skip-otp` single identity path · always send `country_code: '+91'` · no direct Mongo read where a CRM endpoint exists |

---

## 5. Reference index

- Control prompt: `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`
- Registry: `memory/change_requests/index.yml` — **91 items** · validate `python3 -c "import yaml;yaml.safe_load(open('memory/change_requests/index.yml'))"`
- CR folders this session: `CR-2026-10-09-001-crm-cr-095-readiness-and-ownership-signoff/` (INTAKE · IA · IP · CONFIRMATION_NOTE_TO_CRM) · `CR-2026-10-03-001-delete-dead-crm-table-call-sites/` (INTAKE · IA · IP + Appendix A · QA_HANDOVER · SMOKE_BRIEF.md/.pdf)
- Inbox this session: `CRM_REPLY_VALIDATIONS_ACCEPTED_CR102_2026-10-09.md` · `CRM_TO_SCAN_ORDER_CR094_CR096_LIVE_PLEASE_VALIDATE_2026_10_09.md` · `VALIDATION_OF_CRM_CR094_CR096_NOTE_2026-10-09.md` (**G1–G7 gap table**)
- Smoke handout: `memory/SMOKE_BRIEFS_ALL_2026-10-08.pdf` · regenerate: `rm memory/SMOKE_BRIEFS_ALL_*.pdf && python3 memory/tools/smoke_briefs_all.py` (edit ORDER list in the script for new IDs; needs `pip install pypdf`)
- Test report: `test_reports/iteration_8.json` (CR-2026-10-03-001); 1–7 earlier CRs
- Tests: `pytest -m smoke -n 0 backend/tests/smoke/ -q` (47) · `pytest -m contract -n 0 backend/tests/contracts/ -q` (14)
- Credentials: `memory/test_credentials.md`; admin also in `backend/tests/conftest.py` (`ADMIN_PHONE` / `ADMIN_PASS`)
- Ownership map (DRAFT; §4d pending): `INV-2026-09-15-002-shared-db-collection-ownership-map/OWNERSHIP_MAP.md`
- CRM 4-step sequence source: `INV-2026-09-15-003-…/crm_replies/INV_022_CRM_REPLY_TO_CUSTOMER_APP_ROUND2.md` L20–25
- Frozen CRM contracts for B+C and 10-07-001: the CR-094/096 note above (33 keys, feedback cases A–F)

## 6. Environment notes

- Preview = `REACT_APP_BACKEND_URL`; CRM = `REACT_APP_CRM_URL` (= `crm-preprod-7.preview…/api`, the base CRM's notes cite). Ignore URLs in older handovers.
- `/api/auth/login` rate-limited **5/min**; CRM `skip-otp` 5/5 min per phone; `loyalty-rules` 60/min IP; feedback no-token 10/min IP + 3/10 min per phone+restaurant. A 429 in tests is the limiter.
- `backend/server.py` is **1,367 lines**; older docs quoting line numbers are stale. For hotspot edits reuse the Appendix A pattern (md5 pin · verbatim anchors · bottom-up · survive-list).
- Probes this session left 5 "validation probe" feedback rows on CRM preview (689/478) — informational.
- `pypdf` installed in-pod only; deliberately not in `requirements.txt`.
- Platform auto-commits; never `git reset`; owner uses rollback.

## 7. Mistakes this session — don't repeat

- Inherited and briefly repeated a wrong premise ("migrate config reads to CRM API"). Check the ownership board before stating who owns a collection.
- Appendix A anchors assumed truly empty lines; file had whitespace-only lines → first apply aborted. Use `strip() == ""`.
- Re-ran a login test within a minute → 429. Sequence test runs around limiters.
- Implied "line-by-line planning done" when it was function-level. When the owner asks for a specific level of detail, verify before confirming.
- Handover was written, then went stale within the hour when CRM's note arrived. Rewrite it as the very last act of a session, not mid-way.
