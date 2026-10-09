# INTAKE DOC — CR-2026-10-04-005

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-04-005 |
| **Title** | Takeaway surcharge shipped estate-wide from POS `takeaway_charges`, not the restaurant-699-only hardcode that was asked for — and without the approval its own CR says was pending |
| **Classification** | **CR** — scope reconciliation + money-path verification |
| **Date Registered** | session after 2026-10-03 |
| **Reported By** | Audit finding F4 of CR-2026-10-04-004; owner asked for it to be registered |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Severity** | **P1** — changes money displayed to customers at every restaurant with the POS field set |
| **Risk** | **HIGH** — `ReviewOrder.jsx` is a Part C CRITICAL hotspot and this is the order total |
| **Status** | 📝 REGISTERED (Role 1 done) — needs owner direction, then Planning |
| **Parent** | CR-2026-02-XX-002 |
| **Blast radius** | **LARGE** — every takeaway order at every restaurant where POS returns `takeaway_charges > 0` |

## 1. What was asked for (verbatim, from the parent intake)

> "only for the resturant id 699 -- hardcode takeaway charge to be included of 10 rupee which in
> api will pass in delihvery charges since we dont have takeaway charges filed -- this is temporary
> arrangement -- it should be register in gap registery"

Parent intake recorded: **restaurant 699 only**, **₹10**, sent through the existing
`delivery_charge` field, **explicitly temporary**, to be tracked as **GAP-021** with a sunset
condition, following the GAP-016 (restaurant 716) precedent.

## 2. What is actually in the code

`frontend/src/pages/ReviewOrder.jsx:681`

```js
// CR-2026-02-XX-002: POS restaurant.takeaway_charges funds packaging fee for takeaway orders.
// Returns 0 for all other order types and restaurants that have no takeaway_charges configured.
const takeawaySurcharge = (scannedOrderType === 'takeaway') ...
```

and `:1940`

```jsx
{/* CR-2026-02-XX-002 Q3-B: Takeaway Charges — packaging/handling fee from POS restaurant.takeaway_charges */}
{scannedOrderType === 'takeaway' && takeawaySurcharge > 0 && (
```

So the shipped behaviour is:
- **estate-wide**, not restaurant 699 only — any restaurant whose POS profile carries `takeaway_charges`
- value **read from POS**, not hardcoded to ₹10
- rendered as its **own line item**, not folded into `delivery_charge`
- **no GAP-021 landmine created** — arguably the better engineering outcome

## 3. The problem

**The parent CR's own handover says this was never approved to build.** Verbatim:

> *"BLOCKER 1 RESOLVED — `takeaway_charges:10` confirmed in POS API. Recommendation changed from
> Option B → Option C. Blockers B3 + B4 remain (owner approval). Ready for Planning +
> Implementation once owner decides."*

The code is live. The registry never carried the item at all. So a change to **customer-facing
order totals, estate-wide**, exists with:

- no recorded owner approval (B3/B4 still open in its own documents)
- no implementation plan matching what shipped
- no QA report
- no registry row until this session
- a scope broader than the one requested, in the file the addendum flags as the single most
  dangerous in the codebase

This is the same gate-jumping pattern recorded in `/app/memory/GATE_RECONCILIATION_2026-10-04.md`,
committed months earlier, and until now unrecorded.

## 4. What this CR must settle

| # | Question for the owner |
|---|---|
| Q1 | **Ratify or revert?** The generic POS-driven design is better than the 699 hardcode you asked for. Approve it retroactively, or restore the narrow scope? |
| Q2 | If ratified — does `takeaway_charges` need a **sunset condition** like GAP-016/021, or is it now permanent product behaviour? |
| Q3 | Should GAP-021 still be created, or retired unused because no landmine was introduced? |
| Q4 | B3 and B4 remain open in the parent's documents. Are they now moot, or must they be answered before this is ratified? |

## 5. Verification required before closure (none of it done)

| # | Check | Why |
|---|---|---|
| V1 | Which restaurants currently return `takeaway_charges > 0` from POS | Determines who is already being charged. **Unknown today** |
| V2 | Takeaway order total = subtotal + tax + surcharge, no double count with `delivery_charge` | The parent plan's original route was *through* `delivery_charge`; confirm the two cannot both apply |
| V3 | Restaurant 699 specifically shows ₹10 | The one outcome you actually asked for |
| V4 | Dine-in and delivery totals unchanged | `scannedOrderType` gating must be airtight |
| V5 | Surcharge reaches the POS order payload, not just the UI | A charge shown but not transmitted is a revenue leak |
| V6 | Owner smoke on a real takeaway order | Money path |

V1 is answerable read-only against the POS profile API and should come first — it sizes the
exposure before any decision.

## 6. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `CR-2026-02-XX-002` | Parent — owns "add a takeaway charge". This owns "reconcile what shipped with what was approved, and verify the money" | **DISTINCT** |
| `CR-2026-08-03-001` (716 hardcoding) | Same single-tenant-carve-out pattern, and the same lesson about POS flag values drifting | RELATED |
| `CR-2026-09-12-009` (remove hardcoding) | Would have inherited a 699 hardcode had one been built | RELATED |

**Verdict: DISTINCT.**

## 7. Note on severity

Rated P1 rather than P2 (the parent's rating) because the shipped blast radius is estate-wide rather
than a single restaurant, and because it is unverified. If V1 shows only restaurant 699 has the POS
field set, severity drops to P2 — that downgrade needs owner approval and a written rationale per §5.

---

```text
Intake complete: CR-2026-10-04-005
Classification: CR (scope reconciliation + money-path verification)
Severity: P1
Risk: HIGH (ReviewOrder.jsx CRITICAL hotspot, order totals)
Duplicate check: DISTINCT (parent CR-2026-02-XX-002)
Evidence: captured (ReviewOrder.jsx:681/1940, parent INTAKE_DOC §1-2, parent SESSION_HANDOVER blockers B3/B4)
Blast radius: LARGE — every takeaway order where POS sets takeaway_charges
Docs updated: this file; ../README.md; ../CR-2026-10-04-004-registry-reconciliation/INTAKE_DOC.md (F4)
Next: owner answers Q1–Q4; V1 exposure check can run read-only first
```
