# IMPLEMENTATION PLAN — CR-2026-10-04-006 (Google Sheet registry mirror)

**Role:** 2 — PLANNING AGENT · **Stage:** Implementation Plan (Gate 3) · **Never coded during Planning**
**Basis:** `IMPACT_ANALYSIS.md` rev 3 · `INTAKE_DOC.md` rev 2 (D-G1…D-G20, O-G1…O-G8 all resolved)
**Risk:** LOW · **Files created:** 3 new + 1 targeted `.env` edit · **App code touched:** none

---

## 1. Pre-Implementation Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Item registered | ✅ |
| 2 | Impact Analysis complete | ✅ rev 3 |
| 3 | All design decisions resolved | ✅ D-G1…D-G20, O-G1…O-G8 |
| 4 | Code reality verified | ✅ NONE exists |
| 5 | No conflicting active item on these paths | ✅ |
| 6 | Dependencies available | ✅ `google-api-python-client`, `google-auth`, `google-auth-httplib2` already in `requirements.txt` |
| 7 | Integration playbook consulted | ✅ — **and deviated from, see §3** |
| 8 | **Credentials in hand** | ❌ **BLOCKER — owner action, §4** |
| 9 | Money-path list ratified | ❌ 7 items proposed, awaiting owner (§16.1 of impact analysis) |
| 10 | **Role 3 approved by owner** | ❌ **not granted — nothing may be written** |

## 2. Scope Lock

### WILL be created / changed

| File | Action | Risk |
|---|---|---|
| `memory/change_requests/index.yml` | **new** — typed index, 78 records | LOW |
| `memory/tools/registry_sync.py` | **new** — bootstrap · generator · auditor · changelog | LOW |
| `memory/change_requests/CHANGELOG.md` | **new** — append-only, created on first run | LOW |
| `memory/tools/.registry_state.json` | **new** — last-generated snapshot, for diffing (§8) | LOW |
| `backend/.env` | **+2 keys by targeted `search_replace` only** | LOW |

### WILL NOT be touched

`memory/change_requests/README.md` (**O-G3 — never machine-written**) · `backend/server.py` · any
other `backend/` file · all of `frontend/` · `requirements.txt` (no new deps) · `package.json` ·
frozen contract §1–§6 · `OWNERSHIP_MAP.md` · the operating prompt and addendum (**ROLE 13 and the
§10 correction both remain owner-gated**) · any item's substance or status · the 5 sprint items.

## 3. 🔴 Deviation from the integration playbook — stated plainly

The playbook returned the **interactive web-OAuth flow**: `Flow.from_client_config`, a client ID and
secret, an authorised redirect URI, `/oauth/sheets/login` and `/oauth/sheets/callback` FastAPI
routes, and per-user refresh tokens stored in Mongo.

**That is the wrong pattern here, and following it would break two agreed decisions.** This is a
standalone script with no server, no browser and no users. The OAuth flow would require adding two
routes to `backend/server.py` — a Part C CRITICAL hotspot that CR-2026-09-12-006 is about to split —
plus a token collection in the shared CRM-owned database, to let one person view a spreadsheet. It
would widen the customer app's auth surface for an internal reporting tool.

**Chosen instead: a service account** (`google.oauth2.service_account`), which is the standard
non-interactive pattern and needs no routes, no browser and no token storage.

**What the playbook was still right about, and is carried over verbatim:**

| Playbook guidance | Applied |
|---|---|
| Scope for read+write: `https://www.googleapis.com/auth/spreadsheets` | ✅ used |
| Library set: `google-api-python-client`, `google-auth`, `google-auth-httplib2` | ✅ already installed |
| Do **not** enforce exact scope equality — Google may return extra scopes | ✅ §7 guard |
| Writes batch per ~100 updates; throttle heavy writes | ✅ §7 batching |
| `values.get` / `values.update` / `values.append` are the read/write primitives | ✅ used |
| Credentials from env only, never hardcoded | ✅ §4 |

**Rejected option, recorded:** OAuth user flow exactly per the playbook. Cost: 2 new app routes, a
Mongo token collection, browser consent, refresh-token encryption. Benefit over service account:
none for this use case. If the owner prefers it, this plan is void and the CR must be re-planned
with `backend/server.py` back in scope.

## 4. ⛔ Credentials the owner must provide before Phase 3

Non-interactive service-account path. Steps, exact:

1. **Google Cloud Console** → [console.cloud.google.com](https://console.cloud.google.com) → create
   or select a project.
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **APIs & Services → Credentials** → **Create Credentials → Service account**. Name it e.g.
   `mygenie-registry-sync`. No roles needed — access is granted by sharing the Sheet, not by IAM.
4. Open the service account → **Keys → Add key → Create new key → JSON** → download.
5. **Create the target spreadsheet** and copy its ID from the URL
   (`docs.google.com/spreadsheets/d/<THIS_PART>/edit`).
6. **Share the spreadsheet** with the service-account email (ends `@…iam.gserviceaccount.com`) as
   **Editor**. This step is the one most often missed — without it every call returns 403.
7. Place the JSON key **outside the repo** (e.g. `/app/secrets/registry_sync_sa.json`) and give
   Planning the two values below.

Then two keys are added to `backend/.env` by targeted edit — never by rewriting the file:

```
GOOGLE_SHEETS_SPREADSHEET_ID=<id from step 5>
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=/app/secrets/registry_sync_sa.json
```

**No credential value appears in this or any other document** (§2, R11). The JSON key must not be
committed; the path is read from env.

## 5. `index.yml` — record schema (17 fields, O-G5 applied)

One record per item. `blocked_on` is a **list of records** (O-G5 option a), so the column count
stays at 17.

```yaml
- id: CR-2026-08-03-001
  type: CR
  title: Remove 716 hardcoding — 27 checks to 2 POS flags
  status: HELD                    # one of the 13 (O-G4: never guessed)
  status_note: >
    Plan complete and verified against live POS, but 716's flags were reset to
    defaults on preprod; shipping as-is would strip Hyatt room-only + autopaid.
    Blocker is a POS data backfill, not POS engineering.
  severity: P1
  risk: HIGH
  owner_action: confirm 716 flag backfill in preprod AND production, then re-read plan
  blocked_on:
    - party: POS                  # POS | CRM | OWNER | OPS | INTERNAL
      ref: 716 flag backfill
      since: 2026-10-04
  next_gate: Implementation       # drives the tab (§6)
  wave_track: Wave 3 / Track C
  files: 3 FE
  artefacts: CR, IMPACT_ANALYSIS, IMPLEMENTATION_PLAN
  registered: 2026-08-03
  last_updated:                   # blank for history (O-G2) — never fabricated
  related: [CR-2026-09-12-009, INV-2026-06-17-003]
  money_path: false               # manual tag (O-G6)
  code_markers: true              # derived by grep
```

Field rules: `status` from the 13-value enum only · ambiguity is escalated, never defaulted (O-G4) ·
`registered` / `wave_track` / `files` may be blank (O-G1) · `last_updated` blank for every historical
record and written only when the generator observes a change.

## 6. Tab routing rule (no schema change — §12.2 of impact analysis)

> **tab = the gate immediately preceding `next_gate`**, with every terminal status absorbed into
> **Closed**.

| `next_gate` | → Tab | | `status` | → Tab |
|---|---|---|---|---|
| Planning | Intake | | CLOSED · PARKED · DEFERRED · REVERTED · TOMBSTONE | **Closed** (D-G18) |
| Approval / Implementation | Planning | | `QA_PASSED` | **QA** (O-G7) |
| QA | Implemented | | `AWAITING_OWNER_SMOKE` | **Smoke** (O-G7) |
| Smoke | QA | | | |
| Closure | Smoke | | | |

Every item resolves to **exactly one** gate tab. Blocked items **additionally** appear on Blockers —
that repetition is intentional (D-G19) and must not be double-counted in Summary totals.

## 7. `registry_sync.py` — structure and commands

Follows the `/app/memory/tools/` convention: plain script, `load_dotenv('/app/backend/.env')`,
`os.environ[...]` with no fallbacks, fails fast on missing config.

```
python registry_sync.py bootstrap     # write skeleton index.yml (derivable fields only)
python registry_sync.py audit         # read-only: drift, divergence, unrouted items
python registry_sync.py sync --dry-run   # compute everything, write NOTHING
python registry_sync.py sync          # push to Sheets + write CHANGELOG
```

| Function | Does |
|---|---|
| `bootstrap()` | scans folders → emits `index.yml` skeleton with the 5 fully-derivable fields (`id`, `type`, `title`, `artefacts` via `ls`, `code_markers` via grep). Reduces hand-authoring from 78×17 to 78×~8. **Never overwrites an existing index** |
| `load_index()` | parse + validate: enum membership, unique ids, required fields, `blocked_on.party` validity. Aborts on violation |
| `audit()` | folders vs index vs README vs code markers → the F1–F7 check class; plus index↔README divergence (§7.1) |
| `build_views()` | route to the 8 tabs (§6); build Blockers grouped by party; compute Summary blocks |
| `push()` | `batchUpdate` to create missing tabs · `values.batchUpdate` to write rows, batched ≤100 per call as the playbook advises · `addConditionalFormatRule` **once** (idempotent — check existing rules first) · `addProtectedRange` per tab (§7.2 of impact analysis) · banner row with generation timestamp |
| `changelog()` | diff vs `.registry_state.json`, append entries, or write the explicit "no changes" line |

Auth, non-interactive:

```python
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
creds = service_account.Credentials.from_service_account_file(
    os.environ["GOOGLE_SERVICE_ACCOUNT_JSON_PATH"], scopes=SCOPES)
svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
```

Per the playbook: do not assert returned scopes equal requested scopes — check the required scope is
a subset.

## 8. Change-log diffing — why a state snapshot is needed

To report "changes since last generation", the previous values must exist somewhere. Three options
considered:

| Option | Verdict |
|---|---|
| diff `index.yml` against git HEAD | **rejected** — the platform auto-commits, so HEAD may already contain the new values; the pod has only 5 commits |
| read current values back from the Sheet and diff | **rejected** — would make the Sheet an input, breaching the one-way rule (D-G1) |
| **`.registry_state.json` snapshot written after every successful push** | ✅ **chosen** — explicit, local, inspectable, and keeps the Sheet strictly an output |

Entry format: `id · field · from → to · authority · date`. Separate section for *overwritten local
edits* (§7.2 of impact analysis) when a cell differed from what the generator last wrote.

## 9. Phase sequencing — hardest and most uncertain first

Each phase is independently testable and ends in a usable state.

| Phase | Deliverable | Test | Blocked on |
|---|---|---|---|
| **P1** | `bootstrap` + `index.yml` skeleton (78 records, 5 derivable fields) | 78 records, 0 orphans, 0 duplicate ids | nothing |
| **P2** | `load_index()` validation + `audit` | detects a deliberately broken enum value and a fake folder | P1 |
| **P3** | **Sheets auth smoke — write one cell to a scratch tab** | returns 200; proves creds, sharing and scope **before** any view code is built | **§4 credentials** |
| **P4** | `build_views()` + local CSV dump of all 8 tabs | counts sum to 78 excluding Blockers; every item routed exactly once | P2 |
| **P5** | `push()` — 8 tabs, batched writes, banner | Sheet matches the CSVs row-for-row | P3, P4 |
| **P6** | `changelog()` + `.registry_state.json` | change one status → one entry; run again → "no changes" | P5 |
| **P7** | conditional-format rules + protected ranges | rules survive a second run; editing a cell warns | P5 |

**P3 is deliberately third.** It is the only step with an external dependency that can fail for
reasons outside the code — wrong sharing, API not enabled, bad key path. Proving it with a one-cell
write costs minutes; discovering it after building 8 tab writers costs a session.

Hand-authoring the remaining ~8 fields per item (O-G1) is **not** in these phases. It is a separate
78-item task to be scoped on its own, as recorded in O-G1.

## 10. Verification matrix

Carries V1–V19 from the impact analysis, mapped to phases, plus plan-specific additions.

| # | Check | Phase | Pass condition |
|---|---|---|---|
| V1 | Index covers every item | P1 | 78 records, 0 orphans |
| V2 | **`README.md` never written** | P5 | `git diff` on README = empty after a full sync |
| V3 | Round-trip stability | P5 | second `sync` produces no diff |
| V3b | Divergence audit | P2 | index/README mismatch reported |
| V4 | Sheet matches index | P5 | row counts + field sample per tab |
| V5/V13 | Tab routing | P4 | each item in exactly one gate tab; 0 unrouted |
| V6 | Change log fires | P6 | one entry, correct from→to and authority |
| V7 | "No changes" explicit | P6 | literal line, never empty output |
| V8 | Audit catches drift | P2 | fake folder reported as unregistered |
| V9 | `code_markers` accuracy | P1 | 5 known-true IDs match grep |
| V10 | **No secret in any artefact** | all | grep index, CSVs, Sheet, changelog → 0 credentials |
| V11 | `--dry-run` writes nothing | P4 | no file or API mutation |
| V14 | Blockers repetition intentional | P4 | blocked items on both tabs; Summary not double-counted |
| V15 | Party grouping | P4 | every blocker row has a valid party; 0 UNKNOWN |
| V16 | Funnel arithmetic | P4 | gate tabs sum to 78 |
| V17 | Honesty split | P4 | Closed = Delivered + Dropped; Delivered = Accepted + Awaiting |
| V18 | Badge rules idempotent | P7 | no duplicate rules after 2 runs |
| V19 | Graceful degradation | P4 | blank `files`/`last_updated` render blank, never false |
| V20 | Enum enforcement | P2 | invalid status aborts with a named error |
| V21 | Fails fast on missing env | P3 | clear error, no silent default |
| V22 | Owner smoke | after P7 | Summary legible; Blockers correct by party |

## 11. Rollback

```bash
rm memory/change_requests/index.yml memory/tools/registry_sync.py \
   memory/tools/.registry_state.json memory/change_requests/CHANGELOG.md
# remove the 2 keys from backend/.env by targeted edit
# delete the spreadsheet, or simply stop sharing it with the service account
```

No application code, no migration, no data change. `README.md` is untouched throughout, so the
registry itself cannot be damaged by this CR or by its removal.

## 12. Effort

| Phase | Estimate |
|---|---|
| P1–P2 (index + validation + audit) | ~2 h |
| P3 (auth smoke) | ~20 min once credentials exist |
| P4 (views, routing, Summary) | ~2–3 h |
| P5 (push, 8 tabs) | ~1.5 h |
| P6 (changelog + snapshot) | ~1 h |
| P7 (formatting + protection) | ~1 h |
| **Total** | **~8–9 h**, excluding the O-G1 hand-authoring pass |

## 13. Outstanding before Role 3 can open

1. **Credentials** (§4) — spreadsheet ID + service-account JSON path. Hard blocker for P3 onward; P1, P2 and P4 can proceed without them.
2. **Auth pattern confirmation** (§3) — service account, not the playbook's OAuth flow.
3. **Money-path ratification** — 7 items proposed.
4. **ROLE 13 ruling** — unrelated to this plan's execution, but it defines who owns the tool afterwards.
5. **`Role 3 approved for CR-2026-10-04-006`.**

---

```text
Planning complete: CR-2026-10-04-006
Stage: Implementation Plan (Gate 3)
Code reality: NONE
Risk: LOW
Files WILL change: memory/change_requests/index.yml (new) · memory/tools/registry_sync.py (new) ·
                   memory/change_requests/CHANGELOG.md (new) ·
                   memory/tools/.registry_state.json (new) · backend/.env (+2 keys, targeted)
Files WILL NOT touch: memory/change_requests/README.md · backend/server.py · frontend/** ·
                      requirements.txt · package.json · contract §1-§6 · OWNERSHIP_MAP.md ·
                      operating prompt + addendum · all sprint items
Owner decisions: credentials (§4) · auth pattern deviation from playbook (§3) ·
                 money-path list of 7 · ROLE 13 ruling
Docs: CR-2026-10-04-006-google-sheet-registry-mirror/IMPLEMENTATION_PLAN.md
Next: Owner Approval (gate 4) — then Implementation
```
