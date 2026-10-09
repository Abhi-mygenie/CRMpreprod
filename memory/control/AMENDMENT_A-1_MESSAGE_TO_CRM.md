# Paste-ready message to CRM — amendment A-1
## Approved by owner 2026-10-03. Attach `AMENDMENT_A-1_pos_event_logs_consumer.md` if their agent reads files.

---

Hi — one small amendment request against the contract we both signed on 2026-10-03, plus a closing
note on GAP-11.

## Amendment A-1 — `pos_event_logs` consumer annotation (§2d)

We have put a question to POS and the answer changes a fact in §2d. Since §2 is frozen, we are
**not** editing it ourselves — §8 C1 says a §2 change needs your written agreement and a version
bump. Hence this note.

**What POS told us (2026-10-03):** POS does **not** read `pos_event_logs`, and does not access the
shared database at all.

Putting all three answers together for the first time:

| Party | Access to `pos_event_logs` | Source |
|---|---|---|
| **CRM** | **write-only** — 3 writes, 0 reads (`scan.py:859`, `scan.py:877`, `pos.py:2484`) | your ownership-board reply |
| **Customer App** | none, ever | our audit INV-003 / Q-CA-2 |
| **POS** | **none** | POS answer to our P1 |

**So no component anywhere reads this collection.** Every Call Waiter and Pay Bill event ever
written has been unread. That is not a disagreement between our teams — it is a gap none of us
could see until all three answers were on the table.

**Current §2d text:**
> owner = CRM (sole writer) · consumer = **POS — required** · Customer App = never.
> Inert until POS consumes it.

**Proposed v1.1 text:**
> owner = CRM (sole writer) · consumer = **NONE as at 2026-10-03** — POS has confirmed it does not
> read this collection and does not access the shared DB · Customer App = never.
> **The events are unconsumed. A consumer must be designated, and the delivery mechanism agreed,
> before any producer is wired.**

**What this changes:** the annotation only.
- **Ownership is unchanged** — you remain the sole writer and therefore the owner.
- **No obligation on you.** We are not asking you to build, remove or alter anything.
- **No re-signature of Part 1** — §1–§6 is otherwise untouched.
- Our side is unchanged: we never touch the collection, and our two buttons stay unwired.

**Why bother:** the current wording implies the pipeline is one integration away from working.
Anyone reading §2d in six months would reasonably assume POS is consuming these events. The next
person to pick up Call Waiter should find the truth in the contract rather than rediscovering it
from three teams.

**On the feature itself:** POS has parked the direction question and says it is **not built yet** —
not cancelled. If it is revived, the options remain the two we both identified: *(a)* the actions
stay with you and **CRM pushes** each event to a POS endpoint, or *(b)* they **move to POS** and we
call POS directly. Reading the shared DB is confirmed off the table. Nothing is being decided now.

**Ask:** reply "agreed" and we will publish **v1.1** with this one row changed. If you would word it
differently, send a redline; if you think the annotation should stand, tell us why and we will
leave it.

## Closing note on GAP-11 (your §C / our O-7)

Thank you for verifying `core/auth.py:11` has no hardcoded JWT fallback in **preview**. Our owner is
confirming the **live** host separately — that is our action, not yours.

For completeness, our side of that shared risk: our own `JWT_SECRET` is **required with no
fallback** (`server.py:47-49` raises on startup if it is missing), HS256, 63 characters, not a
placeholder value. So even if the two secrets were ever identical, a CRM-signed customer token
would not satisfy our admin routes — our payload shape differs and the user lookup would fail.
We are not asking you for anything here; recording it so both sides' halves of GAP-11 are on file.

## Everything else unchanged

CR-093, CR-094 and CR-096 remain as agreed in §4c and §6 step 1 — we understand your PLANNING gate
is not open yet, so we are not asking for dates. We have not started our step 2 and will probe each
endpoint on UAT before wiring. Our `users` field projection is still going ahead independently, and
your advance-notice commitment on the six field names (§7 O-10) is noted and appreciated.
