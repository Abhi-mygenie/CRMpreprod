# Intake pass — 2026-10-06 (ROLE 1)

Owner instruction: *"Switch the role to intake… register all these CRs… or update the CR in the
intake, whatever is the call we have decided."*

Read-only on application code. **No file under `backend/`, `frontend/` or `tests/` was modified in
this pass.** Role 1 forbids coding; `registry_sync.py` was also not touched, because Gate 2 for
`CR-2026-10-04-006` is still shut.

---

## 1. How the unregistered set was found

`registry_sync.py audit` reported **80 indexed / 80 folders, 0 orphans, 0 duplicates** — so nothing
on disk was unregistered. The remaining exposure is IDs that live in **documents or shipped code**
with no registry row behind them, which the audit cannot see.

Method: extract every `TYPE-YYYY-MM-DD-NNN` token from `memory/`, `backend/`, `frontend/src` and
`tests/`, then diff against `index.yml`.

```
89 distinct IDs mentioned anywhere
80 present in index.yml
 9 mentioned but unregistered
```

Of those 9, **2 are not items** and **7 were real**.

## 2. Registered — 7 rows (80 → 87)

| ID | Type | Sev / Risk | Why it was invisible |
|---|---|---|---|
| `CR-2026-10-06-001` | CR (new) | **P1 / HIGH** | Fix CR for `INV-2026-06-17-001`. Report written 2026-06-17; no fix CR in 3½ months |
| `CR-2026-10-06-002` | CR (new) | **P1 / HIGH** | Fix CR for `INV-2026-06-17-003`. Same — and its only route to a fix ran through `CR-2026-08-03-001`, which is HELD |
| `BUG-2026-10-06-001` | BUG (new) | **P1 / LOW** | Filed later in the session on owner instruction, **not from the ID sweep** — surfaced by the plain-English walk-through of the two P1s. The non-QR control reports blocks and conceals bypasses |
| `INV-2026-08-06-001` | INV | P2 / LOW | **Ghost ID.** Live code markers, no folder, no row, origin recorded as *unknown* (`CR-2026-10-04-004` finding F2) |
| `INV-2026-08-03-001` | INV | P2 / LOW | Complete report with a Role 6 sign-off block, cited by three documents, never given a row |
| `CR-2026-09-12-016` | CR | P3 / LOW | Provisional ID whose source decision literally said *"Owner drives Role 1 to file it."* Never filed |
| `CR-2026-06-XX-001` | CR | — | **DUPLICATE.** A proposed ID in a June handover; all four parts shipped under five other CRs |

Severities and risks were proposed by the agent and **ratified by the owner in chat on 2026-10-06**,
as recorded against each intake doc. The `CR-2026-10-06-002` P1 is an **upgrade** from its parent's
P2 — rationale in that intake's §7, ratified in the same exchange.

### Code re-verified live for both P1s

Neither was taken on trust from a June document:

| Finding | Confirmed today at |
|---|---|
| Walk-in is an exempt scan type | `frontend/src/utils/orderAccessPolicy.js:20`, `:63` |
| Status check skipped when `table_id` is `'0'` | `frontend/src/pages/ReviewOrder.jsx:1168`, `:1281` |
| No server-side enforcement | no `allowNonQrOrders` check anywhere in `backend/server.py` |
| Multi-menu landing skip | `frontend/src/pages/LandingPage.jsx:232`, `:278`, `:883` |
| Skip keyed to the literal `'716'` | `frontend/src/pages/ReviewOrder.jsx:1153`, `:1281` |

All five are still live on `3oct`.

## 3. Updated — 4 documents, no new IDs

| Target | Change |
|---|---|
| `INV-2026-10-04-001/INTAKE_DOC.md` | **`BUG-042` added — the legacy set is 20, not 19.** New §6a records the root cause: that ID set was built from documents and never cross-checked against source |
| `INV-2026-09-15-003/O-7_GAP-11_LIVE_HOST_CHECK.md` | Stale self-citation `INV-2026-09-12-018` corrected to the owning item. Owner ruling: fix in place, **no registry row** |
| `CR-2026-09-07-001/INTAKE_DOC.md` | Records that `INV-2026-09-07-001` is **paperwork of this CR**, not a separate item. Owner ruling |
| `CR-2026-10-04-006/INTAKE_DOC.md` | Addendum: **contract v1.1.1 accepted**, amendment now **21** changes, risk **LOW → MEDIUM**, `#20`/`#21` stay folded in. Gate 2 still shut |

## 4. Deliberately NOT registered — 4 IDs, with reasons

Kept out of `README.md` on purpose: every ID named there is counted by the audit, and listing these
would make `registry_sync.py audit` report them as README-only rows forever.

| ID | Verdict | Reason |
|---|---|---|
| `CR-2026-07-04-001` | **Leave unfiled** (owner ruling) | Its own source says *"Not filed yet — file only if customer smoke reveals pain"*, and no customer has reported pain. **Also already covered:** its two deferred sub-items — empty-state on menu-load timeout, and the 5 AdminConfig CRUD timeout swaps — are the registered scope of **`CR-2026-07-04-003`**. Its third sub-item was DROPPED, not deferred |
| `INV-2026-09-07-001` | **Paperwork, no row** (owner ruling) | Evidence already consumed inside `CR-2026-09-07-001`. Artefact: `/app/memory/BE_ASK_STOCKOUT_INV-2026-09-07-001.md` |
| `INV-2026-09-12-018` | **Not an item** (owner ruling) | Appeared once, in the header of a document that lives inside `INV-2026-09-15-003` — a stale self-reference. Citation corrected in place |
| `CR-2099-01-01-999` | Not an item | Planted test fixture for verification **V8** of `CR-2026-10-04-006`; deleted after the test. Appears only in a QA record |

## 5. Audit state after the pass

```
AUDIT — 87 indexed, 87 item folders
folders not in index: 0
index entries with no folder: 0
folders without a well-formed ID: 0
in README but not in index: 1   ← CR-2026-07-03-006 (⚰️ TOMBSTONE, by design)
in index but not in README: 0
code markers live but status REGISTERED (F1 tripwire): 0
```

Index validation passes. `INV-2026-08-06-001` is no longer README-only — the ghost is closed out, and
the single remaining README-only row is the intentional tombstone.

## 6. Why `status` is blank on all seven new rows

Not an omission. `registry_sync.py`'s validator still enforces the **legacy 13-value** enum, which
has no `INTAKE`, `SMOKE` or `DUPLICATE`. Writing a contract v1.1 status today makes every `audit` and
`sync` exit 1 against its own registry.

Each new row therefore carries its **adjudicated contract status inside `status_note`** —
`INTAKE` ×4, `IMPLEMENTED` ×1, `CLOSED` ×1, `DUPLICATE` ×1 — for the single status write that ships
with amendment change **#10**. This is the same forced ordering already recorded in
`STATUS_ADJUDICATION.md`: **plan → implement the enum + layout → write all statuses in one pass.**

Four of the seven carry `next_gate: Planning`, which routes them onto the **Intake** tab. That is
derived from this pass, not guessed, so O-G4 is not breached.

## 7. What this pass did not resolve

- **Both P1s need an owner ruling before Planning.** `CR-2026-10-06-001` needs option A/B/C/D; only
  **B** (server-side enforcement) closes the dev-tools bypass, and B overlaps `CR-2026-07-03-011`.
  `CR-2026-10-06-002` needs Q1–Q3, and its Q3 collides with `CR-2026-08-03-001`, which is HELD on a
  POS data backfill.
- **`BUG-042`'s status is still unreconstructed** — that is Role 6's job on `INV-2026-10-04-001`,
  still unassigned. Its new sibling question: how many `BUG-NNN` IDs exist in code that no document
  mentions?
- **The two unadjudicated backfilled items** (`CR-2026-XX-XX-001`, `INV-2026-05-01-001`) still have
  no status. Unrouted count is now **86**, all awaiting the enum.
- **Amendment `#21` is now worse in absolute terms:** 16 overlong titles out of 87 rather than 80.
  The seven new titles were written to the one-line rule and add nothing to the overlong set.

---

```text
Intake pass complete: 2026-10-06
Items registered: 7 (80 → 87)
Items updated: 4 documents, 0 new IDs
Deliberately not registered: 4, reasons in §4
Severity ratified by owner: yes, in chat
Application code touched: NONE (backend/, frontend/, tests/ all unmodified)
Gates opened: NONE — Gate 2 for CR-2026-10-04-006 remains shut
Next: owner rules on CR-2026-10-06-001 (A/B/C/D) and CR-2026-10-06-002 (Q1-Q3);
      BUG-2026-10-06-001 needs no ruling and can go to Planning immediately
```
