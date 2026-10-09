# CR-2026-07-04-002 — Registry Finish-Up (A + B + C consolidated)

**Status:** 📝 REGISTERED (Role 1 intake complete)
**Session:** 2026-07-04
**Priority:** P3
**Severity:** P3
**Risk of change:** LOW — docs only, no runtime code
**Fast Lane:** ⚠️ Not eligible if sub-item A (touches operating prompt) is included

**Related:**
- Parent: [`CR-2026-07-03-010`](../CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization/CR.md) (the finishing story)
- Docs evidence: [`CR-010/IMPACT_ANALYSIS.md §8`](../CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization/IMPACT_ANALYSIS.md#8-follow-ups-intentionally-deferred)

---

## 1. Problem

CR-010 canonicalized the registry (renamed BUG_TRACKER_v2, added ID Scheme section, tombstoned CR-006, refreshed stats). Three cleanups were explicitly deferred so CR-010 could ship in one atomic commit. Those three items live here.

## 2. Three sub-items

### A. Alpha v0.1 addendum §10.1349 stale reference

The operating prompt still names `BUG_TRACKER_v2.md` which no longer exists on disk. Update to reference `BUG_TRACKER.md` (canonical) and note the rename to `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md`.

**Requires:** owner sign-off on prompt modification (D-01).

### B. 39 items missing from architectural audit doc

`BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` only covers 11 of the 50 IDs in canonical `BUG_TRACKER.md`. The other 39 (BUG-011..041 and BUG-043..050 excluding the 11 already covered) need status reconciliation:

- Confirm which are truly closed (status in canonical matches reality)
- Mark duplicates that were superseded by CR-YYYY-MM-DD-NNN items
- Cross-link to superseding CRs

### C. Legacy `memory_repo/change_requests/` folder

24 date-stamped files with a third ID pattern (neither `CR-YYYY-MM-DD-NNN` nor `BUG-NNN`). Currently silent. Add a README explaining what this folder is, whether new items may use it, and how it relates to the canonical `memory/change_requests/`.

## 3. Scope

**IN:** 3 items above.
**OUT:** New tracker migrations (that's business decision, out of scope). Renumbering historical IDs (immutable per CR-010).

## 4. Success criteria

See `INTAKE_DOC.md §5`.

## 5. Effort

**3–4 hrs total** (15 min A, 2–3 hrs B, 30 min – 1 hr C).

## 6. Owner decisions (from INTAKE_DOC §7)

- **D-01:** Update Alpha v0.1 in-place, or bump to v0.2?
- **D-02:** For 39 dropped items — reconcile in canonical BUG_TRACKER.md, audit doc, or both?
- **D-03:** Legacy folder — freeze, continue, or migrate?

## 7. Non-goals

- Not a tracker port (Jira / Linear / GitHub Issues) — that's a business initiative.
- Not a code change.
- Not a `.gitignore` change.
- Not a schema change.

---

Full Impact Analysis + Implementation Plan written at Role 2 after owner answers D-01..D-03.
