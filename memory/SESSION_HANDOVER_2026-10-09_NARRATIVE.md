# SESSION HANDOVER — 2026-10-09 · narrative edition (rev 2 — includes CR-094/096 validation)

**DRAFT — superseded by `SESSION_HANDOVER_2026-10-09_FINAL.md`. Read that instead.**

**Instruction to the next agent — read this first, then do exactly this on your first turn:**
1. Tell the owner the story in §1 **in one flow**, in plain English, in order — "this happened, then this, then this". Do not summarise into bullet soup; keep the sequence.
2. Then present §2 — what is left, split into *waiting on owner* / *waiting on CRM* / *ready for agent*.
3. Then propose §3 — the priority order — and **stop**. Boot no role. Wait for the owner's phrase.

Owner language: English. Owner style: short imperative messages ("option a", "do 1 and 2 only", "Gate 3 accepted for …"), asks for plain-English explanations often, and **holds gates deliberately** — on 10-09 the owner said "don't jump gate" after ruling D1–D3, then opened Gate 3 separately 20 minutes later. Never implement on intent; only on the exact phrase.

---

## 1. The story of this session, in order

**It started as a status question.** The session was forked from the 7–8 Oct wave with six shipped items awaiting the owner's smoke test. The owner asked "is there something we can work on or do we wait for CRM — summarise where we stand". The agent laid out the four items blocked on CRM (CR-094 loyalty-rules 404, CR-095, CR-098 stability, CR-096) and the two things only the owner could do (smoke tests, CA-1 countersign).

**Then the owner asked about the single smoke-test PDF.** The owner believed one consolidated PDF was being maintained. It wasn't — the convention was one `SMOKE_BRIEF.pdf` per item. Worse, the audit found that **CR-2026-10-07-002 (OTP permanent deletion) had passed QA but had no smoke brief at all** — a process miss from the previous session that technically meant it could not move to SMOKE. The owner chose "1 and 2 only": write the missing brief, and build a consolidated PDF (but not change the convention). Both done: `CR-2026-10-07-002/SMOKE_BRIEF.md/.pdf` written; new tool `memory/tools/smoke_briefs_all.py` merges every per-item PDF into `memory/SMOKE_BRIEFS_ALL_<date>.pdf` with a cover index and bookmarks. Six items, 14 pages at that point.

**Then CRM's reply landed.** The owner pasted CRM's 2026-10-09 message: all our 10-09 validations accepted (CR-098, 093, 089, 085-A, CA-3, CA-6, CA-7); a new CRM change **CR-102** shipped (skip-otp now honours `country_code`, limiter tweaks); and **four items bounced back to us** — CA-2 (a "cutover date"), CA-4 (four collection names), CA-5 (four "unclaimed" collections), CA-8 (dates for "steps 2–3"). The agent checked CR-102 against our code — already compliant, nothing to change — and filed the message at `memory/inbox/CRM_REPLY_VALIDATIONS_ACCEPTED_CR102_2026-10-09.md`.

**Then a mistake was caught and corrected.** The handoff summary that seeded this session (and the agent's first reply) framed CA-2/CA-8 as "migrate our config and dietary-tag reads from Mongo to CRM API". Reading the ownership board from 3 Oct showed that is **backwards**: `customer_app_config` and `dietary_tags_mapping` are **Customer-App-owned**; our backend reading them directly is correct. CRM's CR-095 is about CRM deleting *their* four orphan routes (`GET/PUT /scan/config/{rid}`, `GET/PUT /scan/menu/dietary-tags/{rid}`) that nobody ever called. CA-2 and CA-8 were the same question twice: "when are you done with your cleanup so we can run CR-095?" — because in September CRM chose to put CR-095 last in a 4-step sequence, even though we told them then we had no caller. CA-4 and CA-5 were answerable straight from the 3 Oct reconciliation (CRM's CA-5 guess was wrong). The owner asked to be walked through CR-095 in plain English; the agent did.

**Then the owner asked for Planning on CR-095 — and the agent refused, correctly.** CR-095 is a CRM registry ID; our registry had no counterpart, and the control prompt says no work without a registered ID. The owner picked option (a): register first. Role 1 Intake created **CR-2026-10-09-001** ("Customer App side of CRM CR-095"): confirm zero callers, rule on the sequencing gate, verify after removal, countersign ownership-map §4d. Code reality: grep for the four routes across frontend, backend and tests = 0; UAT `customer_app_config` 13 docs all short-form rid, `dietary_tags_mapping` 0 docs. Registry 90 → 91.

**Then the owner ruled D1 = option 1: release CRM from the gate.** The 4-step order protected nothing — CR-095 touches routes we never call — so holding it just kept a back door into our data open longer. Role 2 wrote the IA and IP (three phases: confirm → verify after removal → sign §4d). The owner said "Gate 3 accepted"; Role 3 ran Phase 1: pre-flight (0 callers, baseline 13/0), drafted **`CONFIRMATION_NOTE_TO_CRM.md`** answering CA-2, CA-4, CA-5 and CA-8 in one message, and pasted it in chat for the owner to send. Then the owner ruled **D3 = "me"**: the owner will sign the §4d row personally; the agent only prepares the text. CR-2026-10-09-001 now sits at IMPLEMENTATION, Phase 2 blocked until CRM says CR-095 shipped.

**Then the owner asked whether any UI had changed, and to see the Feedback page.** Answer: nothing in this session; in the 7–9 Oct wave, four of six items have something visible (Feedback page sign-in card replacing Name/Email; no password page; Profile tabs on CRM v2 with Wallet hidden when off; admin Visibility without the OTP section). The agent screenshotted the Feedback page in both states on restaurant 478 — matched the brief.

**Then the owner asked "so now we wait for CRM?" — and the agent said no.** Two registered CRs needed nothing from anyone: **CR-2026-10-03-001** (delete the dead customer-API shim from `server.py`) and CR-2026-09-15-004 (admin login → POS). The owner chose Planning for CR-2026-10-03-001.

**Then the biggest piece of work: CR-2026-10-03-001, end to end.** Role 2 re-verified the 3 Oct intake against the live file — the intake's line numbers were stale, so everything was re-derived by function name: 13 CRM-collection touches across 9 routes/branches (customer branch of `/auth/login`, customer branch of `get_current_user`, `set-password`, `verify-password`, six `/api/customer/*` routes), zero frontend callers, plus `customer_router` and six orphaned models (one, `ResetPasswordRequest`, left behind by the OTP deletion). The agent explained the plan and risks in plain English, then walked the owner through three decisions. The owner ruled **D1 (a) delete outright, D2 (a) trim the login model fields, D3 (a) backend-only** — and said "update docs and decision, don't jump gate". Docs were updated; the `AuthContext.login()` deletion was handed to CR-2026-09-15-004's notes. The owner then asked "is line-by-line planning done?" — honest answer was *no, it was function-level* — so **Appendix A** was added: 15 exact line ranges with verbatim anchors, pinned to the file's md5, applied bottom-up. The owner then chose the implementation role, the agent asked for the exact phrase, got **"Gate 3 accepted for CR-2026-10-03-001"**, and executed: pre-flight (md5 match, 14 touches, 8/8 baseline tests), a scripted apply that aborted once on a whitespace-only blank line (harmlessly — md5-guarded, file untouched), fixed, then applied in one pass. `server.py` went **1,741 → 1,367 lines (−378/+5)**; dead-touch grep **14 → 1**; all 12 "must survive" anchors intact. New smoke test (12), full smoke 31/31, contract 14/14 with snapshots unchanged; one test made limiter-aware after a 429 from the 5/min login limit. Testing agent `iteration_8.json`: 28/28 targeted + 61/61 regression, no action items. QA_HANDOVER, SMOKE_BRIEF + PDF written; consolidated handout regenerated to **7 items, 16 pages**. Status **SMOKE**. The only behaviour change: admin login no longer checks the `customers` table first — a latent wrong-token bug, now gone.

**Then housekeeping.** The owner asked whether the handover for the next agent was updated (it wasn't — the last was 10-08); the table-form handover was written. The owner asked whether the new smoke brief was in the consolidated PDF (it was — p. 15). The owner asked for CR-2026-10-03-001 in plain English; given.

**Then the session ended on a discovery.** When the owner asked "what next CR", the agent re-probed CRM: **`GET /scan/loyalty-rules/478` now returns 200** with a full rules payload — CRM's **CR-094 has gone live**, a day earlier than promised. That unblocks CR-2026-10-03-004 Parts B+C (P1), which was the only thing stopping step 2 of the CRM sequence. The agent recommended it as the next CR, with CR-2026-09-15-004 as runner-up. The owner asked for this handover (first version written here).

**Then CRM's note arrived and confirmed the discovery.** The owner uploaded `CRM_TO_SCAN_ORDER_CR094_CR096_LIVE_PLEASE_VALIDATE_2026_10_09.md` (filed in `memory/inbox/`). It said two things were live on preview and asked us to validate: **CR-094** `GET /scan/loyalty-rules/{rid}` (public, 33 flat keys, per-tier redemption values) and **CR-096** `POST /scan/feedback` now accepting no-token submissions. The agent probed both read-only against `REACT_APP_CRM_URL`: **all 7 CRM probes plus 4 extra edge cases passed** — including the feedback token path with a fresh skip-otp token. One harmless deviation: no token *and* no `restaurant_id` → 422 where the contract says 400 (we always send rid). Findings in `memory/inbox/VALIDATION_OF_CRM_CR094_CR096_NOTE_2026-10-09.md`.

**The honest headline was: endpoints validated, but our app consumes neither yet.** Review Order still reads loyalty rules through our own back-door route; the Feedback page still shows the sign-in card. Diffing CRM's 33 loyalty keys against what our UI actually reads exposed **real gaps (G1–G7)** that the B+C planning must absorb — the serious ones: **G1** we use a single `redemption_value` everywhere while CRM is per-tier (on 689 a Gold diner is shown ₹1/pt but entitled to ₹3/pt → under-rewarded); **G2** we gate the loyalty section on POS `is_loyalty` while CRM now sends `loyalty_enabled` → owner must pick the source of truth; **G3** we ignore `min_redemption_points` / `max_redemption_percent` / `max_redemption_amount` (689 caps at ₹110) → a diner can be shown a discount CRM will not honour. Also noted: our `POST /api/config/feedback` was already deleted 7 Oct, so CRM's "remove it" item is already done. The agent explained all of this in plain language on request, cleared `blocked_on` for CR-2026-10-03-004 and CR-2026-10-07-001 in the registry, and drafted a reply to CRM that reports the validation, dates the consumer wiring, and **repeats the CA-2/4/5/8 answers** — because CRM's §3 still listed them as open, which is simply because the owner has not yet sent this morning's `CONFIRMATION_NOTE_TO_CRM.md`.

**The session closed with the owner asking which CRs are now unblocked** — three: CR-2026-10-03-004 Parts B+C (by CR-094), CR-2026-10-07-001 (by CR-096), CR-2026-09-15-004 (by our own CR-2026-10-03-001 landing). **No role is active.**

---

## 2. What is left

### Waiting on the owner (nobody else can move these)

| # | Item | What to do |
|---|---|---|
| 1 | **Smoke 7 items** | Open `memory/SMOKE_BRIEFS_ALL_2026-10-08.pdf` (16 pp). Items: BUG-2026-10-06-001 · CR-2026-10-03-003 · CR-2026-10-08-001 · CR-2026-09-15-001 · CR-2026-10-03-004 (Part A) · CR-2026-10-07-002 · CR-2026-10-03-001. Reply per item `Smoke PASS <ID>` or `Smoke FAIL <ID> — step N`. CRM holds formal closure of 098/093/089 on this |
| 2 | **Send the CRM reply** | The combined reply pasted in chat at session end (CR-094/096 validation + CA-2/4/5/8). It supersedes `CR-2026-10-09-001-…/CONFIRMATION_NOTE_TO_CRM.md` as the thing to send — same CA answers, plus the validation results |
| 3 | **CA-1** | Countersign `CONTRACT_CUSTOMER_APP_CRM_v1.0 Part 1 §1–§6` |
| 4 | Later: **sign §4d** on `OWNERSHIP_MAP.md` | Only after CR-095 Phase 2 PASS; agent prepares the text, owner writes initials/date (D3) |

### Waiting on CRM

| Item | Blocker | Note |
|---|---|---|
| CR-2026-10-09-001 Phase 2–3 | CRM confirms CR-095 shipped | trigger phrase: **"CRM shipped CR-095"** |
| CR-2026-10-08-001 Step 2 (delete `PasswordSetup.jsx`) | CR-098 in prod 1 week | ~w/c 20 Oct |

### Ready for the agent — no external dependency

| Item | Status | Why it's ready |
|---|---|---|
| **CR-2026-10-03-004 Parts B+C** (P1) | IMPLEMENTATION (Part A shipped) | **CR-094 is live as of 10-09** (`/scan/loyalty-rules/478` → 200). Swap ReviewOrder's `GET /api/loyalty-settings/{rid}` → CRM `/scan/loyalty-rules/{rid}`, delete our route, retire `customer-lookup`. Takes dead-touch grep 1 → 0. Completes CRM-sequence step 2. **Caution:** CRM shape is `{success, data:{…}}` with per-tier redemption fields; ours is flat `{found, …}` — the mapping *is* the job. Validated 10-09: endpoint PASS; gaps **G1–G7** recorded in `inbox/VALIDATION_OF_CRM_CR094_CR096_NOTE_2026-10-09.md` → they go straight into the IA. Owner decision needed on G2 (CRM `loyalty_enabled` vs POS `is_loyalty`) |
| **CR-2026-10-07-001** (P2) | INTAKE | **CR-096 is live as of 10-09** (hybrid feedback, 6 cases verified). Remove the Feedback sign-in card, submit `{rating, restaurant_id, phone?}` without token, show linked/unlinked thank-you. Plan after B+C so the two customer-facing smokes can be bundled |
| **CR-2026-09-15-004** | INTAKE | Admin login → POS instead of CRM `users`; now also deletes dead `AuthContext.login()`. Predecessor CR-2026-10-03-001 has landed. Touches auth → **call `integration_expert` before writing any auth code**. CRM-sequence step 3 |
| Any `Smoke FAIL` | — | Boot Role 4/5 per control prompt on that item; it pre-empts everything above |

---

## 3. Suggested priority order (present to owner; not yet approved)

1. **Owner smoke run** — seven items are coded, QA-passed and sitting idle; nothing closes until this happens, and CRM is waiting on it too. ~40 minutes total.
2. **Send the CRM note** — one paste; releases CR-095 and clears all four bounce-backs.
3. **Planning for CR-2026-10-03-004 Parts B+C** — newly unblocked, P1, half the paperwork exists, finishes step 2 and zeroes the boundary grep. Say `Planning for CR-2026-10-03-004 Parts B+C`.
4. **Planning for CR-2026-10-07-001** — small, same customer-facing area as B+C; bundle its smoke with B+C's.
5. **Planning for CR-2026-09-15-004** — step 3, independent, larger; after the above so it doesn't collide in `server.py`. Auth → call `integration_expert` first.
6. **On "CRM shipped CR-095"** — CR-2026-10-09-001 Phase 2 (verify) then prepare the §4d text for the owner.
7. Everything else in the registry is older architecture backlog; raise only if the owner asks.

---

## 4. Rulings made this session — do NOT re-ask

| Ref | Ruling |
|---|---|
| CR-2026-10-09-001 D1 | **(i)** release CRM from the 4-step gate |
| CR-2026-10-09-001 D2 | default (a) — 404 probe ×4 + contract tests + doc counts |
| CR-2026-10-09-001 D3 | **owner signs §4d personally**; agent prepares text only |
| CR-2026-10-03-001 D1 | (a) delete outright — done |
| CR-2026-10-03-001 D2 | (a) trim `LoginRequest.restaurant_id/pos_id`, `LoginResponse.restaurant_context` — done |
| CR-2026-10-03-001 D3 | (a) backend-only; `AuthContext.login()` → CR-2026-09-15-004 |
| Smoke PDFs | per-item PDF is source of truth; consolidated PDF is a convenience artefact (owner declined to codify this in the control prompt — "1 and 2 only") |
| Ownership | `customer_app_config` / `dietary_tags_mapping` are **ours**. Never propose migrating their reads to CRM |
| Still binding from 10-08 | OTP never returns · `skip-otp` is the single identity path · always send `country_code: '+91'` · no direct Mongo read where a CRM endpoint exists |

---

## 5. Reference index

- Control prompt: `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`
- Registry: `memory/change_requests/index.yml` — **91 items**. Validate: `python3 -c "import yaml;yaml.safe_load(open('memory/change_requests/index.yml'))"`
- This session's CR folders: `CR-2026-10-09-001-crm-cr-095-readiness-and-ownership-signoff/` (INTAKE, IA, IP, CONFIRMATION_NOTE_TO_CRM) · `CR-2026-10-03-001-delete-dead-crm-table-call-sites/` (INTAKE, IA, IP+Appendix A, QA_HANDOVER, SMOKE_BRIEF.md/.pdf)
- Inbox: `memory/inbox/CRM_REPLY_VALIDATIONS_ACCEPTED_CR102_2026-10-09.md` · `memory/inbox/CRM_TO_SCAN_ORDER_CR094_CR096_LIVE_PLEASE_VALIDATE_2026_10_09.md` · `memory/inbox/VALIDATION_OF_CRM_CR094_CR096_NOTE_2026-10-09.md` (G1–G7 gap table)
- Consolidated smoke handout: `memory/SMOKE_BRIEFS_ALL_2026-10-08.pdf` · regenerate: `rm memory/SMOKE_BRIEFS_ALL_*.pdf && python3 memory/tools/smoke_briefs_all.py` (ORDER list inside the script; add new IDs there)
- Test report: `test_reports/iteration_8.json` (CR-2026-10-03-001). 1–7 are earlier CRs
- Tests: `pytest -m smoke -n 0 backend/tests/smoke/ -q` (47 incl. extras) · `pytest -m contract -n 0 backend/tests/contracts/ -q` (14)
- Credentials: `memory/test_credentials.md`; admin creds also in `backend/tests/conftest.py` (`ADMIN_PHONE` / `ADMIN_PASS`)
- Ownership map (DRAFT; §4d pending): `INV-2026-09-15-002-shared-db-collection-ownership-map/OWNERSHIP_MAP.md`
- CRM sequence source: `INV-2026-09-15-003-…/crm_replies/INV_022_CRM_REPLY_TO_CUSTOMER_APP_ROUND2.md` lines 20–25

## 6. Environment notes

- Preview URL = `REACT_APP_BACKEND_URL` in `frontend/.env`; CRM = `REACT_APP_CRM_URL`. Ignore URLs in older handovers.
- `/api/auth/login` is rate-limited **5/min** → 429 in tests is the limiter, not a bug.
- `backend/server.py` is now **1,367 lines**. Any older doc quoting line numbers is stale. For hotspot edits reuse the Appendix A pattern: md5 pin + verbatim anchors + bottom-up apply + "must survive" anchor list.
- `pypdf` installed in-pod only (`pip install pypdf`), deliberately not in `requirements.txt` — tooling, not app.
- Platform auto-commits checkpoints; never `git reset`. Owner uses the rollback feature.

## 7. Mistakes this session — don't repeat

- Opening summary inherited a wrong premise ("migrate config reads to CRM API"). Always check the ownership board before stating who owns a collection.
- Appendix A anchors assumed truly empty lines; the file had whitespace-only lines → first apply aborted. Use `strip() == ""`.
- Ran a login test twice within a minute → 429. Sequence test runs around the limiter.
- Said "line-by-line planning done" was implied when it was function-level. When the owner asks for a specific level of detail, check before confirming.
