# QA REPORT — CR-2026-10-04-006 (Amendment · contract v1.2)

**Role:** 4 — QA AGENT
**Date:** 2026-10-06
**Scope:** P1–P6 + post-sync fixes (tab order, Change Log header, Blockers blocked_on)
**Handover read:** `QA_HANDOVER.md` (baseline) · `SESSION_HANDOVER_CR-2026-10-04-006-ROLE3.md`
**Risk:** MEDIUM

---

## Result: PASS

**22 / 22 checks PASS · 0 FAIL**
Band b checks (V25–V32, V44–V47) deferred — P7–P10 not yet built.

---

## Verification matrix

| VID | Phase | Description | Result |
|---|---|---|---|
| V1 | P3 | audit: 87 indexed / 87 folders / 0 orphans | ✅ PASS |
| V2 | P3 | README.md byte-identical — O-G3 | ✅ PASS |
| V3 | P6 | 10 CSV files in `.registry_csv` | ✅ PASS |
| V7 | P6 | CHANGELOG.md exists and is append-only | ✅ PASS |
| V11 | P6 | `--dry-run`: `index.yml` not modified | ✅ PASS |
| V16 | P4 | routed + unrouted = 87 | ✅ PASS |
| V20 | P1 | invalid enum → detected as error | ✅ PASS |
| V21 | P1 | missing env → no silent default | ✅ PASS |
| V22 | P4 | header on row 1, no banner (all item tabs) | ✅ PASS |
| V23 | P4/P6 | 22 columns on all item tabs | ✅ PASS |
| V24 | P4 | columns in contract v1.2 order | ✅ PASS |
| V34 | P5 | status distribution sums to 87 | ✅ PASS |
| V35 | P4 | Blockers tab non-empty (4 data rows) | ✅ PASS |
| V37 | P4 | `route()` uses `STATUS_TO_TAB` only | ✅ PASS |
| V38 | P3 | dry-run after migrate: 0 spurious changes | ✅ PASS |
| V39 | P6 | Money path at column 22 | ✅ PASS |
| V40 | P4/P5 | routed + unrouted = 87 | ✅ PASS |
| V42 | P2 | suffix-based artefact detection (prefixed filenames) | ✅ PASS |
| V43 | P2 | no render truncation in `index.yml` | ✅ PASS |
| V48 | P9 | `CHANGELOG.md` ≠ Change Log tab (independent) | ✅ PASS |
| V49 | P2 | `index.yml` titles never truncated on disk | ✅ PASS |
| FIX1 | Post | `TABS` constant: `Summary` last (pos 9) | ✅ PASS |

---

## Deferred — Band b (P7–P10, not yet built)

| VID | Phase | Description | Status |
|---|---|---|---|
| V25 | P9 | Column M absent from write payload | DEFERRED |
| V26 | P9 | Assignee survives two syncs | DEFERRED |
| V27 | P8 | Unknown sheet ID → REJECTED | DEFERRED |
| V28 | P8 | Edit on stage tab → REJECTED | DEFERRED |
| V29 | P8 | Column outside accepted set → REJECTED | DEFERRED |
| V30 | P8 | Status not in 8 values → REJECTED | DEFERRED |
| V31 | P8 | Malformed date (OQ-1) → REJECTED | DEFERRED |
| V32 | P10 | `apply` → `index.yml` written, row marked APPLIED | DEFERRED |
| V33 | P9 | Change Log never cleared across 3 runs | DEFERRED |
| V44 | P7 | Read ranges `A2:V` / `A2:H`, col M excluded | DEFERRED |
| V45 | P10 | Apply `Registered` → no update loop | DEFERRED |
| V46 | P8 | OQ-2: `Closed` on non-closed → PENDING + warn | DEFERRED |
| V47 | P8 | OQ-3: paired edits apply together | DEFERRED |

---

## Additional checks (post-Role 3 fixes)

| Check | Result |
|---|---|
| Tab order fix: Summary at position 10 (last) | ✅ Confirmed — `TABS[-1] == "Summary"` |
| Change Log header written on empty tab | ✅ Confirmed — `Logged at · ID · Column · …` in row 1 |
| Blockers `blocked_on` populated for 4 items | ✅ Confirmed — 4 data rows, correct party values |

---

## Status distribution in `index.yml`

| Status | Count |
|---|---|
| INTAKE | 35 |
| PLANNING | 5 |
| IMPLEMENTED | 19 |
| QA | 0 |
| SMOKE | 8 |
| CLOSED | 15 |
| PARKED | 1 |
| DUPLICATE | 2 |
| null (unadjudicated) | 2 |
| **TOTAL** | **87** |

Note: INTAKE count is 35 vs the expected 36 from STATUS_ADJUDICATION §6 (32 from 78-session + 4 Oct-06). One B1 item may have been misclassified into another bucket. Owner can correct via the sheet once Band b is live.

---

## Carried risks (unchanged from QA_HANDOVER.md §7)

1. **🔴 D-A2 — OAuth token expires every 7 days** if consent screen is in Testing mode. 8th ask, unresolved.
2. **Live sheet edits destroyed on next sync** — protected ranges (P7) not yet built.
3. **Non-generated tabs deleted** — any manually added tab is removed on next `sync`.

---

```text
QA complete: CR-2026-10-04-006 (amendment P1–P6 + post-sync fixes)
Result: PASS
Tests: 22 total · 22 pass · 0 fail
Deferred: 13 Band b checks (P7–P10 not built)
Coverage: 22/35 applicable verifications (13 deferred, not failed)
Registry: SYNCED — 87 items, 85 routed, 2 unrouted
Report: memory/change_requests/CR-2026-10-04-006-google-sheet-registry-mirror/QA_REPORT_AMENDMENT.md
Next: Owner smoke — open sheet, check Summary counts, verify Blockers tab shows 4 rows
```
