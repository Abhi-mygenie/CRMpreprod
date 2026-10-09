# INTAKE DOC — BUG-2026-10-06-001

## Item Identity

| Field | Value |
|-------|-------|
| **BUG ID** | BUG-2026-10-06-001 |
| **Title** | Non-QR policy telemetry records blocks but never bypasses, so an unenforced order is invisible |
| **Classification** | **BUG** — observability defect in a live enforcement control |
| **Date Registered** | 2026-10-06 |
| **Reported By** | Owner, this session, after the plain-English walk-through of `CR-2026-10-06-001`. Originally noted as a diagnostic aside inside `INV-2026-06-17-001` |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Severity** | **P1** |
| **Risk** | **LOW to fix** — adding a telemetry call on the allow path changes no order behaviour |
| **Status** | 📝 REGISTERED (Role 1 done) — needs Planning |
| **Blast radius** | **LARGE in terms of what it conceals** — every restaurant running `allowNonQrOrders: false`. **ZERO** in terms of what it breaks today |

## 1. The defect in one sentence

The non-QR policy reports every order it **stops** and says nothing about every order it **lets
through**, so a restaurant with the switch off cannot tell the difference between *"the control is
working"* and *"the control is being bypassed."*

## 2. Why this is its own BUG and not part of CR-2026-10-06-001

`CR-2026-10-06-001` asks *"should walk-in orders be blocked?"* — a product question with four
competing answers (A/B/C/D) and no obvious winner.

This item asks nothing. **Whatever you decide there, you still cannot see what is happening.** It
is independently fixable, independently valuable, carries none of that CR's HIGH risk, and does not
wait on the A/B/C/D ruling. Filing them together would hold a safe, cheap observability fix hostage
to an unresolved product decision.

It is also the reason the parent investigation could not size the problem: with no bypass events
recorded, nobody can say whether this happened once at Cafe Flora or runs every day across the
estate. **This bug is what makes the other one unmeasurable.**

## 3. Evidence — read from source this session, not from documents

The telemetry exists and works. It is simply **inside the `if`**.

All three checkpoints follow the identical shape:

| Checkpoint | File:line | Code |
|---|---|---|
| C1 — landing / Browse Menu | `frontend/src/pages/LandingPage.jsx:538` | `if (policy.block) { … postNonQrBlock(…, 'landing') … }` |
| C2 — add to cart | `frontend/src/pages/MenuItems.jsx:489` | `if (!policy.block) return false;` — returns **before** `postNonQrBlock` |
| C3 — place / update order | `frontend/src/pages/ReviewOrder.jsx:901` | `if (policy.block) { … postNonQrBlock(…, 'place_order') … }` |

`shouldBlockNonQrOrder` already returns a precise reason for **every** outcome
(`orderAccessPolicy.js:37-69`):

| Returned reason | Meaning | Recorded today? |
|---|---|---|
| `non-qr-dinein` | blocked | ✅ **yes** |
| `policy-disabled` | switch not off | ❌ no |
| `rid-716-carveout` | restaurant 716 exempt (HC1) | ❌ no |
| `edit-mode` | edit-mode bypass (HC5) | ❌ no |
| `non-dinein-mode` | takeaway/delivery bypass (HC6) | ❌ no |
| `valid-qr` | **includes every walk-in bypass (HC7)** | ❌ no |

So the allow path already knows *exactly why* it allowed. That reason is thrown away.

**What happens to it instead:** `LandingPage.jsx:527` `console.log`s the full decision to the
**customer's own browser console** — a comment there even says *"Helps diagnose why a block didn't
fire… Remove or gate behind a flag once stable."* The one piece of data that would answer the
question is written to the one place nobody can read.

The backend side is already built and would need **no change**: `POST /api/diagnostics/non-qr-block`
(`backend/server.py:1687`) accepts the event, stores it in `non_qr_blocks` with a
`rid_ts_desc` index, and returns 204. The pipe exists; only blocks are put into it.

## 4. The consequence, in the field

From `INV-2026-06-17-001`, restaurant 698, 2026-05-30:

> *"Non-QR block events ARE firing for direct URL access (5 events logged for restaurant 698)… All
> logged blocks have `scanned_room_or_table: None`… **Walk-in QR bypass would NOT generate a block
> event** (policy returns `block: false`)."*

The owner saw 5 clean blocks and a correctly-configured flag, and reasonably concluded the control
worked. Meanwhile the complaint that started the whole investigation — a table-less order — had
already happened and left no record at all.

**This is a control that reports its successes and conceals its failures.** For any enforcement
feature that is the wrong way round: the interesting event is always the one that got through.

## 5. Scope of the fix (for Planning, not decided here)

| # | Element |
|---|---|
| S1 | Record policy decisions on the **allow** path too, carrying the existing `reason`, at all three checkpoints |
| S2 | Decide what to record. Intake's view: **the four real bypasses** (`rid-716-carveout`, `edit-mode`, `non-dinein-mode`, `valid-qr`) only when the switch is **off**. Logging `policy-disabled` would emit an event on every page view at every restaurant, which is noise and a cost |
| S3 | Rename the stored concept — `non_qr_blocks` becomes a decision log, not a block log. **Keep the existing collection, endpoint and index**; add a `decision` / `allowed` field. Renaming is not worth a migration |
| S4 | Remove or gate the `console.log` at `LandingPage.jsx:527`, as its own comment already asks |
| S5 | An owner-visible way to read it. A count by `reason` per restaurant is enough to answer *"is my switch actually doing anything?"* |

**Out of scope:** changing any block decision. If this fix alters whether a single order is accepted,
it has failed. That decision belongs to `CR-2026-10-06-001`.

## 6. Verification required before closure

| # | Check |
|---|---|
| V1 | With the switch **off**, a walk-in QR scan is allowed **and** produces a `valid-qr` event |
| V2 | Same for the three other bypass reasons — 716 carve-out, edit mode, takeaway/delivery |
| V3 | With the switch **on/absent**, no event is emitted — no per-page-view flood |
| V4 | Block events are unchanged in shape and still land (**regression** — the existing 5-event history must stay readable) |
| V5 | **Not one order outcome changes.** Allow stays allow, block stays block |
| V6 | Failed telemetry never affects the customer: `postNonQrBlock` is fire-and-forget and must stay that way |
| V7 | No PII added to the payload — the current shape carries no name, phone or address, and must not start |
| V8 | Owner can see a per-restaurant count by reason |

## 7. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `CR-2026-10-06-001` (walk-in enforcement) | Asks *whether* to block. This asks *whether we can see*. Independently fixable — see §2 | **DISTINCT** |
| `CR-2026-05-30-002` | Built this policy **and** this telemetry. The `if (policy.block)` placement is its code. Not reopened — this is a follow-on defect | **DISTINCT (parent implementation)** |
| `CR-2026-07-04-004` (client telemetry to Mongo) | Registered, overlapping *mechanism* — fetch-timeout + ErrorBoundary events, 30-day TTL, admin read endpoint. **S5 should reuse its read endpoint rather than build a second one** | **RELATED — reuse, do not duplicate** |
| `CR-2026-10-06-002` (multi-menu skip) | Same blind spot, different code path. Its skip is also unrecorded | RELATED |

**Verdict: DISTINCT.**

## 8. Note on severity

**P1.** Not P2, because it is the reason a known P1 cannot be sized — three and a half months of
possible bypasses with no evidence either way. Not P0, because nothing is broken for a customer and
the control's intended path still functions.

Risk to fix is **LOW**: the endpoint, collection and index already exist, the reason string is
already computed, and the change is additive on a fire-and-forget path. That combination — P1 value,
LOW risk, no owner decision required — makes it the cheapest P1 on the board.

## 9. Role boundary

No code written. `Role 2 approved` has not been given for this item, and Role 1 forbids coding
regardless. `frontend/` and `backend/` are unmodified by this intake.

---

```text
Intake complete: BUG-2026-10-06-001
Classification: BUG (observability defect in a live enforcement control)
Severity: P1
Risk: LOW to fix (additive, fire-and-forget path; backend endpoint already exists)
Duplicate check: DISTINCT (parent impl CR-2026-05-30-002; RELATED CR-2026-07-04-004 — reuse its read endpoint)
Evidence: captured — LandingPage.jsx:538 + :527, MenuItems.jsx:489, ReviewOrder.jsx:901, orderAccessPolicy.js:37-69, diagnosticsService.js, server.py:1687, INV-2026-06-17-001 diagnostic section
Blast radius: LARGE in what it conceals; ZERO in what it breaks
Docs updated: this file; ../index.yml; ../README.md; ../INTAKE_PASS_2026-10-06.md
Next: Planning (Role 2). Needs no owner ruling first — unlike CR-2026-10-06-001
```
