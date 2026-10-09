# Questions for Owner — Shared DB Contract + Architecture Decisions
## Ref: INV-2026-09-15-002 + CRM Gap Response 2026-09-15
## Date: 2026-09-15

These are the decisions only you can make. We are not asking CRM or POS these —
they are architectural and policy calls that need your sign-off before we can
finalise the ownership map and proceed with the next CRs.

There are **five decision areas**. Each has clear options for you to choose from.

---

## Decision O1 — `customer_app_config`: Who owns the write? ⚠️ Highest priority

**Situation:**
CRM's `PUT /api/scan/config/{restaurant_id}` is a live, active endpoint (confirmed in their
gap response). Both our admin UI and CRM currently have a write path to the same 106-key
config document. One team's save can silently overwrite the other's with no conflict detection.

**Owner decision needed — choose one:**

| Option | What it means |
|---|---|
| **A — Customer App owns all config writes** | CRM disables / makes read-only their `PUT /scan/config/{rid}`. Our admin UI is the only writer. This is the current intent of OD-7. |
| **B — Key partition** | Agree a split: CRM owns a defined subset of keys (e.g., loyalty/WhatsApp-related), Customer App owns the rest. Both teams get a write path but to non-overlapping keys. Requires ongoing coordination to prevent future key collisions. |
| **C — CRM owns all config writes** | We retire our admin config UI write paths. CRM becomes the single writer. We would need to either embed in CRM's admin, or call CRM's endpoint from our UI. |

Your current standing decision (OD-7) points to **Option A**.
We are asking you to confirm, because CRM is actively using their PUT today — we cannot
simply proceed without their agreement, and they will need your authority to lock it down.

---

## Decision O2 — `dietary_tags_mapping`: Who owns the write?

**Situation:**
Same conflict as O1 but for dietary tags. Both our admin UI
(`PUT /api/dietary-tags/available`) and CRM (`PUT /api/scan/menu/dietary-tags/{rid}`)
have active write paths to `dietary_tags_mapping`.

**Owner decision needed — choose one:**

| Option | What it means |
|---|---|
| **A — Customer App owns** | CRM locks their PUT. Our admin manages dietary tags. Current state. |
| **B — CRM owns** | We retire our dietary tags admin. CRM becomes the single writer. |
| **C — Ask CRM first** | Wait for CRM to confirm if their admin UI actually uses this today before deciding. |

---

## Decision O3 — JWT Secret: Rotate before next release?

**Situation:**
We have asked CRM whether their JWT signing secret is the same as ours (Q5).
We do not yet have their answer.

If the answer is **same**: a CRM-issued customer token could technically validate
against our admin backend routes (since both use HS256 with the same key).
This is a security boundary crossing, even if not actively exploited today.

**Owner decision needed:**

1. Do you want us to proceed to release before we have CRM's Q5 answer? (Not recommended.)
2. If CRM confirms the secret is the same — do you authorise us to rotate our `JWT_SECRET`
   independently (without waiting for CRM to rotate theirs)? Or should both rotate together?
3. Is there a security policy on how frequently JWT secrets should be rotated on this project?

---

## Decision O4 — `users` collection schema contract

**Situation:**
Our admin login reads CRM's `users` collection directly. We depend on 6 specific fields:
`id`, `email`, `phone`, `password_hash`, `restaurant_id`, `pos_id`.
If CRM renames or removes any of these, our admin login breaks silently.

**Owner decision needed:**

1. Do you want us to formally request CRM treat these 6 fields as a stable interface
   (no rename/removal without advance notice)?
2. Or would you prefer we build an independent admin auth that does not depend on
   CRM's `users` collection? (This would be a new CR — medium complexity.)
3. Is there a longer-term plan to unify admin auth under one system (CRM or ours)?

---

## Decision O5 — Call Waiter / Request Bill implementation

**Situation:**
Our frontend has "Call Waiter" and "Pay Bill" buttons that are currently **unimplemented stubs**
(TODO comments, no API wired). When implemented, they would call CRM's
`/scan/call-waiter` and `/scan/request-bill` endpoints, which write to `pos_event_logs`.

We have asked POS whether they also need to be notified separately.

**Owner decision needed:**

1. Is implementing Call Waiter / Pay Bill in scope for the current sprint,
   or should it remain a stub?
2. If in scope: should the flow go **Customer App → CRM scan endpoint only**,
   or **Customer App → CRM → POS notification** (two hops)?
3. Any specific behaviour you want: timeout, retry, silent fail vs error toast?

---

## Summary — Decisions by Priority

| # | Decision | Priority | Blocks |
|---|---|---|---|
| O1 | Config write ownership (Option A/B/C) | P0 | OWNERSHIP_MAP.md finalisation, OD-7 enforcement |
| O3 | JWT secret rotation before release | P0 Security | Release checklist |
| O2 | Dietary tags write ownership | P1 | OWNERSHIP_MAP.md, CR-006 scope |
| O4 | `users` schema contract or independent admin auth | P1 | Long-term admin auth stability |
| O5 | Call Waiter / Pay Bill implementation scope | P2 | Feature backlog priority |

---

*CRM and POS are receiving their own separate question briefs.*
*We will not update the OWNERSHIP_MAP.md until all three parties have replied.*
