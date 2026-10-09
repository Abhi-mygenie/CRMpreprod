# INTAKE DOC — INV-2026-08-03-001 (retroactive registration)

## Item Identity

| Field | Value |
|-------|-------|
| **ID** | INV-2026-08-03-001 |
| **Title** | Hyatt (716) hardcoding audit — 27 code-level hardcodings across 8 files, plus 3 other hardcoding classes |
| **Classification** | **INV** — complete, delivered, never registered |
| **Date Registered** | 2026-08-03 (from the report's own ID and its position before `CR-2026-08-03-001`) |
| **Reported By** | This intake pass. The report has existed since August and carried no registry row |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Severity** | **P2** — traceability only; the work itself is finished |
| **Risk** | **LOW** — registering a completed report changes no code |
| **Status** | 🔬 REPORT WRITTEN / resolved — consumed by `CR-2026-08-03-001` |
| **Blast radius** | **SMALL** (as an intake). The *subject* is large; its remediation is owned by `CR-2026-08-03-001` |

## 1. Why this is being registered now

The investigation is **complete and signed off**. The report lives at:

```
/app/memory/INV-2026-08-03-001-716-HARDCODING-REPORT.md
```

It carries a proper Role 6 closing block — `Investigation complete: INV-2026-08-03-001`,
`Confidence: HIGH`, `Steps used: 10/10`. It is cited as authoritative in at least three places:

- `CR-2026-08-03-001/INTAKE_DOC.md`: *"Investigation needed? **Complete — INV-2026-08-03-001 (v2) filed.**"*
- `CR-2026-09-12-001/INTAKE_DOC.md` uses it as the evidence row for the hardcoding gap
- `SESSION_HANDOVER_2026-06-ARCHITECTURE-TRACK.md` lists it against GAP-016

Despite that, it had **no folder under `change_requests/` and no row in `index.yml` or `README.md`**.
It was invisible to every count, the Summary tab and the Tech Dashboard. This registration restores
traceability and nothing else.

## 2. What the report found (for the record, not re-litigated)

> *"Restaurant 716 (Hyatt Centric) has **27 code-level hardcodings** spread across **8 files**, plus
> **5 comment-only references** across 4 additional files… these implement a **'room-only hotel'**
> business model that differs fundamentally from standard table-based restaurants."*

Classified into 7 behavioural dimensions — room-only location, fresh selection per order, multi-order
per room, no QR requirement, no session persistence, **no table status check**, a different API
endpoint — all implemented as string comparisons against `'716'` rather than config flags. It also
names 3 non-716 hardcoding classes: `pos_id`, the default restaurant (`478`), and the `+91` country
code.

Its own recommendation was a config flag such as
`orderLocationType: 'room_only' | 'table_only' | 'room_and_table'`.

## 3. Note on the file's location — a decision, not an oversight

The report stays where it is, at the `/app/memory` root. It is referenced by absolute path from
three other documents, and moving it would break those citations for no gain. This folder holds the
intake and points at it. The later `index.yml` `files` field records the real path.

If the owner prefers artefacts to live inside their item folder, the move is cheap — but it must
update all three citing documents in the same pass.

## 4. Live cross-reference worth flagging

The report's dimension **"no table status check"** is the *same hole* that `INV-2026-06-17-003`
documented independently, and which has now been raised as **`CR-2026-10-06-002`** in this pass. Two
investigations, two months apart, found the same missing check from opposite directions — one looking
at hardcoding, one looking at the room QR flow — and neither produced a fix CR until today.

## 5. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `CR-2026-08-03-001` (remove 716 hardcoding) | The **fix CR** this investigation feeds. Currently **HELD** pending a POS data backfill in preprod and prod | **DISTINCT** — investigation vs remediation |
| `CR-2026-09-12-009` (remove `478` / `pos_id` / `+91`) | Owns the 3 non-716 classes this report names | **RELATED** |
| `CR-2026-09-12-010` (config defaults → DB) | The config-flag mechanism its recommendation needs | RELATED |
| `CR-2026-10-06-002` (multi-menu status-check skip) | Same missing check, found independently — see §4 | RELATED |

**Verdict: DISTINCT.**

## 6. Recommendation

Register and close. No further investigation is warranted — the open work is
`CR-2026-08-03-001`, and that is **HELD for a data reason, not a code reason** (live preprod now
returns `locationSelection: 'scanner'` / `ordersAutoPaid: 0` for 716, so shipping the plan as written
would strip Hyatt's room-only behaviour).

**Its true contract status is `CLOSED`** — resolved and subsumed. Written to `index.yml` in the
single status pass that ships with amendment change #10.

---

```text
Intake complete: INV-2026-08-03-001 (retroactive registration)
Classification: INV (complete; resolved/subsumed)
Severity: P2
Risk: LOW
Duplicate check: DISTINCT (feeds CR-2026-08-03-001, which is HELD)
Evidence: captured — /app/memory/INV-2026-08-03-001-716-HARDCODING-REPORT.md (10/10 steps, HIGH confidence), cited by CR-2026-08-03-001 and CR-2026-09-12-001 intakes
Blast radius: SMALL as an intake
Docs updated: this file; ../index.yml; ../README.md; ../INTAKE_PASS_2026-10-06.md
Next: none. Remediation stays with CR-2026-08-03-001 (HELD — POS backfill)
```
