# CLOSURE NOTE — CR-2026-07-04-002 (Registry finish-up)

**Closed:** session after 2026-10-03 · **Authority:** owner decision D-R6
**Mechanism:** operating prompt **§15 — closing rule, condition 5: "QA passed *or owner accepted
exception*"**
**Closed under:** CR-2026-10-04-004 (registry reconciliation)

---

## 1. Why it is closed rather than left open

All three parts of this CR targeted artefacts under `/app/memory_repo/`:

| Part | Subject | State |
|---|---|---|
| A | Alpha v0.1 line-reference update (`§10.1349`) pointing at `BUG_TRACKER_v2.md` | subject file absent |
| B | 39-item reconciliation of `BUG-011..041` / `BUG-043..050` against `BUG_TRACKER.md` | **both trackers absent** |
| C | README for the legacy `memory_repo/change_requests/` directory | **directory absent** |

`/app/memory_repo` does not exist in this pod, and no `BUG_TRACKER*` file exists anywhere.
Owner ruling **D-R5: `/app/memory` is canonical; `memory_repo` is deprecated.**

With no subject, the CR cannot be planned, implemented or tested. Leaving it as `📝 REGISTERED`
would state something false in the registry indefinitely; marking it `BLOCKED` would imply it could
one day proceed, which it cannot.

## 2. How §15 permits this

§15 requires eight conditions for closure. Three are conditional on the work needing code or QA:

> 3. Code is implemented, **if required**
> 5. QA passed **or owner accepted exception**
> 6. Smoke/acceptance completed **where required**

This item requires no code, no QA and no smoke. Condition 5 is satisfied by the **owner's accepted
exception** (D-R6). Conditions 7 and 8 — registry updated, report written — are satisfied by the
registry row and this note.

**On "tombstone":** the local `⚰️ TOMBSTONE` convention (used for `CR-2026-07-03-006`) was
considered and **not** used. A grep of all 1,586 lines of the operating prompt finds **no mention of
tombstone, obsolete, withdraw or supersede** — it is a project invention, not governing policy, and
R2 says do not invent policy. Tombstone also means specifically "this ID was renamed to another ID",
which did not happen here. §15 closure with an accepted exception is the lawful route.

## 3. What was carried forward, and what was dropped

| Part | Disposition |
|---|---|
| A | **Dropped as written.** The prompt's stale registry section is a real problem, but a bigger one than a line-number fix: addendum Part B §10 names three absent files and an unverifiable bug count. A corrected replacement was drafted under CR-2026-10-04-004 and is **held for owner review** (D-R7) — the prompt is not edited without approval (§7) |
| B | **Carried to `INV-2026-10-04-001`.** The reconciliation itself is impossible, but the underlying question survives: 19 legacy `BUG-NNN` IDs are still referenced across 33 documents with no status source, and the prompt claimed 10 were open including 2× P0 |
| C | **Dropped.** The directory it would document does not exist |

## 4. Audit trail

Nothing was deleted. This CR's folder, `CR.md` and `INTAKE_DOC.md` remain in place for traceability,
as do all 33 documents citing legacy bug IDs.

---

```text
Closure recorded: CR-2026-07-04-002
Mechanism: §15 condition 5 — owner accepted exception (D-R6)
Code required: none
Carried forward: part B → INV-2026-10-04-001
Dropped: parts A (superseded by held addendum draft) and C (subject absent)
Registry: row updated to ✅ CLOSED with reason
```
