# Impact Analysis — CR-2026-07-03-010

**Role:** Role 2 (PLANNING) — per Alpha v0.1 §8 Role 2.
**Author:** E1, 2026-07-03
**Code reality check:** N/A (no runtime code involved)
**Risk (post-analysis):** LOW — unchanged from Intake.

---

## 1. Files that WILL change

| Path | Change type | Why |
|---|---|---|
| `memory_repo/BUG_TRACKER_v2.md` | **RENAME** → `memory_repo/BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` (pending D-01 owner pick) | Removes ambiguous "v2" that competes with `BUG_TRACKER.md`. Content unchanged. |
| `memory_repo/BUG_TRACKER.md` | **EDIT** — add canonical-source header banner + refresh stats block (§ Bug Summary Dashboard first `Stats` sub-table only) | Marks it authoritative; makes counts real. |
| `memory/change_requests/README.md` | **EDIT** — add "ID Scheme" section (§ new); add tombstone row for CR-006; add row for CR-010; update Artefacts table if needed. | Provides one place to arbitrate schemes; formalises tombstone convention. |
| `memory/change_requests/BUG-035-039-040-041-order-placement-fixes/` | **RENAME → `CR-2026-04-11-001-order-placement-fixes/`** (if owner picks D-02 option (a)) OR **add `.HISTORICAL_EXCEPTION.md`** (if D-02 option (b)) | Enforces one-ID-per-folder rule OR whitelists the exception. |
| `memory/change_requests/BUG-035-039-040-041-order-placement-fixes/BUG_REPORT.md` | **EDIT** — add cross-reference header listing all four BUG IDs it covers, plus a note pointing at the (possibly renamed) parent folder | Preserves discoverability. |
| `memory/SESSION_HANDOVER_2026-07-03.md` | **APPEND** — one line in §3 (planned but not shipped) referencing CR-010 as REGISTERED | Keeps handover current. |

## 2. Files that WILL NOT change

Locked for this CR. Any change touching these turns the CR into a scope violation (Alpha v0.1 §11 R4):

- `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` (read-only for this CR)
- Any file under `frontend/`, `backend/`, `.emergent/`, `tests/`, `test_reports/`
- Any `.env` file
- Any file under `memory/change_requests/CR-2026-05-30-*/`, `CR-2026-06-17-*/`, or `INV-2026-06-17-*/` (closed / historical)
- Any file under `memory/change_requests/CR-2026-07-03-000..009/` beyond adding a cross-link in README rows (their internal artefacts are frozen)
- `memory_repo/change_requests/` (pre-existing 24-file legacy tracker — out of scope, will get its own future CR)
- Any `.md` file under `memory_repo/current-state/` or `memory_repo/qa_artifacts/`
- Any file under `memory/v2/` (baseline / audit corpus)

## 3. Downstream consumers who need to know

| Consumer | Impact | Mitigation |
|---|---|---|
| Future agents reading `memory_repo/BUG_TRACKER_v2.md` at old path | 404 after rename | Rename covered by git; add search hint in `BUG_TRACKER.md` header banner: "The audit doc formerly at `BUG_TRACKER_v2.md` is now at `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md`." |
| Alpha v0.1 addendum §10.1349 which points readers at `BUG_TRACKER_v2.md` | Stale reference | **Do not edit the prompt** (out-of-scope per §2). Instead, put a redirect line in the new file's header pointing readers to the canonical tracker. Owner may re-issue the prompt as v0.2 in a separate CR. |
| SESSION_HANDOVER_2026-07-03.md §8 already points at `BUG_TRACKER.md` (non-v2) | No impact — already consistent with the canonical choice | None needed. |
| Any commit-history / older handover referencing `BUG-035..041` directly | No impact — IDs are preserved inside the (possibly renamed) folder's `BUG_REPORT.md` | Cross-reference header added to `BUG_REPORT.md`. |
| External systems consuming these markdowns (nginx `/api/docs/*`, `frontend/public/*.md` — see Addendum §12 rule 8) | Zero — none of the files this CR touches are served publicly by the frontend or backend. `.gitignore` already blocks `frontend/public/*.md` (line 91). | Verified in `.gitignore`. |
| Git blame / rename detection | Git handles it via `git mv`; hash-based rename detection preserves history. | Use `git mv` for the two renames, not `rm + add`. |

## 4. Data-flow / dependency trace

No runtime data flows are touched. The only "dataflow" is:

```
agent-onboarding
   → read memory/control/ (unchanged)
     → read memory/change_requests/README.md  ← CANONICAL INDEX after this CR
       → follow to specific CR/INV folders
   → read memory_repo/BUG_TRACKER.md          ← CANONICAL BUG TRACKER after this CR
     → cross-referenced from README's "ID Scheme" section
```

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A future agent still opens the archived `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` and treats it as current | LOW | LOW | Add a "STATUS: HISTORICAL — See BUG_TRACKER.md" banner at line 1 of the renamed file |
| Owner disagrees with rename target after execution | LOW | LOW | Docs-only — trivially reversible with another `git mv` |
| Broken markdown link elsewhere in the repo | LOW | LOW | Verification step V-06 (see IMPLEMENTATION_PLAN.md) — `grep -r "BUG_TRACKER_v2"` before commit |
| Scope creep into renumbering existing BUG-NNN IDs | LOW | HIGH | Explicit rule in CR.md §6 + Plan §V-07: any renumbering aborts the CR |
| Rename churn confuses whoever is midway through reading the tracker | VERY LOW | LOW | Do all renames + banner edits in a single atomic commit |
| Alpha v0.1 prompt's own stale reference to `BUG_TRACKER_v2.md` becomes visible | HIGH (it's already stale) | LOW | Explicitly out-of-scope. Flagged as follow-up CR (see Follow-ups section) |

## 6. Regression / verification matrix

Because there is no runtime code, "regression" here is documentation integrity, not functional testing.

| ID | Check | Method |
|---|---|---|
| V-01 | Canonical tracker resolves | `find memory_repo -name "BUG_TRACKER*.md"` → exactly 1 hit |
| V-02 | Old tracker filename removed from filesystem | `find memory_repo -name "BUG_TRACKER_v2.md"` → 0 hits |
| V-03 | Archived tracker exists at new name with HISTORICAL banner in line 1–5 | `head -5 memory_repo/BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` |
| V-04 | README ID-Scheme section present | `grep -c "^## ID Scheme" memory/change_requests/README.md` → ≥1 |
| V-05 | CR-006 tombstone row present | `grep "CR-2026-07-03-006" memory/change_requests/README.md` → hit with TOMBSTONE marker |
| V-06 | No dangling refs | `grep -r "BUG_TRACKER_v2" /app --include="*.md"` → only expected hits (the redirect note + Alpha v0.1 which is out of scope) |
| V-07 | No historical BUG-NNN renumbered | `git diff` shows zero edits inside any BUG-NNN row's ID field |
| V-08 | Bug summary count matches reality | Grep-count IDs in canonical tracker matches the number in the stats block |
| V-09 | Alpha v0.1 prompt file unchanged | `git status memory/control/` clean |
| V-10 | No frontend/backend/env drift | `git status frontend/ backend/ .env` clean |

## 7. Effort & sequencing

| Phase | Effort | Owner | Blocking |
|---|---|---|---|
| Role 2 planning (this doc) | 45 min | E1 | done |
| Owner decisions D-01..D-04 | ~15 min | Owner | Blocks Role 3 |
| Role 3 implementation | 30–45 min | E1 (or any agent) | Needs D-01..D-04 |
| Role 4 QA (self + owner spot-check) | 15 min | E1 + Owner | Needs Role 3 done |
| Closure | 5 min | E1 | Needs QA pass |

Total wall-clock from approval to closure: ~90 minutes.

## 8. Follow-ups intentionally deferred

These are visible from this analysis but out-of-scope; they should each get their own CR later:

- **CR-followup-A:** Update Alpha v0.1 addendum §10.1349 to point at the canonical tracker name. Requires owner because it edits the operating prompt itself.
- **CR-followup-B:** Row-by-row reconciliation of the 39 items dropped from BUG_TRACKER_v2. Determine which are still open, which are closed, which are duplicates of newer CRs.
- **CR-followup-C:** Same-shape audit of `memory_repo/change_requests/` (24 date-stamped legacy files with a completely different ID pattern) to decide whether to fold them into the new scheme or freeze them alongside `BUG-NNN`.
- **CR-followup-D:** Port both trackers to a real issue tracker (Jira / Linear / GitHub Issues). Business decision, needs owner buy-in.

## 9. Compact Role 2 exit block

```text
Planning complete: CR-2026-07-03-010
Stage: Impact Analysis + Implementation Plan
Code reality: N/A (docs-only)
Risk: LOW
Files WILL change: 6 markdown files (see §1)
Files WILL NOT touch: memory/control/, frontend/, backend/, .env, closed CR folders, memory_repo/change_requests/, memory/v2/ (see §2)
Owner decisions: 4 (D-01..D-04 in INTAKE_DOC §7)
Docs: memory/change_requests/CR-2026-07-03-010-.../{INTAKE_DOC.md, CR.md, IMPACT_ANALYSIS.md, IMPLEMENTATION_PLAN.md}
Next: Owner approval on D-01..D-04, then Role 3 Implementation (mechanical execution of IMPLEMENTATION_PLAN.md)
```
