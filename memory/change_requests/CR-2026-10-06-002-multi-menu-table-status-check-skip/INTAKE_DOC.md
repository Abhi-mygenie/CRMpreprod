# INTAKE DOC — CR-2026-10-06-002

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-06-002 |
| **Title** | Multi-menu restaurants skip the table/room status check entirely at landing; the room is picked manually later and never validated |
| **Classification** | **CR** — fix CR for a documented investigation that never got one |
| **Date Registered** | 2026-10-06 |
| **Reported By** | Owner, this session. Source finding: `INV-2026-06-17-003` (report written **2026-06-17**, no fix CR raised since) |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Severity** | **P1** |
| **Risk** | **HIGH** — the fix lands on `LandingPage.jsx` + `ReviewOrder.jsx`, and 716 is a live hotel estate with room-only behaviour that must not break |
| **Status** | 📝 REGISTERED (Role 1 done) — needs an owner ruling on Q1–Q3, then Planning |
| **Parent** | `INV-2026-06-17-003-room-qr-flow` |
| **Blast radius** | **MEDIUM** — every multi-menu restaurant. Today that is 716 (Hyatt Centric); it grows as multi-menu is adopted |

## 1. The finding

`INV-2026-06-17-003` documented two completely different landing behaviours:

| Restaurant class | Behaviour |
|---|---|
| **Multi-menu** (e.g. 716 Hyatt) | Table/room status check is **skipped entirely** at landing. The customer picks a room manually at ReviewOrder |
| **Single-menu** (everything else) | Full status check runs; the room/table state drives the UI |

Verbatim from the report:

> *"The entire room status check is **skipped** because 716 is multi-menu. 716 uses manual room
> selection at ReviewOrder page — customer picks room from a dropdown. There's no automatic
> check-in validation on landing."*

## 2. Code check — still live. (verified this session)

| Evidence | Location |
|---|---|
| Landing-page early returns that skip the check for multi-menu | `frontend/src/pages/LandingPage.jsx:232`, `:278`, and the comment at `:883` spelling the skip out |
| Per-restaurant hardcoded skip on the review path | `frontend/src/pages/ReviewOrder.jsx:1153` — `if (String(restaurantId) === '716' && !hasAssignedTable(finalTableId))` |
| The named skip flag itself | `frontend/src/pages/ReviewOrder.jsx:1281` — `if (!skipTableCheckFor716 && finalTableId && String(finalTableId) !== '0')` |
| Class test | `frontend/src/api/utils/restaurantIdConfig.js:12` — `isMultipleMenu` |

## 3. Why this is a CR and not just documentation

The skip is **deliberate** — multi-menu restaurants have no table at landing, so there is nothing to
check yet. That part is sound design. The gap is what happens **afterwards**:

1. The customer picks a room manually at ReviewOrder, and
2. there is no equivalent check at that point that the chosen room is in a valid state.

So the validation is not deferred, it is **dropped**. A customer can select a room that is occupied,
not checked in, or not theirs, and the order is accepted. For a hotel estate that is a real-world
problem, not a code-style one.

Two further defects ride along:
- the skip is keyed to the **string `'716'`** in `ReviewOrder.jsx`, not to a capability flag, so
  behaviour is welded to one restaurant ID (the exact pattern `CR-2026-08-03-001` and
  `CR-2026-09-12-009` exist to remove), and
- `skipTableCheckFor716` is named after a customer, which guarantees the next multi-menu restaurant
  either inherits it by accident or misses it.

## 4. What the owner must rule on

| # | Question |
|---|---|
| Q1 | **Is skipping the landing check correct?** Intake's reading: yes — there is no room to check yet. Confirm, and it becomes documented behaviour rather than a suspected bug |
| Q2 | **Must the manually-picked room be validated at ReviewOrder before the order is placed?** If yes, this CR's real scope is *add the missing check at the point of selection* |
| Q3 | Should the skip be driven by a **capability flag** (`isMultipleMenu` / `orderLocationType`) instead of `restaurantId === '716'`? This overlaps `CR-2026-08-03-001`, which is currently **HELD** pending a POS backfill |

## 5. Verification required before closure (none of it done)

| # | Check |
|---|---|
| V1 | Single-menu room QR flow unchanged — full status check still runs |
| V2 | 716 landing still renders normally with no status check and no new error state |
| V3 | A room chosen manually at ReviewOrder is validated (Q2-dependent) and a bad room is refused with a clear message |
| V4 | Valid room orders at 716 still place successfully — room-only behaviour intact |
| V5 | No new dependency on the literal `'716'` is introduced by the fix |
| V6 | Owner smoke on a live 716 room order |

## 6. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `INV-2026-06-17-003` | Parent investigation (knowledge capture); this CR owns the fix | **DISTINCT** |
| `CR-2026-08-03-001` (remove 716 hardcoding) | Owns de-hardcoding 716 estate-wide and is **HELD** pending a POS data backfill. Q3 overlaps it | **RELATED — do not duplicate** |
| `CR-2026-09-12-009` (remove hardcoding) | Same pattern, different targets | RELATED |
| `CR-2026-10-06-001` (walk-in / `table_id: '0'`) | Same family — a table-status check that does not run — but a different trigger and code path | RELATED |

**Verdict: DISTINCT.**

## 7. Note on severity — a deliberate upgrade, recorded

`INV-2026-06-17-003`'s README row rates it **P2** and says *"feeds CR-2026-08-03-001"*. Raised to
**P1** here on two grounds: (a) the missing post-selection validation means orders are accepted
against unvalidated rooms, which is a correctness problem and not merely a hardcoding problem, and
(b) its only route to a fix today runs through `CR-2026-08-03-001`, which is **HELD** — so as things
stand it is not on a path to being fixed at all. Per §5 this upgrade needs owner ratification; if Q2
comes back "no validation needed", it drops to P2 or closes as documented behaviour.

---

```text
Intake complete: CR-2026-10-06-002
Classification: CR (fix CR for INV-2026-06-17-003)
Severity: P1 (upgraded from the parent's P2 — rationale §7, needs owner ratification)
Risk: HIGH (LandingPage.jsx + ReviewOrder.jsx; live hotel estate)
Duplicate check: DISTINCT (parent INV-2026-06-17-003; RELATED CR-2026-08-03-001 which is HELD)
Evidence: captured — LandingPage.jsx:232/278/883, ReviewOrder.jsx:1153/1281, restaurantIdConfig.js:12, INV-2026-06-17-003/INVESTIGATION_REPORT.md
Blast radius: MEDIUM — every multi-menu restaurant; today 716
Docs updated: this file; ../index.yml; ../README.md; ../INTAKE_PASS_2026-10-06.md
Next: owner answers Q1–Q3 → Planning (Role 2)
```
