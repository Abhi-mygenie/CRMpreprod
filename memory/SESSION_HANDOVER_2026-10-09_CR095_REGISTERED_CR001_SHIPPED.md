# SESSION HANDOVER — 2026-10-09 · CR-095 readiness registered, CR-2026-10-03-001 shipped, 7 items at owner smoke

**DRAFT — superseded by `SESSION_HANDOVER_2026-10-09_FINAL.md`. Read that instead.**
Next agent: read this → `memory/PRD.md` (last ~12 lines) → `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`. No role is active. Boot a role only on the owner's phrase.

Owner language: English. Owner style: short imperative messages; wants plain-English explanations on request; **explicitly holds gates** ("don't jump gate") — never implement without the exact phrase `Gate 3 accepted for <ID>`.

---

## 1. What was completed this session (all 2026-10-09, memory-only unless stated)

| # | Item | Outcome |
|---|---|---|
| 1 | Smoke-brief audit | Gap found: CR-2026-10-07-002 had QA PASS but no brief → `SMOKE_BRIEF.md/.pdf` written |
| 2 | Consolidated smoke handout | New tool `memory/tools/smoke_briefs_all.py` (needs `pip install pypdf`; ORDER list inside) → `memory/SMOKE_BRIEFS_ALL_2026-10-08.pdf` (16 pages, 7 items, cover index + bookmarks). Per-item PDFs stay source of truth. **Regenerate after any brief changes** (`rm memory/SMOKE_BRIEFS_ALL_*.pdf && python3 memory/tools/smoke_briefs_all.py`) |
| 3 | CRM reply 2026-10-09 filed | `memory/inbox/CRM_REPLY_VALIDATIONS_ACCEPTED_CR102_2026-10-09.md`. CR-102 (CRM now honours `country_code`; limiter tweaks) checked vs code → **already compliant, no change** |
| 4 | **CR-2026-10-09-001** registered (Intake) + IA + IP + Phase 1 done | Our side of CRM **CR-095** (CRM deletes 4 orphan `GET/PUT /scan/config/{rid}` + `/scan/menu/dietary-tags/{rid}`). Code reality: 0 callers anywhere; `customer_app_config` (13 docs) + `dietary_tags_mapping` (0) are **ours**. Status IMPLEMENTATION. `CONFIRMATION_NOTE_TO_CRM.md` drafted — answers CA-2, CA-4, CA-5, CA-8 in one message |
| 5 | **CR-2026-10-03-001** Planning → Gate 3 → Implemented | Dead customer API shim deleted from `backend/server.py` (1,741 → 1,367; −378/+5). Dead CRM-table touches 14 → 1. New `backend/tests/smoke/test_cr_2026_10_03_001.py` (12) + testing-agent `…_extras.py` (16). Testing agent `iteration_8.json`: 28/28 + 61/61 regression. QA_HANDOVER + SMOKE_BRIEF(.pdf). Status **SMOKE** |

**Only app-code change this session:** `backend/server.py` + two new test files. No frontend file touched.

## 2. Decisions already made — DO NOT re-ask

| Ref | Ruling | Date |
|---|---|---|
| CR-2026-10-09-001 **D1** | (i) **Release CRM from the 4-step gate** — CR-095 ships independent of our steps 2–3 | 10-09 |
| CR-2026-10-09-001 D2 | default (a): verification = 404 probe ×4 + contract tests + doc counts | 10-09 |
| CR-2026-10-09-001 **D3** | **Owner signs §4d row personally.** E1 prepares the text with initials/date blank; E1 does **not** mark it | 10-09 |
| CR-2026-10-03-001 D1 | (a) delete outright, no quarantine markers | 10-09 |
| CR-2026-10-03-001 D2 | (a) trim `LoginRequest.restaurant_id/pos_id`, `LoginResponse.restaurant_context` — **done** | 10-09 |
| CR-2026-10-03-001 D3 | (a) backend-only; dead frontend `AuthContext.login()` deletion **added to CR-2026-09-15-004 notes** | 10-09 |
| Correction | `customer_app_config` / `dietary_tags_mapping` are **Customer-App-owned**. Any earlier idea of "migrate these reads to CRM API" is **wrong** — do not propose it | 10-09 |
| From 10-08 (still binding) | OTP never coming back · `skip-otp` is the single identity path · `country_code: '+91'` always sent · no direct Mongo reads where a CRM endpoint exists | 10-08 |

## 3. Owner-side actions outstanding (not agent work)

1. **Smoke 7 items** — `memory/SMOKE_BRIEFS_ALL_2026-10-08.pdf`: BUG-2026-10-06-001 · CR-2026-10-03-003 · CR-2026-10-08-001 · CR-2026-09-15-001 · CR-2026-10-03-004 · CR-2026-10-07-002 · **CR-2026-10-03-001**. Phrase per item: `Smoke PASS <ID>` / `Smoke FAIL <ID> — step N`. CRM holds formal closure of 098/093/089 on this.
2. **Send** `CR-2026-10-09-001-…/CONFIRMATION_NOTE_TO_CRM.md` to CRM (also pasted in chat 10-09).
3. **CA-1** contract countersign (Part 1 §1–§6).
4. Later: sign §4d row on `OWNERSHIP_MAP.md` after CR-095 Phase 2 PASS (D3).

## 4. Pending agent work — every item gated

| Item | Status | Trigger phrase / blocker |
|---|---|---|
| CR-2026-10-09-001 Phase 2 (E3–E5 verify) → Phase 3 (§4d text prep) | IMPLEMENTATION | owner: **"CRM shipped CR-095"** |
| CR-2026-10-03-004 Parts B+C (`loyalty-settings` → `loyalty-rules`, retire `customer-lookup`) | blocked | CRM CR-094 (`GET /scan/loyalty-rules/{rid}` still 404; w/c 13 Oct). Re-probe before planning |
| **CR-2026-09-15-004** admin login → POS (now also deletes `AuthContext.login()`) | INTAKE | owner: "Planning for CR-2026-09-15-004". Predecessor CR-2026-10-03-001 has landed — sequencing constraint satisfied |
| CR-2026-10-08-001 Step 2 (delete `PasswordSetup.jsx` + route) | blocked | CR-098 live + 1 week prod stability (~w/c 20 Oct) |
| CR-2026-10-07-001 guest feedback | blocked | CRM CR-096 (~27 Oct) |
| Any `Smoke FAIL` | — | boot Role 4/5 per control prompt on the failed item |

## 5. Suggested order to present (owner has NOT approved this list)

1. Owner smoke run (unblocks 7 closures + CRM formal closure)
2. Planning for CR-2026-09-15-004 (no external dependency, largest remaining boundary violation)
3. Re-probe CR-094; if live → Planning for CR-2026-10-03-004 Parts B+C
4. On "CRM shipped CR-095" → CR-2026-10-09-001 Phase 2

## 6. Open questions for the owner (ask only when relevant)

- None blocking. If the owner asks "what next", present §5 and let them pick.

## 7. Reference index

- Control prompt: `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`
- Registry: `memory/change_requests/index.yml` (**91 items**; validate with `python3 -c "import yaml;yaml.safe_load(open('memory/change_requests/index.yml'))"`)
- This session's folders: `CR-2026-10-09-001-crm-cr-095-readiness-and-ownership-signoff/` · `CR-2026-10-03-001-delete-dead-crm-table-call-sites/`
- Inbox: `memory/inbox/CRM_REPLY_VALIDATIONS_ACCEPTED_CR102_2026-10-09.md`
- Test reports: `test_reports/iteration_8.json` (CR-2026-10-03-001); 1–7 earlier CRs
- Tests: `backend/tests/smoke/` (31 + 16 extras) · `backend/tests/contracts/` (14, snapshot) — run `pytest -m smoke -n 0 backend/tests/smoke/ -q`
- Credentials: `memory/test_credentials.md`; admin creds also in `backend/tests/conftest.py` (`ADMIN_PHONE`/`ADMIN_PASS`)
- Ownership map (DRAFT, §4d pending): `INV-2026-09-15-002-…/OWNERSHIP_MAP.md`

## 8. Environment notes

- Preview URL: `REACT_APP_BACKEND_URL` in `frontend/.env` (do not trust older URLs in old handovers).
- `/api/auth/login` is rate-limited **5/min** — a 429 in tests is the limiter, not a bug; `test_admin_login_still_restaurant` skips on 429.
- `server.py` current size 1,367 lines. Any plan quoting line numbers must be re-derived; Appendix A pattern (md5 pin + verbatim anchors + bottom-up) worked well — reuse it for hotspot edits.
- `pypdf` is installed in this pod only via `pip install pypdf` (not in requirements.txt — tooling, not app).
- Platform auto-commits; `git log` shows checkpoints. Never `git reset`; owner uses rollback.

## 9. Mistakes made this session (so you don't repeat them)

- Initially suggested "migrate config/dietary reads to CRM API" — wrong premise, corrected (see §2). The handoff summary that seeded this session carried the same wrong framing.
- Appendix A anchors assumed truly empty blank lines; file had whitespace-only lines → first apply aborted (harmlessly, md5-guarded). Use `strip()==""`.
- Re-ran a login test within a minute → 429. Respect the limiter when sequencing test runs.
