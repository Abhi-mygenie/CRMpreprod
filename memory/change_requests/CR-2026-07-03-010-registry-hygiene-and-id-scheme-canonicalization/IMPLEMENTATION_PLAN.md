# Implementation Plan — CR-2026-07-03-010

**Role gate:** Role 3 (IMPLEMENTATION) — **BLOCKED** until owner answers D-01..D-04 in `INTAKE_DOC.md` §7.
**Author:** E1, 2026-07-03 (planning only — no code executed here)
**Risk:** LOW

---

## Precondition: owner decisions must be recorded first

Copy this table into a comment / PR / message once decisions are made. Implementation cannot start until every row has a value.

| ID | Question | Decision | Recorded by | Date |
|---|---|---|---|---|
| D-01 | Rename target for `BUG_TRACKER_v2.md` | `_____` | | |
| D-02 | Fate of `BUG-035-039-040-041-order-placement-fixes/` | `_____` | | |
| D-03 | Freeze legacy `BUG-NNN` sequence? | `_____` | | |
| D-04 | Canonical bug tracker filename | `_____` | | |

---

## Step-by-step edits (mechanical)

The plan below assumes owner picks the **recommended defaults** from INTAKE_DOC §7 (D-01 = rename to `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md`; D-02 = rename hybrid folder; D-03 = freeze BUG-NNN at 050; D-04 = keep `BUG_TRACKER.md`). Any deviation just changes the target filename in the corresponding step.

### Step 1 — Archive the audit-scoped tracker (D-01)

```bash
cd /app
git mv memory_repo/BUG_TRACKER_v2.md \
       memory_repo/BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md
```

Then, using `mcp_search_replace`, prepend a HISTORICAL banner as the new first block (before the existing "# Document Audit Status" header):

```markdown
> ⚠️ **STATUS: HISTORICAL AUDIT — NOT THE CANONICAL BUG TRACKER**
> This file is the code-verified architectural audit performed on 2026-05-14.
> It intentionally covers only a subset of the full bug population (11 of ~50 IDs at time of audit).
> For the canonical, live bug tracker see `BUG_TRACKER.md` in the same directory.
> Do not add new bugs here. Do not update statuses here.
> (Renamed from `BUG_TRACKER_v2.md` by CR-2026-07-03-010.)

---
```

### Step 2 — Reassert canonical tracker (D-04)

Edit `memory_repo/BUG_TRACKER.md` — **only** the header area (lines 1–5 today). Insert a canonical banner and refreshed stats block. Do NOT touch any BUG-NNN row.

Insert immediately after line 1 (title):

```markdown
> ✅ **STATUS: CANONICAL BUG TRACKER for the 3-july branch.**
> New bugs go here. Historical architectural audit is in `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md` (do not use for new work).
> ID convention: legacy `BUG-NNN` sequence is **frozen at BUG-050**. All new items use `CR-YYYY-MM-DD-NNN` / `INV-YYYY-MM-DD-NNN` and live under `memory/change_requests/`.
> Last canonical review: 2026-07-03 (CR-2026-07-03-010).
```

Then refresh the `### Stats` sub-table (~lines 34–43) with an actual count.  Command to derive the numbers (do NOT paste this into the tracker — just use it to produce the values):

```bash
grep -oE "^\| BUG-[0-9]{3}" /app/memory_repo/BUG_TRACKER.md | sort -u | wc -l
grep -E "^\| BUG-[0-9]{3}" /app/memory_repo/BUG_TRACKER.md | grep -c "🔴 P0"
grep -E "^\| BUG-[0-9]{3}" /app/memory_repo/BUG_TRACKER.md | grep -c "🟡 P1"
grep -E "^\| BUG-[0-9]{3}" /app/memory_repo/BUG_TRACKER.md | grep -c "✅ Fixed"
grep -E "^\| BUG-[0-9]{3}" /app/memory_repo/BUG_TRACKER.md | grep -cE "⏳|⏸️|🔍|⚠️"
```

Replace the stats table with the derived numbers. Add a `Note: sequence frozen at BUG-050 per CR-2026-07-03-010.`

### Step 3 — Handle hybrid folder (D-02)

**Option (a) — rename (recommended if D-02=a):**

```bash
cd /app
git mv memory/change_requests/BUG-035-039-040-041-order-placement-fixes \
       memory/change_requests/CR-2026-04-11-001-order-placement-fixes
```

Then, inside the (renamed) folder, edit `BUG_REPORT.md` — prepend:

```markdown
> **Note:** This folder was originally named `BUG-035-039-040-041-order-placement-fixes/`
> because it covers the historical bug IDs BUG-035, BUG-039, BUG-040, BUG-041 from the legacy
> tracker. It was renamed to `CR-2026-04-11-001-order-placement-fixes/` by CR-2026-07-03-010
> to comply with the operating prompt's ID convention. The four legacy BUG IDs remain valid
> cross-references and are documented below.
```

**Option (b) — whitelist exception:**

Create `memory/change_requests/BUG-035-039-040-041-order-placement-fixes/.HISTORICAL_EXCEPTION.md`:

```markdown
# Historical Exception — Folder Naming

This folder is intentionally retained with a legacy `BUG-NNN`-based name that pre-dates
the current `CR-YYYY-MM-DD-NNN` convention. Whitelisted by CR-2026-07-03-010 per owner
decision D-02(b) on <date>.

Any future folders MUST use `CR-YYYY-MM-DD-NNN` or `INV-YYYY-MM-DD-NNN`.
```

### Step 4 — Rewrite `memory/change_requests/README.md`

Full edit list:

1. **Add a new `## ID Scheme` section immediately after `## Legend` (~line 20):**

```markdown
## ID Scheme

This branch uses two ID formats. Both are valid; use is scoped by era, not by type:

| Format | Status | Use for |
|---|---|---|
| `BUG-NNN` (global 3-digit sequence, 001..050) | **FROZEN** at 050 as of 2026-07-03 (CR-010) | Historical cross-references only. Do not issue new IDs in this format. |
| `CR-YYYY-MM-DD-NNN` (per-day 3-digit sequence) | **ACTIVE** — canonical for all new work | New change requests, feature work, refactors, doc updates, data ops. |
| `INV-YYYY-MM-DD-NNN` (per-day 3-digit sequence) | **ACTIVE** | Investigations only (read-only, no code, per Alpha v0.1 §8 Role 6). |

**Tombstones.** If an ID is issued and later renamed (e.g. CR-006 was renamed mid-session
to INV-2026-07-03-001), a **tombstone row** must be added to the table below with status
`⚰️ TOMBSTONE`, pointing at the successor.

**Canonical bug tracker for the legacy `BUG-NNN` sequence:**
`/app/memory_repo/BUG_TRACKER.md`. Do not consult `BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md`
for status of any BUG-NNN — that file is a historical audit only.
```

2. **Add a `⚰️ TOMBSTONE` legend row to `## Legend`:**

```markdown
- ⚰️ TOMBSTONE — ID was issued but renamed to another ID; row kept for traceability
```

3. **Add a tombstone row for CR-006 in the main table** (between CR-005 and CR-007):

```markdown
| CR-2026-07-03-006 | (renamed) | ⚰️ TOMBSTONE | — | — | — | See INV-2026-07-03-001 |
```

4. **Add a row for this CR (CR-010) at the bottom of the main table:**

```markdown
| [CR-2026-07-03-010](./CR-2026-07-03-010-registry-hygiene-and-id-scheme-canonicalization/CR.md) | Registry hygiene & ID-scheme canonicalization | 📝 REGISTERED (Role 2 done) | P2 | 6 MD | ~45 min | approve D-01..D-04 in INTAKE_DOC.md |
```

5. **Update the "Artefacts per item" table** — add a row:

```markdown
| CR-010 | ✅ | ✅ | ✅ | — |
```

6. **Update the closing "Session shipping summary"** — bump `Items raised` from 10 to 11 and add a bullet noting CR-010 is a process-only follow-on.

### Step 5 — Cross-link in the session handover

Edit `memory/SESSION_HANDOVER_2026-07-03.md` §3 (What is planned but NOT shipped). Add row:

```markdown
| CR-2026-07-03-010 | REGISTERED (Role 1+2 complete) (registry hygiene & ID-scheme canonicalization) | Owner decisions D-01..D-04 |
```

### Step 6 — Verification (all mechanical, no code)

Run each check from `IMPACT_ANALYSIS.md` §6. All must pass before declaring Role 3 complete:

```bash
# V-01
find /app/memory_repo -maxdepth 1 -name "BUG_TRACKER*.md" | wc -l   # expect 2 (canonical + archived)
find /app/memory_repo -maxdepth 1 -name "BUG_TRACKER.md" | wc -l    # expect 1
# V-02
find /app/memory_repo -maxdepth 1 -name "BUG_TRACKER_v2.md" | wc -l # expect 0
# V-03
head -5 /app/memory_repo/BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md  # HISTORICAL banner visible
# V-04
grep -c "^## ID Scheme" /app/memory/change_requests/README.md         # expect ≥1
# V-05
grep -c "CR-2026-07-03-006" /app/memory/change_requests/README.md     # expect ≥1 (tombstone row)
# V-06
grep -rl "BUG_TRACKER_v2" /app --include="*.md" | grep -v "memory/control/" # expect 0 hits outside control/ (which is out of scope)
# V-07
git diff --stat /app/memory_repo/BUG_TRACKER.md | head              # only header/stats lines change, no BUG-NNN row edits
# V-08
# manual: cross-check stats block against grep count from Step 2
# V-09
git status /app/memory/control/                                      # clean
# V-10
git status /app/frontend /app/backend                                # clean; .env unchanged
```

### Step 7 — Commit shape

One atomic commit. Suggested message:

```
CR-2026-07-03-010: canonicalize registry, freeze BUG-NNN at 050, tombstone convention

- Rename memory_repo/BUG_TRACKER_v2.md -> BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md (D-01)
- Rename memory/change_requests/BUG-035-039-040-041-order-placement-fixes/ ->
  CR-2026-04-11-001-order-placement-fixes/ (D-02a) [or: whitelist via .HISTORICAL_EXCEPTION.md (D-02b)]
- memory_repo/BUG_TRACKER.md: add canonical banner, freeze BUG-NNN at 050, refresh stats
- memory/change_requests/README.md: add "ID Scheme" section, tombstone convention,
  CR-006 tombstone row, CR-010 registry row
- memory/SESSION_HANDOVER_2026-07-03.md: add CR-010 to §3 planned table

Docs-only. No frontend/backend/env changes. Alpha v0.1 operating prompt unchanged.
```

### Step 8 — Exit Gate (Alpha v0.1 §8 Role 3 exit)

Fill this after execution:

| # | Check | Result |
|---|---|---|
| 1 | Registry updated | ☐ |
| 2 | Issue tracker updated | N/A (this CR *is* the tracker update) |
| 3 | File ownership updated | ☐ (README.md row added) |
| 4 | Code markers added | N/A (no code) |
| 5 | Build/compile/test clean | N/A (no code); supervisor still shows `backend` + `frontend` RUNNING |
| 6 | Self-test complete | ☐ (V-01..V-10 all pass) |
| 7 | QA handover written | ☐ (`QA_HANDOVER.md` in this folder, one paragraph, points at V-01..V-10) |

### Step 9 — Compact Role 3 exit block (to fill on execution)

```text
Code complete: CR-2026-07-03-010
Risk: LOW
Self-test: 10/10 PASS (V-01..V-10)
Build/compile: N/A (docs-only)
Registry sync: YES
Exit Gate: 7/7 PASS (2/7 N/A by design)
Docs: memory/change_requests/CR-2026-07-03-010-.../{INTAKE_DOC.md, CR.md, IMPACT_ANALYSIS.md, IMPLEMENTATION_PLAN.md, QA_HANDOVER.md}
Next: QA (owner spot-check on any 3 BUG-NNN rows + README ID-Scheme section readability)
```

---

## What this plan explicitly does NOT do

- Does not renumber any historical `BUG-NNN`.
- Does not edit the Alpha v0.1 operating prompt (that's CR-followup-A).
- Does not reconcile row-by-row content between the two BUG trackers (that's CR-followup-B).
- Does not touch `memory_repo/change_requests/` (that's CR-followup-C).
- Does not port anything to an external issue tracker (that's CR-followup-D).
- Does not restart supervisor, touch `.env`, or otherwise change runtime state.

If any of the above becomes tempting mid-execution, **stop** per Alpha v0.1 §11 R4 (scope lock) and open a new CR.
