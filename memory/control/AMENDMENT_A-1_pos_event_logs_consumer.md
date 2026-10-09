# Contract amendment request A-1 — `pos_event_logs` consumer annotation
## To: MyGenie CRM team · From: MyGenie Customer App
## Ref: `CONTRACT_CUSTOMER_APP_CRM_v1.0.md` §2d · Raised 2026-10-03 · Proposed version: **v1.1**
## Status: ✅ **APPROVED BY OWNER 2026-10-03 — READY TO SEND**
> Owner instruction: *"Sign off A-1 and send it so CRM can agree the one-line fix and we publish v1.1."*
> Chat-ready version: `AMENDMENT_A-1_MESSAGE_TO_CRM.md`. On CRM's "agreed", publish the contract as
> **v1.1** with this single row changed, revision history updated, and both Part-1 signatures
> carried forward — **no re-signature required**.

---

## Why this note exists

§2d of the contract we both signed on 2026-10-03 carries an annotation that has since been shown to
be factually wrong. Under **§8 C1** a §2 change needs written agreement from both teams plus a
version bump, so we are **not** editing it unilaterally — even though the change is small and
favours nobody.

This is the first amendment under the contract. We would rather set the precedent of doing it
properly than quietly correct a signed line.

## What changed in the facts

POS has now answered our question **P1** (2026-10-03): **POS does not read `pos_event_logs`.**

Putting the three statements together:

| Party | Access to `pos_event_logs` | Source |
|---|---|---|
| **CRM** | **write-only** — 3 writes, 0 reads (`scan.py:859`, `scan.py:877`, `pos.py:2484`) | your own ownership-board reply, 2026-10-03 |
| **Customer App** | none, ever | our audit INV-2026-09-15-003; confirmed to you as Q-CA-2 |
| **POS** | **none** — does not read it, and does not touch the shared DB at all | POS answer to our P1, 2026-10-03 |

**Therefore no component anywhere in the estate reads this collection.** Every Call Waiter and Pay
Bill event ever written has been unread. That is not a disagreement between our teams — it is a
gap none of us could see until all three answers were on the table.

## The amendment

**Current text (§2d, `pos_event_logs` row):**

> owner = **CRM** (sole writer) · consumer = **POS — required** · Customer App = never.
> **Inert until POS consumes it.**

**Proposed text (v1.1):**

> owner = **CRM** (sole writer) · consumer = **NONE as at 2026-10-03** — POS has confirmed it does
> not read this collection and does not access the shared DB · Customer App = never.
> **The events are unconsumed. A consumer must be designated, and the delivery mechanism agreed,
> before any producer is wired.**

### What this does and does not change

| | |
|---|---|
| **Ownership** | **Unchanged.** CRM remains the sole writer and therefore the owner. No row moves between teams |
| **Any obligation on CRM** | **None.** We are not asking you to build, remove or alter anything |
| **Our side** | Unchanged — we never touch the collection, and our Call Waiter / Pay Bill buttons stay unwired |
| **The annotation** | Corrected from "POS will consume this" to "nobody currently consumes this" |

### Why bother amending at all

Because the old wording implies the pipeline is one integration away from working, and it is not.
Anyone reading §2d in six months would reasonably assume POS is consuming these events. The next
person to pick up Call Waiter should find the truth in the contract, not rediscover it from three
separate teams.

## What happens to the feature

POS has **parked** the direction question and told us the feature is **not built yet** — not
cancelled. So if and when it is revived, the realistic options are the two you and we already
identified, and reading the shared DB is not among them:

- **(a)** the actions stay with CRM, and **CRM pushes** each event to a POS endpoint; or
- **(b)** the actions **move to POS** and we call POS directly.

Nothing is being decided here. We are only recording that today there is no consumer.

## What we are asking for

1. **Agree the amended §2d text above** — reply "agreed" is enough.
2. On your agreement we will publish the contract as **v1.1** with this single row changed, the
   revision history updated, and both signatures carried forward. **No re-signature of Part 1 is
   required** — §1–§6 is otherwise untouched.
3. If you would rather word it differently, send a redline. If you think the annotation should
   stand, tell us why and we will leave it.

## For completeness — nothing else has changed

Your CR-093, CR-094 and CR-096 remain as agreed in §4c and §6 step 1; we have not started our step 2
and will probe each endpoint on UAT before wiring. Our `users` field projection is still going ahead
independently, and your advance-notice commitment on the six field names (§7 O-10) is unaffected.
