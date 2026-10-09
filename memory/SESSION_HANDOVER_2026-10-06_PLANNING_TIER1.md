# SESSION HANDOVER — 2026-10-06 (session 3) · Registry QA + Tier-1 Planning

**Agent:** E1 · **Roles held this session:** Role 3 (Implementation, CR-2026-10-04-006) → Role 4 (QA, same CR) → Role 2 (Planning, BUG-2026-10-06-001 + CR-2026-10-03-003) → Role 6-lite (INV-2026-10-03-001 remediation advice)
**Operating prompt:** `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`
**Previous handover:** `SESSION_HANDOVER_CR-2026-10-04-006-ROLE3.md`

> **Instruction to the next agent:** On your first turn, brief the owner in plain English on §1 (what was done), then show §3 (exactly where planning stands), then ask the §5 questions. Do not write application code until the owner says the Gate 3 phrase for a specific item. Respond in English only.

---

## 1. What was done this session

### 1a. CR-2026-10-04-006 — Google Sheet registry mirror · Role 3 closed, Role 4 PASSED
- Role 3 amendment P1–P6 + P11 completed and pushed (see previous handover for phase detail).
- Post-sync fixes applied after owner review:
  - `Change Log` tab now gets a proper header row (was created empty).
  - Tab order fixed so `Summary` is the **last** tab.
  - `Blockers` tab was empty → root-caused as a **data gap, not a display bug**: `blocked_on` was unpopulated. Now 4 rows (CR-2026-08-03-001/POS, CR-2026-09-12-003/OWNER, CR-2026-09-12-015/OWNER, INV-2026-09-12-001/OWNER). Owner asked "confirm if this is a gap?" → answered: it was a legitimate gap, now closed.
- **Role 4 QA:** 22/22 tests PASS, 13 Band-b checks deferred (P7–P10 not built). Report: `change_requests/CR-2026-10-04-006-google-sheet-registry-mirror/QA_REPORT_AMENDMENT.md`.
- Registry: 87 items, 85 routed, 2 unrouted (`CR-2026-XX-XX-001`, `INV-2026-05-01-001` — status null by design).
- Live sheet: https://docs.google.com/spreadsheets/d/1-dS9OsFt4FQ68ufgP924jgfP7L8RNEKlVYCe39scqx0/edit
- OAuth token: `/app/secrets/sheets_token.json` (Testing-mode consent screen → expires every 7 days until published; D-A2 still open).
- **index.yml status for this CR is still `PLANNING`** — it should be moved to `QA` or `SMOKE` once owner does the sheet smoke. Owner smoke not yet confirmed.

### 1b. Environment
- Owner changed `REACT_APP_CRM_URL` → `https://react-app-staging-1.preview.emergentagent.com/api` (CRM v2 staging). Frontend restarted; CRM reachable.
- Validated `POST /scan/feedback` live against that URL:
  - With customer token (login via `POST /scan/auth/login`, phone 9579504871, skip-otp) → **200, feedback stored**. Endpoint is **shipped**.
  - Without token (`{phone, restaurant_id, rating, message}`) → **403**. The anonymous hybrid path (contract §4c / A9-b, CRM CR-096) is **NOT shipped yet**.

### 1c. Next-batch selection (owner asked "what's in intake for next batch?")
Proposed and walked through line-by-line in plain English:

| Tier | Item | Why | Status |
|---|---|---|---|
| **1 — ready now** | BUG-2026-10-06-001 | No owner ruling needed, LOW risk, unblocks sizing of CR-2026-10-06-001 | Planning done in chat (§3) |
| **1 — ready now** | CR-2026-10-03-003 | Only live write into a CRM-owned collection; endpoint confirmed shipped for token path | Planning done in chat (§3) |
| 2 — needs owner ruling | CR-2026-10-06-001 | Owner must pick A/B/C/D | waiting |
| 2 — needs owner ruling | CR-2026-10-06-002 | Owner must answer Q1–Q3 + ratify P1 | waiting |
| 2 — needs owner ruling | CR-2026-10-04-005 | Approve estate-wide surcharge or revert | waiting |
| 2 — security | CR-2026-09-15-004 | Admin login reads CRM `users` directly | not started |
| later | CR-2026-07-03-012 · BUG-2026-09-10-001 · CR-2026-10-03-001 · INV-2026-10-04-001 | | backlog |

### 1d. INV-2026-10-03-001 — prod dump in UAT (owner asked for the solution)
Root cause confirmed by owner: UAT/preprod Mongo was seeded from a **production dump**, so real customer PII (114 `customer_documents`) and a live `dp_live_` CRM credential sit in a shared non-prod DB. Advice given (all **operational, no app code**):
1. Rotate the `dp_live_` key on the CRM side immediately; issue a `dp_test_`-class key for UAT.
2. Purge `customer_documents` (and any other PII collections) from the UAT DB, or re-seed UAT from a scrubbed/synthetic fixture.
3. Add a seeding rule: non-prod is never seeded from prod without an anonymisation step.
Status in index: still `INTAKE`. Needs DevOps/CRM action → should be marked `blocked_on: [INFRA, CRM]` by Role 1/Registrar.

### 1e. Feedback feature usage trace (owner asked "where is feedback used?")
- Entry points: `feedbackEnabled` / `feedbackIntroText` in restaurant config (`server.py:231`), landing menu item `{id:"feedback", type:"builtin"}` (`server.py:1148`, hidden by default).
- Page: `frontend/src/pages/FeedbackPage.jsx` — form `{name, email, rating, message}` → `POST {API_URL}/api/config/feedback` (line 34).
- Backend: `server.py:1297 FeedbackCreate`, `:1304 submit_feedback` → inserts our-shaped doc into **CRM-owned** `db.feedback`. Read route `GET /api/config/feedback/{rid}` has zero callers.
- `crmService.js` has **no** feedback function today — `crmSubmitFeedback` must be **added**, not just imported.

---

## 2. Gate ledger

| Item | Gate 1 (registered) | Gate 2 (plan accepted) | Gate 3 (Role 3 assigned) | Gate 4 (QA) |
|---|---|---|---|---|
| CR-2026-10-04-006 | ✅ | ✅ | ✅ | ✅ PASS 22/22 — owner smoke pending |
| BUG-2026-10-06-001 | ✅ | ⏳ **analysis presented in chat, not yet written as artefact, not yet accepted** | ✗ | ✗ |
| CR-2026-10-03-003 | ✅ | ⏳ **same** | ✗ | ✗ |

---

## 3. Where we are in planning (Role 2) — exact position

Role 2 has 11 steps. For **both** Tier-1 items:

| Role 2 step | BUG-2026-10-06-001 | CR-2026-10-03-003 |
|---|---|---|
| 1 Verify registered | ✅ | ✅ |
| 2 Check code reality | ✅ (3 checkpoints re-read: `LandingPage.jsx:538`, `MenuItems.jsx:490`, `ReviewOrder.jsx:901`; `server.py:1657-1700`) | ✅ (`FeedbackPage.jsx:34`, `server.py:1297-1320`, CRM endpoint probed live) |
| 3 Check conflicts | ✅ none — CR-2026-10-06-001/002 touch same files but are HELD; no merge contention if we ship first | ✅ overlaps CR-2026-10-03-001 (dead read route) — we delete it here, CR-001 count drops 14→13 |
| 4 Trace data flow | ✅ | ✅ |
| 5 Risk | ✅ LOW | ✅ MEDIUM (external dependency on CRM; anonymous path unshipped) |
| 6 Files + consumers | ✅ listed below | ✅ listed below |
| 7 Surface owner decisions | ✅ 1 decision (D1 below) | ✅ 2 decisions (D2, D3 below) |
| **8 Write IMPACT_ANALYSIS.md** | ❌ **NOT written** — folder has only `INTAKE_DOC.md` | ❌ **NOT written** |
| 9 Write IMPLEMENTATION_PLAN.md | ❌ | ❌ |
| 10 Verification matrix | ❌ | ❌ |
| 11 WILL / WILL-NOT change declaration | drafted in chat only | drafted in chat only |

**index.yml:** both still `status: INTAKE`, `artefacts: INTAKE`. Must become `PLANNING` + artefacts `INTAKE, IMPACT_ANALYSIS, IMPLEMENTATION_PLAN` once docs are written, then `registry_sync.py sync` to push to the sheet.

### 3a. BUG-2026-10-06-001 — plan as presented (not yet accepted)

**Problem:** `postNonQrBlock` is called only inside `if (policy.block)`, so the 5 allow reasons (`valid-qr`, `rid-716-carveout`, `edit-mode`, `non-dinein-mode`, `policy-disabled`) are never recorded.

**Proposed edits:**
- `frontend/src/pages/LandingPage.jsx:538`, `MenuItems.jsx:490`, `ReviewOrder.jsx:901` — move `postNonQrBlock(...)` out of the `if (policy.block)` branch, guard it with `if (allowNonQrOrders === false)` so it fires on **both** block and allow, but **never** when the policy switch is on (`policy-disabled`) — avoids one event per order estate-wide.
- `frontend/src/api/services/diagnosticsService.js` — pass two new fields: `decision: policy.reason`, `allowed: !policy.block`.
- `backend/server.py:1657 NonQrBlockEvent` — add `decision: Optional[str] = None`, `allowed: bool = False`; write both into the doc at `:1697`. No new route, collection or index.
- Code markers `// BUG-2026-10-06-001` at each edit.

**Impact on 716:** none on behaviour — 716 keeps its carve-out; it just becomes **visible** as `decision: rid-716-carveout, allowed: true` events. Owner asked this explicitly; answer given: zero functional impact.

**Files WILL NOT touch:** `orderAccessPolicy.js` (reasons already correct), `useScannedTable.js`, admin pages.

**Owner decision D1:** Should `policy-disabled` also be logged? Recommendation: **No** (noise). If owner wants full audit, log it with a sampling rate.

**Risk:** LOW · **Rollback:** revert 5 files.

### 3b. CR-2026-10-03-003 — plan as presented (not yet accepted)

**Problem:** Feedback goes into CRM's `feedback` collection in our schema → invisible to CRM UI and to us.

**Proposed edits:**
- `frontend/src/api/services/crmService.js` — **add** `crmSubmitFeedback({rating, message, order_id?})` → `POST {REACT_APP_CRM_URL}/scan/feedback` with customer bearer token (same pattern as other `/scan/` calls).
- `frontend/src/pages/FeedbackPage.jsx` — replace local `fetch` (line 34) with `crmSubmitFeedback`; remove Name/Email fields (identity from token); on 401/403 (no token) show honest message "Please sign in to leave feedback" — **not** a fake success toast.
- `backend/server.py` — delete `FeedbackCreate` (`:1297`), `POST /config/feedback` (`:1304`), `GET /config/feedback/{rid}`.
- Code markers `# CR-2026-10-03-003` / `// CR-2026-10-03-003`.

**Files WILL NOT touch:** `AdminConfig` (feedback toggle stays), landing menu builtin entry.

**Owner decisions:**
- **D2 — anonymous diners:** CRM's hybrid path (phone + restaurant_id, CR-096) returns **403 today**. Options: (a) ship token-only now with honest "sign in" UI, add anonymous path when CRM ships CR-096; (b) wait for CR-096 and ship both together; (c) keep anonymous feedback going to our own backend temporarily (rejected — keeps the CRM-collection write). Recommendation: **(a)**.
- **D3 — existing foreign-shaped docs in `db.feedback`:** leave in place (CRM owns the collection) or ask CRM to purge? Recommendation: ask CRM to purge; we do not write a cleanup script against their collection.

**Risk:** MEDIUM (external API dependency, shared-DB boundary) · **Rollback:** revert 3 files; backend route restore from git.

---

## 4. Files of reference

| Path | Why |
|---|---|
| `memory/change_requests/BUG-2026-10-06-001-non-qr-bypass-not-observable/INTAKE_DOC.md` | intake; IMPACT_ANALYSIS.md to be written alongside |
| `memory/change_requests/CR-2026-10-03-003-feedback-wrong-schema-crm-collection/INTAKE_DOC.md` | intake; §1a has the A9-b hybrid contract |
| `memory/change_requests/index.yml` | registry — update status/artefacts after docs written |
| `memory/tools/registry_sync.py` | `python registry_sync.py sync --dry-run` then `sync` after any index change |
| `frontend/src/pages/LandingPage.jsx:538` · `MenuItems.jsx:490` · `ReviewOrder.jsx:901` | BUG-001 checkpoints |
| `frontend/src/api/services/diagnosticsService.js` | `postNonQrBlock` |
| `frontend/src/utils/orderAccessPolicy.js:37-69` | reasons (do not change) |
| `backend/server.py:1657-1700` | `NonQrBlockEvent` + route |
| `frontend/src/pages/FeedbackPage.jsx` · `frontend/src/api/services/crmService.js` | CR-003 frontend |
| `backend/server.py:1297-1320` | CR-003 backend deletions |
| `memory/test_credentials.md` | CRM login for testing |

---

## 5. Questions for the owner (ask these first, next session)

1. **Confirm the gate position:** Planning for both Tier-1 items was presented verbally but no `IMPACT_ANALYSIS.md` / `IMPLEMENTATION_PLAN.md` exists. Do you want me to (a) write both artefacts now as Role 2 and bring them for Gate 2 acceptance, or (b) you accept the chat plan as-is and I write the artefacts as part of Role 3 pre-flight?
2. **D1 (BUG-001):** log `policy-disabled` allow events? Recommendation: no.
3. **D2 (CR-003):** ship token-only feedback now with an honest "sign in" message for anonymous diners (option a), or wait for CRM CR-096?
4. **D3 (CR-003):** ask CRM to purge the existing foreign-shaped docs in `db.feedback`, or leave them?
5. **Sequence:** ship BUG-2026-10-06-001 first (LOW risk, 1 day), then CR-2026-10-03-003? Or both in one Role 3 session?
6. **CR-2026-10-04-006:** have you done the owner sheet smoke? If yes, I move it to `SMOKE`/`CLOSED` in the registry.
7. **INV-2026-10-03-001:** has DevOps/CRM been asked to rotate `dp_live_` and purge UAT PII? I will record `blocked_on` accordingly.

**Gate 3 phrase expected:** `Role 3 approved for BUG-2026-10-06-001` and/or `Role 3 approved for CR-2026-10-03-003`. Nothing is coded before that.

---

## 6. Open items carried forward

- D-A2: publish Google OAuth consent screen (token expires every 7 days in Testing mode).
- P7–P10 (Band b, sheet read-merge-write) and P12 (ROLE 13 REGISTRAR prompt edit) — deferred, need separate approval.
- CR-2026-10-04-006 `index.yml` status still `PLANNING` → pending owner smoke.
- Tier 2 owner rulings: CR-2026-10-06-001 (A/B/C/D), CR-2026-10-06-002 (Q1–Q3), CR-2026-10-04-005 (approve/revert).

## 7. Testing status
- Registry tooling: QA'd 22/22.
- Application code: **unchanged this session** — no app tests needed. Testing agent to be used after Role 3 for both Tier-1 items (frontend + backend).
