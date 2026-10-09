# QA HANDOVER — CR-2026-10-04-006 (Google Sheet registry mirror)

**Role:** 3 — IMPLEMENTATION AGENT · **Gate:** 5 → 6 (Implementation complete, QA open)
**Date:** 2026-10-05 · **Risk:** LOW · **App code touched: NONE**
**Basis:** `IMPLEMENTATION_PLAN.md` + `AUTH_AMENDMENT.md`

---

## 1. Exit gate (Role 3, 7 checks)

| # | Check | Status |
|---|---|---|
| 1 | Registry updated | ✅ `README.md` row 400 rewritten **by hand**, not by the generator (O-G3 intact) |
| 2 | Issue tracker updated | ✅ `index.yml` is now the tracker; `CHANGELOG.md` opened |
| 3 | File ownership updated | ✅ new paths are all under `memory/tools/` and `memory/change_requests/`; no existing owner displaced |
| 4 | Code markers added | ✅ `CR-2026-10-04-006` in both scripts' docstrings |
| 5 | Build/compile/test clean | ✅ `ruff` clean; backend and frontend untouched, so no build impact |
| 6 | Self-test complete | ✅ 9/9, §3 |
| 7 | QA handover written | ✅ this file |

**Exit Gate: 7/7 PASS**

## 2. What was built

| File | Lines | Purpose |
|---|---|---|
| `memory/tools/registry_sync.py` | ~560 | `bootstrap` · `audit` · `propose` · `sync [--dry-run]` |
| `memory/change_requests/index.yml` | 78 records | typed source of truth |
| `memory/change_requests/CHANGELOG.md` | append-only | field-level change log |
| `memory/tools/.registry_state.json` | snapshot | diff basis (plan §8) |
| `memory/tools/.registry_csv/` | 9 CSVs | local mirror of every tab, for `--dry-run` review |
| `CR-.../STATUS_WORKSHEET.md` | 78 rows | owner adjudication worksheet (see §5) |
| `memory/tools/probe_sheets_oauth.py` | ~210 | Gate-0 auth probe (+ `settitle`) |

**Live Sheet:** `Scan and Order issue tracker` — 9 tabs: `Summary · All Items · Intake · Planning ·
Implemented · QA · Smoke · Closed · Blockers`. The owner-created `Sheet1` was removed after the
named tabs existed (a spreadsheet cannot hold zero sheets, so the order matters).

**Not built, deliberately:** conditional-format badge rules and protected ranges (plan phase P7).
They style data that does not exist yet; building them before §5 is settled would be decoration.

## 3. Self-test results — 9/9 PASS

| V | Check | Method | Result |
|---|---|---|---|
| V1 | Index covers every item | `bootstrap` | **78 records**, 0 orphans, 0 duplicate ids |
| V2 | `README.md` never machine-written | `git status` after a full `sync` | **clean** — also clean for `server.py`, `frontend/**`, both `requirements.txt` |
| V3 | Round-trip stability | `sync` twice | second run: 0 changelog entries |
| V7 | "No changes" is explicit | read `CHANGELOG.md` | literal `- No changes since the last generation.` |
| V8 | Audit catches drift | created `CR-2099-01-01-999-fake-folder` | reported under *folders not in index*; removed after |
| V11 | `--dry-run` writes nothing | `sync --dry-run` | CSVs only, no API call, no changelog, no snapshot |
| V16 | Funnel arithmetic | `sync` | `0 routed + 78 unrouted = 78` |
| V20 | Enum enforcement | injected `status: NOT_A_REAL_STATUS`, `risk: SPICY` | **exit 1** with both violations named |
| V21 | Fails fast on missing env | `GOOGLE_SHEET_ID` absent mid-session | `KeyError`, no silent default |

**Sheet read-back confirms the push:** title `Scan and Order issue tracker`; 9 tabs in the expected
order; `Summary!A1` carries the generation banner; `All Items` holds 78 rows with the header at row 2.

## 4. 🔴 The honest headline: all six gate tabs are EMPTY

This is **correct behaviour, not a defect**, and it is the single most important thing for QA to
understand.

Tab routing keys off `status` and `next_gate` (plan §6). Neither is derivable from the filesystem —
`status` requires normalising README prose into the 13-value enum, which O-G4 classifies as
**interpretation, and forbids the agent from performing**: *"No status is ever guessed or
defaulted."* Impact analysis §5 measured the same thing (`status` needs interpretation;
7 of 92 rows were unclassifiable even by a bucketing script).

So `bootstrap` populated only what it can prove:

| Field | Coverage | Source |
|---|---|---|
| `id`, `type` | 78/78 | folder name |
| `title` | 78/78 | README title cell, falling back to the folder slug |
| `artefacts` | 78/78 | `ls` of each folder |
| `code_markers` | 78/78 — **26 true** | single-pass scan of `backend/**/*.py` + `frontend/src/**` |
| `registered` | 75/78 | the date inside the ID; blank for the 3 `02-XX` items, never invented |
| **everything else** | **0/78** | **awaiting owner adjudication** |

**A correction to the plan, found during implementation.** Impact analysis claimed `title` was
derivable 78/78 from documents. It is not — every artefact's H1 is just `INTAKE DOC — <ID>` and
carries no title. The working sources are the README title cell and the folder slug. Fixed; the
result is 78/78 real titles, 0 shorter than 6 characters.

## 5. Owner action required — the 78-row adjudication

`STATUS_WORKSHEET.md` lists every item with its artefacts, its code-marker flag and its **verbatim
README prose**, and a deliberately **empty `status` column**. No value was pre-filled — the agent
records but does not adjudicate.

Filling that column is what lights up the funnel, the 6 gate tabs and Summary blocks 1 and 4.
Until then the Sheet is a complete, accurate inventory with no pipeline view.

**Open design question for the owner.** Adjudicating 78 rows in markdown is laborious; a Google
Sheet column would be the natural place to do it. But reading those edits back would make the Sheet
an **input**, breaching D-G1's one-way rule. Needs a ruling: keep the worksheet in markdown, or
carve out a narrow, explicitly-scoped exception for this one-off import.

## 6. Two declared deviations from the plan — both need ratification

| # | Deviation | Why | Reversibility |
|---|---|---|---|
| D1 | **9 tabs, not 8** — added `All Items` | With `status` unadjudicated, every item routes nowhere, so a plan-exact 8-tab sheet would render **completely empty** and the CR would deliver nothing visible. `All Items` also matches the shape of the owner's own earlier `REGISTRY_EXPORT_2026_09_27`. | delete one entry from `TABS` |
| D2 | **18 fields, not 17** — `money_path` included | The planning docs contradict each other: plan §5's schema lists `money_path`, intake §4's 17-column list omits it, while Summary block 2 requires it. Included so the metric is not silently zero. | remove from `FIELDS` |

Neither touches application code. Both are listed here rather than buried, per Role 3 item 6
("stop if scope expands") — flagged rather than assumed.

## 7. Risks carried into QA

1. **🔴 Refresh-token expiry — unresolved, asked three times.** If the OAuth consent screen is in
   *Testing* status, Google expires the refresh token after **7 days**, forcing the browser consent
   to be repeated weekly, forever. This is the one risk that could make the tool impractical
   regardless of code quality. *Cloud Console → APIs & Services → OAuth consent screen → Publishing
   status.* If Testing: publish, or revert to the service account the plan originally specified.
2. **Local edits to the Sheet are destroyed without warning.** `sync` runs `values:batchClear` then
   rewrites. The banner row says `READ-ONLY, edits are overwritten`, but P7's protected ranges — the
   mechanism that would actually *prevent* it — are not built.
3. **Non-generated tabs are deleted.** `push` removes any tab not in `TABS` (this is how `Sheet1`
   went). Anyone adding a working tab to this spreadsheet will lose it on the next run.
4. **`last_updated` is blank for all 78** and starts accumulating only from now. By design —
   filesystem mtimes are uniformly the clone date and git has a single deploy commit, so any value
   would be fabricated.
5. **`INV-2026-08-06-001` is in the README with no folder on disk.** A genuine registry gap that
   `CR-2026-10-04-004`'s reconciliation missed. Audit reports it every run. Needs a ruling: create
   the folder, or tombstone the row.

## 8. How QA should verify

```bash
cd /app/memory/tools
python registry_sync.py audit            # expect: 0 orphans, 0 duplicates, 78 unadjudicated
python registry_sync.py sync --dry-run   # expect: CSVs only; 0 routed + 78 unrouted = 78
git status --porcelain memory/change_requests/README.md   # expect: EMPTY (V2)
python registry_sync.py sync             # expect: 9 tabs, "0 entries appended" on a repeat run
```

Then open the Sheet: `Summary` banner shows a fresh timestamp · `All Items` has 78 rows with the
header frozen at row 2 · the 6 gate tabs show a header and no data rows (§4) · `Blockers` states
that `blocked_on` is part of the hand-authoring pass.

## 9. Rollback

```bash
rm /app/memory/change_requests/index.yml /app/memory/change_requests/CHANGELOG.md
rm /app/memory/tools/registry_sync.py /app/memory/tools/.registry_state.json
rm -rf /app/memory/tools/.registry_csv
rm /app/memory/tools/probe_sheets_oauth.py /app/secrets/sheets_token.json
# revert the README row 400 edit; delete the spreadsheet; revoke consent at
# myaccount.google.com/permissions; remove the 3 GOOGLE_OAUTH_* / GOOGLE_SHEET_ID keys from .env
```

No application code, no migration, no customer impact.

---

```text
Code complete: CR-2026-10-04-006
Risk: LOW
Self-test: 9/9 PASS
Build/compile: PASS (no app code touched; ruff clean)
Registry sync: YES (README row 400, hand-authored)
Exit Gate: 7/7 PASS
Docs: CR-2026-10-04-006-google-sheet-registry-mirror/QA_HANDOVER.md · AUTH_AMENDMENT.md · STATUS_WORKSHEET.md
Next: QA — then owner adjudication of the 78 statuses (§5) and rulings on §6 D1/D2 and §7 risk 1
```
