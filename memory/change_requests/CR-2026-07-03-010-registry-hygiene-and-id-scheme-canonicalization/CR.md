# CR-2026-07-03-010 — Registry hygiene & ID-scheme canonicalization

**Status:** ✅ SHIPPED (Role 1 intake, Role 2 planning, Role 3 implementation, Role 4 self-QA all complete on 2026-07-03; owner approved defaults D-01=a, D-02=a, D-03=a, D-04=a)
**Session:** 2026-07-03
**Priority:** P2
**Risk:** LOW
**Type:** Process / documentation (no runtime code)

---

## 1. Problem statement

The `3-july` branch has two parallel bug-tracking schemes (`BUG-NNN` global vs `CR-YYYY-MM-DD-NNN` per-day), two BUG_TRACKER files with the same base name and conflicting content, one hybrid CR folder using both schemes at once (`BUG-035-039-040-041-order-placement-fixes/`), and a stale dashboard in the primary tracker. There is no single canonical index and no tombstone convention for renamed CRs (like the CR-006 → INV-001 rename this session).

Full evidence trail: `INTAKE_DOC.md` §4.

## 2. Why now

- The last session (2026-07-03) added 10 new items and had to retroactively fix 10 Role-1 gaps; this exposed the drift.
- The Alpha v0.1 operating prompt (§10 line 740) makes registry sync a QA gate — the current state technically fails that gate.
- Next agent onboarding cost is high: they have to reverse-engineer which tracker to trust.

## 3. Scope

**IN scope:**
- Rename / annotate the audit-only BUG_TRACKER_v2.
- Update `memory/change_requests/README.md` with (a) ID-scheme arbitration section, (b) tombstone row convention, (c) row for CR-006 tombstone, (d) row for this CR-010.
- Add a header banner to the canonical bug tracker reasserting its authority + a refreshed stats block.
- Decide the fate of `BUG-035-039-040-041-order-placement-fixes/` (owner decision D-02 in INTAKE_DOC.md).
- Add cross-links so old refs still resolve.

**OUT of scope:**
- Any runtime code change (frontend, backend, env, supervisor, DB).
- Renumbering any existing `BUG-NNN` — historical IDs are immutable.
- Merging content of the two BUG trackers row-by-row (that's a future audit CR, not this one).
- Migrating existing CRs into a new ticketing system.
- Fixing stats math for closed items in BUG_TRACKER.md beyond the summary block.

## 4. Success criteria

| # | Criterion | Verification |
|---|---|---|
| S-01 | One file named `BUG_TRACKER.md` and no other file with the string `BUG_TRACKER` in its base name. | `find memory_repo -name "BUG_TRACKER*.md"` returns exactly one row. |
| S-02 | `memory/change_requests/README.md` has an **"ID scheme"** section that explicitly names `BUG-NNN` as frozen legacy and `CR-YYYY-MM-DD-NNN` / `INV-YYYY-MM-DD-NNN` as current. | Grep for the section header + owner reads it and confirms. |
| S-03 | Tombstone row for `CR-2026-07-03-006 → INV-2026-07-03-001` exists in the README table with a "TOMBSTONE" status marker. | Row present in table. |
| S-04 | `BUG-035-039-040-041-order-placement-fixes/` is either renamed or has a `.HISTORICAL_EXCEPTION.md` file explaining why the pre-CR name is retained. | Directory listing check. |
| S-05 | Dashboard stats in canonical BUG_TRACKER.md reflect actual count (50 IDs today) and today's open count is real. | Owner spot-check on 3 random IDs. |
| S-06 | No existing markdown link in the repo is broken by any rename. | `grep -r "BUG_TRACKER_v2"` returns either 0 hits or only hits pointing at the new name via a redirect note. |
| S-07 | The Alpha v0.1 prompt itself is NOT modified (`memory/control/*` is read-only for this CR). | `git status memory/control/` clean at end. |

## 5. Related items

| Item | Relation |
|---|---|
| Alpha v0.1 operating prompt §10 (Code and Registry Rules) | Defines the constraint being remediated |
| `memory/change_requests/README.md` | Primary artefact this CR touches |
| `memory_repo/BUG_TRACKER.md` + `BUG_TRACKER_v2.md` | Primary artefacts this CR renames/annotates |
| SESSION_HANDOVER_2026-07-03.md §7 | Documents that Role 1 was skipped for prior CRs; this CR is the follow-on cleanup |
| `INV-2026-07-03-001` | Its rename from CR-006 is the archetype tombstone this CR formalises |
| `metadata_branch_diff_investigation/` | Adjacent but distinct — that CR is about branch-level metadata drift, not tracker IDs |

## 6. Non-goals (explicit)

- Not a bug tracker migration to Jira/Linear/GitHub Issues. That's a business decision, not an agent decision.
- Not a rewrite of the operating prompt to disambiguate — this CR lives *under* the prompt's rules, not above them.
- Not touching any tests, `test_reports/`, or QA artefacts.

## 7. Owner sign-off checklist

Owner must approve, before Role 3 (Implementation) starts, four decisions listed in `INTAKE_DOC.md` §7:

- [ ] D-01: `BUG_TRACKER_v2.md` renaming target
- [ ] D-02: fate of `BUG-035-039-040-041-order-placement-fixes/`
- [ ] D-03: freeze or continue legacy `BUG-NNN` sequence
- [ ] D-04: canonical bug tracker file name

Once these are answered, the Implementation Plan (already written, see `IMPLEMENTATION_PLAN.md`) becomes a mechanical execution.
