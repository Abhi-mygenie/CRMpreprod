# Intake Doc — CR-2026-07-03-010

**ID:** CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization
**Session:** 2026-07-03
**Operator agent:** E1
**Role:** Role 1 (INTAKE) — per `control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` §8.

---

## 1. Owner report (verbatim)

> "Why the CR number is like 0044-0048. A lot of CR, so how this registry is disturbed? Can you investigate quickly?"
> (follow-up) "Want me to raise this as a formal CR-YYYY-MM-DD-NNN intake (Role 1) + plan"

## 2. Summary

Registry / issue-tracking layer of this branch (`3-july`) has drifted into a state where **two parallel ID schemes coexist without a canonical index**, **two "BUG_TRACKER" files disagree on scope**, and one CR folder mixes both schemes (`BUG-035-039-040-041-order-placement-fixes/`). Dashboard stats in the primary BUG tracker are stale since Session 13 (Apr 14, 2026). One CR number (`CR-2026-07-03-006`) is a documented tombstone (renamed to `INV-2026-07-03-001`) but the tombstone isn't listed in the registry table — only in a footnote.

The `0044–0048` numbering the owner asked about is legitimate: `BUG-044..BUG-048` are five consecutive Apr-14-2026 CRM/env bugs in `/app/memory_repo/BUG_TRACKER.md`. They are internally correct. The problem is the **ecosystem around them**, not the numbers.

## 3. Classification

| Field | Value |
|---|---|
| Type | CR — process / documentation change (no runtime code) |
| Severity | **P2** (Important, workaround exists — team can navigate today, but risk grows with time) |
| Risk | **LOW** — docs-only, no runtime behaviour, no schema/API/auth impact, no hotspot files touched (per Alpha v0.1 §5 + Part C override table) |
| Duplicate check | **DISTINCT** — no CR in `memory/change_requests/` or `memory_repo/change_requests/` addresses ID-scheme unification. Adjacent items: `metadata_branch_diff_investigation/` (about branch metadata drift), `README.md` (session-scoped disclaimer only). |
| Evidence | ✅ captured — full inventory in §5 below |
| Blast radius | **SMALL** — file renames + markdown edits inside `memory/` and `memory_repo/`. No code, no tests, no build artefacts. Zero runtime blast radius. |
| Priority ranking | Below all shipped/planned code CRs in this session (000, 004, 005, 007, 008, 009). Ship whenever registry hygiene becomes a blocker or before onboarding a new agent. |

## 4. Evidence

Concrete findings from the investigation immediately preceding this CR:

| # | Finding | Location |
|---|---|---|
| E-01 | Two BUG_TRACKER files with same base name, different scope | `memory_repo/BUG_TRACKER.md` (50 IDs, 2,572 lines) vs `memory_repo/BUG_TRACKER_v2.md` (11 IDs, 271 lines) |
| E-02 | Neither file declared canonical; readers routed to different files by different docs | Alpha v0.1 addendum §10.1349 → v2; SESSION_HANDOVER §8 line 107 → non-v2 |
| E-03 | Dashboard stats stale (says 14 bugs / 0 open P0/P1; reality is 50 IDs with multiple open) | `memory_repo/BUG_TRACKER.md` lines 34–43 |
| E-04 | Hybrid ID folder violates Alpha v0.1 §10.1350/§10.1364 (one folder = one ID) | `memory/change_requests/BUG-035-039-040-041-order-placement-fixes/` |
| E-05 | Missing CR-006 in registry table with no tombstone entry (only prose in §98) | `memory/change_requests/README.md` line 98 |
| E-06 | Two ID schemes (`BUG-NNN` global vs `CR-YYYY-MM-DD-NNN` per-day) coexist with no documented migration or precedence rule | Alpha v0.1 §10.1350 + §10.1364 both listed with no arbitration |
| E-07 | `memory/change_requests/README.md` explicitly disclaims itself as authoritative ("Not an issue tracker") — leaves the branch with no declared registry index | line 87 of README |

## 5. Requested outcome (what "done" looks like)

1. One canonical BUG tracker file with a clear name; the audit-scoped v2 file renamed to remove the "tracker" suffix.
2. One README at `memory/change_requests/README.md` that arbitrates between `BUG-NNN` (legacy, closed sequence — the 50 existing IDs stay as-is) and `CR-YYYY-MM-DD-NNN` (all new work).
3. The hybrid `BUG-035-039-040-041-order-placement-fixes/` folder either (a) renamed to the CR scheme with backward-reference notes inside, or (b) explicitly whitelisted as a historical exception. Owner picks.
4. Missing-CR tombstones (CR-006 today, others in future) surfaced as first-class rows in the registry table.
5. Dashboard stats in the canonical BUG tracker refreshed.

## 6. Constraints & do-not-touch

Per Alpha v0.1 Part B §12 and Part C override:

- ❌ No code changes. Docs only.
- ❌ No renaming of any file under `frontend/src/`, `backend/`, or `.emergent/`.
- ❌ No changes to closed / shipped CR folders' internal content — only cross-links added.
- ❌ Do not delete or restructure `memory/` or `memory_repo/` roots (§12 rule 13).
- ❌ Do not renumber any existing `BUG-NNN` — that would break every historical cross-reference in commit history, older handovers, and Emergent QA reports.
- ✅ Allowed: create new markdown files, rename markdown files, add table rows to READMEs, add tombstone entries.

## 7. Owner decisions surfaced (needed before Role 3)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D-01 | Rename `BUG_TRACKER_v2.md` → what? | (a) `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` (b) delete after content-merge (c) keep as-is with header banner | (a) — preserves audit provenance, removes "v2" ambiguity |
| D-02 | Handle `BUG-035-039-040-041-order-placement-fixes/` folder | (a) rename to `CR-2026-04-11-001-order-placement-fixes/` (b) leave as historical exception, add `.HISTORICAL` note | (a) if owner wants strict scheme; (b) if owner prefers zero churn |
| D-03 | Legacy `BUG-NNN` sequence — freeze or continue? | (a) freeze at BUG-050 (no more BUG-NNN issued), all new bugs get `CR-YYYY-MM-DD-NNN` (b) continue global sequence indefinitely | (a) — aligns with Alpha v0.1 §10.1364 default |
| D-04 | Canonical bug tracker file name | (a) keep `BUG_TRACKER.md` (b) rename to `BUG_REGISTRY.md` (c) split into `OPEN_BUGS.md` + `BUG_HISTORY.md` | (a) — least churn, most compatible with existing references |

## 8. Docs updated during Intake

- `memory/change_requests/CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization/INTAKE_DOC.md` (this file)
- `memory/change_requests/CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization/CR.md`
- `memory/change_requests/CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization/IMPACT_ANALYSIS.md`
- `memory/change_requests/CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization/IMPLEMENTATION_PLAN.md`
- `memory/change_requests/README.md` — new row + tombstone example

## 9. Compact Role 1 exit block

```text
Intake complete: CR-2026-07-03-010
Classification: CR (process / documentation)
Severity: P2
Risk: LOW
Duplicate check: DISTINCT
Evidence: captured (7 findings, see §4)
Blast radius: SMALL (docs-only, no runtime code)
Docs updated: memory/change_requests/CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization/{INTAKE_DOC.md, CR.md, IMPACT_ANALYSIS.md, IMPLEMENTATION_PLAN.md}; memory/change_requests/README.md (row added)
Next: Planning (Role 2) — see IMPACT_ANALYSIS.md and IMPLEMENTATION_PLAN.md in same folder
```
