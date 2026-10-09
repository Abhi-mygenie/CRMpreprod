# Intake Doc — CR-2026-07-04-002

**ID:** CR-2026-07-04-002-registry-finish-up
**Session:** 2026-07-04
**Operator agent:** E1
**Role:** Role 1 (INTAKE) per Alpha v0.1 §8

---

## 1. Owner report / origin

Filed as follow-up bundle during registry hygiene work in CR-2026-07-03-010. Three related docs-only items surfaced in `CR-010/IMPACT_ANALYSIS.md §8` but were deliberately scope-locked out of CR-010's shipping scope. They now consolidate into one coherent finishing CR.

Owner approval to consolidate (2026-07-04): "option A" — file the three consolidated CRs as proposed.

## 2. Summary

Three docs-only cleanups that finish the CR-010 registry canonicalization story:

- **A. Alpha v0.1 prompt reference update** — addendum §10.1349 still names `BUG_TRACKER_v2.md` which no longer exists (renamed to `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` by CR-010).
- **B. 39-item reconciliation** — the audit doc `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` (formerly `BUG_TRACKER_v2.md`) dropped 39 items from the canonical `BUG_TRACKER.md`. Determine which are still open, which are duplicates of newer CRs, which are closed but not marked as such.
- **C. Legacy folder audit** — `memory_repo/change_requests/` holds 24 date-stamped legacy files with a third ID pattern that neither CR-YYYY-MM-DD-NNN nor BUG-NNN uses. Decide fate: fold into canonical scheme with tombstones, freeze as historical exception, or something else.

## 3. Classification

| Field | Value |
|---|---|
| Type | CR — process / documentation |
| Severity | **P3** (housekeeping — no runtime impact) |
| Risk | **LOW** — docs-only, no runtime code, no schema change |
| Duplicate check | **DISTINCT** — each sub-item was explicitly scope-locked out of CR-010 |
| Evidence | Enumerated in CR-010 `IMPACT_ANALYSIS.md §8` (CR-followup-A/B/C) |
| Blast radius | **SMALL** — 1 file edit (A) + potentially 40+ table row edits (B) + directory-level annotation (C) |
| Priority | Low. Ship when next-agent has spare cycles. |

## 4. Scope

**IN scope:**
- **A.** Edit `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` addendum §10.1349 to reference `BUG_TRACKER.md` as canonical (and note the audit-suffixed rename). Requires owner sign-off because it modifies the operating prompt itself.
- **B.** For each of the 39 items missing from `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` (BUG-011..041 and BUG-043..050 excluding the 11 already in the audit): confirm status against canonical `BUG_TRACKER.md`, mark closed ones as closed in the canonical if not already, cross-link new CRs that superseded them.
- **C.** Add a `README.md` (or similar) to `/app/memory_repo/change_requests/` explaining the third ID pattern, whether new items may use it, and how it relates to `memory/change_requests/`.

**OUT of scope:**
- No new tracker migrations (that's CR-followup-D, business decision, not this CR).
- No renumbering of any existing IDs — all historical IDs remain immutable per CR-010's rule.
- No code changes.
- Not editing any closed CR's internal artefacts (add cross-links only if needed).

## 5. Success criteria (draft — refined at Planning)

| # | Criterion | Verification |
|---|---|---|
| S-01 | Alpha v0.1 §10.1349 mentions `BUG_TRACKER.md` as canonical, `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` as historical audit | grep |
| S-02 | Each of the 39 dropped items has a status recorded in canonical `BUG_TRACKER.md` matching reality (open/closed/duplicate) | Owner spot-check on 5 random items |
| S-03 | `memory_repo/change_requests/` has a README explaining its ID scheme + relation to `memory/change_requests/` | file exists |
| S-04 | No changes to `frontend/`, `backend/`, `.env`, or `.emergent/` | `git status` clean outside memory/ + memory_repo/ |

## 6. Prerequisites

- **A** — owner sign-off on modifying the operating prompt.
- **B** and **C** — none. Can be executed by any agent with docs-only access.

## 7. Owner decisions needed at Planning gate

| # | Decision | Options |
|---|---|---|
| D-01 | Update Alpha v0.1 prompt in-place, or bump to v0.2? | (a) in-place (b) new v0.2 with changelog |
| D-02 | For 39 dropped items — reconcile in canonical BUG_TRACKER.md, or add a "See also" section to the audit doc? | (a) update canonical (b) update audit doc (c) both |
| D-03 | Legacy `memory_repo/change_requests/` — allow new items in that scheme, or freeze it? | (a) freeze (b) continue (c) migrate to CR-YYYY-MM-DD-NNN with tombstones |

## 8. Estimated effort

- **A** — 15 min (single file edit, one string swap + rewording of context)
- **B** — 2–3 hrs (39 items × ~3 min each = ~2 hrs of grep + status verification + row update)
- **C** — 30 min – 1 hr (dir README + optional cross-links)
- **Total: 3–4 hrs**

## 9. Related items

- **CR-2026-07-03-010** — the parent CR this finishes
- Alpha v0.1 addendum §10.1349 — the docstring being corrected

## 10. Compact Role 1 exit block

```text
Intake complete: CR-2026-07-04-002
Classification: CR (process / docs consolidation)
Severity: P3
Risk: LOW
Duplicate check: DISTINCT
Evidence: linked (CR-010 IMPACT_ANALYSIS §8)
Blast radius: SMALL
Docs updated: memory/change_requests/CR-2026-07-04-002-registry-finish-up/{INTAKE_DOC.md, CR.md}, memory/change_requests/README.md (row added)
Blocked by: owner D-01..D-03; A also needs prompt-modification sign-off
Next: Planning (Role 2) — whenever anyone picks it up. NO urgency.
```
