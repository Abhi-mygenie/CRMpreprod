# ROADMAP — MyGenie Customer App

Split out of `PRD.md` on 2026-10-06. Dated history lives in [`CHANGELOG.md`](./CHANGELOG.md); the
full registry of 87 items is [`change_requests/README.md`](./change_requests/README.md).

**Registry state:** 87 indexed / 87 folders · 0 orphans · 0 duplicates · validation PASS ·
all 87 `Status` cells blank until plan phase P1 ships the 8-value enum.

---

## P0 — blocking, or customer-facing and unfixed

| # | Item | Why P0 | Owner action |
|---|---|---|---|
| 1 | **`Role 3 approved for CR-2026-10-04-006`** | Gate 2 passed, plan accepted line-by-line, nothing external blocks it. One sentence releases ~12–14 h of work | say it, verbatim |
| 2 | **`CR-2026-10-06-001`** — non-QR order block unenforced | Orders accepted that restaurant config forbade. 3 bypass paths, re-verified live. Documented since 2026-06-17 with no fix CR for 3½ months | rule **A/B/C/D** — only **B** closes the dev-tools path; B overlaps `CR-2026-07-03-011` |
| 3 | **`CR-2026-10-06-002`** — multi-menu status check skipped | The manually-picked room is never validated. Skip keyed to the literal `'716'` | answer **Q1–Q3**, ratify the P2 → P1 upgrade. Q3 collides with `CR-2026-08-03-001` (HELD) |
| 4 | **`BUG-2026-02-XX-001`** — delivery charge renders as zero | Money path. `order_value` hardcoded `'0'`; failed a smoke on 2026-07-13 | owner smoke |
| 5 | **`CR-2026-10-04-005`** — takeaway surcharge live estate-wide | Unapproved charge reaching customers | confirm scope / approve or revert |

## P1 — high value, mostly unblocked

| # | Item | Note |
|---|---|---|
| 6 | **`BUG-2026-10-06-001`** — bypasses are not logged | **Needs no owner ruling.** LOW risk, endpoint already exists. Makes items 2 and 3 measurable. Cheapest P1 on the board |
| 7 | **D-A2 — OAuth consent publishing status** | 7th ask. In *Testing*, Google kills the refresh token every 7 days and the mirror stops **silently** while four other projects read a stale tab |
| 8 | **6 of 7 money-path items unverified** | 3 `IMPLEMENTED`, 2 `SMOKE`, 1 `INTAKE`, 1 `CLOSED`. The `round_up` backfill is a probable 8th |
| 9 | **`CR-2026-09-12-005-B1`** — 44-route contract snapshots | Blocks `CR-2026-09-12-006` (backend modular split) |
| 10 | **`CR-2026-10-04-001`** — table-config POS-token fallback | 401s against POS; a replacement token risks cross-tenant table data |
| 11 | **`BUG-2026-09-10-001`** — object storage removed, local disk used | Shipped without implementation approval. Held at INTAKE, flagged |
| 12 | **`PROD-INCIDENT-2026-07-02-001`** | Production incident with no recorded fix |

## P2 — queued

| # | Item | Note |
|---|---|---|
| 13 | **`INV-2026-10-04-001`** — legacy `BUG-NNN` status reconstruction | Needs Role 6. **Re-derive the ID set from source, not from the intake doc** — it was 20, not 19 |
| 14 | **`CR-2026-09-12-006`** — backend modular split | `server.py` is a 1,800-line monolith. Blocked on item 9 |
| 15 | **`CR-2026-10-03-001`** — delete 14 dead CRM-table call sites | Blocked on an owner ruling: is `/api/status` called externally? |
| 16 | **`INV-2026-10-03-001`** — UAT secrets & PII exposure | Live keys in preprod, PII in shared UAT. The DevOps brief is still unconfirmed as sent |
| 17 | **`CR-2026-08-03-001`** — remove 716 hardcoding | **HELD** on a POS data backfill in preprod and prod, not on code |
| 18 | **`CR-2026-09-12-009` / `-010`** — remove hardcoding, config defaults → DB | `478`, `pos_id`, `+91` |
| 19 | **ROLE 13 — REGISTRAR** prompt edit | Plan phase P12. Needs §7 owner approval; nothing depends on it |
| 20 | **18 missing dates** — 3 blank `Registered`, 15 unsourced `Closed` | Contract v1.2 makes this an owner sheet-edit workflow once plan phase P10 ships |

## P3 — cleanup

| # | Item | Note |
|---|---|---|
| 21 | **`CR-2026-09-12-016`** — delete 2 dead FE env keys | Wave 3. **Run V3 first — it can void the CR** |
| 22 | `CR-2026-10-03` series | CRM table cleanup · users projection · feedback schema · pre-login lookups · call-waiter buttons · franchise multi-outlet admin |
| 23 | Amendment `#21` backlog | 16 of 87 titles exceed the contract's one-line limit, longest 362 chars. Fixed at render time by plan phase P2 |

## Known-accepted, not scheduled

- Hard reload of any `/admin/*` route logs the admin out.
- Column M (`Assignee`) is protected by **omission, not permission**. Protected ranges were never
  built and are out of scope for the current amendment.
