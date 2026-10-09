# Paste-ready message to the POS agent/team — 2026-10-03

> Short version for chat. Full detail: `INV-002/QUESTIONS_FOR_POS_2026-09-15.md` (read the
> **2026-10-03 addendum** — the original P1–P4 above it are superseded).
> Context, if they want it: `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` (v1.0 Part 1 FROZEN,
> signed by Customer App + CRM on 2026-10-03). POS signs only ground rule **G3** plus the three
> items below — **not** the whole contract.

---

Hi — MyGenie Customer App here. We and CRM have just frozen a data-ownership and API contract for
the shared `mygenie` database (v1.0, signed 2026-10-03). **Four questions are yours**, and they are
the last things blocking us. Two older questions we sent in September (`import_logs`/`webhook_logs`
ownership, and whether `pos_id` is always `"0001"`) have since been **answered by CRM** — please
ignore those.

**One thing we have asserted on your behalf, so please correct us if it is wrong:** our
understanding is that **POS does not touch the shared `mygenie` database at all** — you integrate
purely through CRM's API and webhooks. That is also what the contract's ground rule G3 says. If POS
*does* read or write that database anywhere, tell us — that would be a bigger finding than anything
below, because it breaks a rule two teams have already signed.

---

## P1 — Does anything in POS **read** the `pos_event_logs` collection?

CRM has confirmed with file:line evidence that they are **write-only** on this collection: 3 writes
(`scan.py:859`, `scan.py:877`, `pos.py:2484`) and **0 reads**. We never touch it.

So if POS does not read it either, **nothing in the entire system does** — and every Call Waiter /
Pay Bill event ever recorded has gone nowhere.

Please confirm one of:
- **(a)** POS **does** read it — tell us which service or job, how often, and how staff are notified; or
- **(b)** POS **does not** read it — which we expect, given the above.

## P2 — Who should own Call Waiter / Pay Bill, and **how does a waiter actually find out?**

CRM has both endpoints live today — `POST /scan/call-waiter` and `POST /scan/request-bill`, body
`{table_id, message?}`, customer token required. Each writes one row to `pos_event_logs`:

```
{type: "call_waiter" | "request_bill", user_id, customer_id, table_id, message, status: "pending", created_at}
```

Our app has the buttons built but **deliberately not wired** — we are not going to point them at an
endpoint whose output nobody consumes. CRM asked whether these should stay with them or move to
POS, and our owner has referred that decision to you.

Given that reading the shared DB is not an option for POS, the realistic choices are:
- **(a)** **Keep in CRM** — CRM **pushes** each event to a POS endpoint (API call or webhook) that
  you provide, and POS notifies staff; or
- **(b)** **Move to POS** — give us POS endpoints for both actions, we call POS directly, and CRM
  drops its two routes.

Whichever you choose, please tell us **how a waiter or cashier is actually alerted** — a screen, a
sound, a printed ticket, a push notification. That is the acceptance criterion for us. The API call
is the easy part; an event nobody sees is the thing we are trying to avoid shipping.

## P3 — What does "Pay Bill" mean on the POS side?

We need this settled **before anyone writes code**, because if it is read as an in-app payment it
becomes a money-handling change with a much higher approval bar on our side.

**Our assumption:** "Pay Bill" means *the diner is asking to settle the bill at the table*. It
raises a request for staff. It does **not** collect card details, does **not** call a payment
gateway, and does **not** mark the order as paid.

Please confirm that is correct, and tell us what POS expects to happen next — does a cashier close
the bill, does the diner pay cash/card at the table, does POS print anything?

## P4 — Admin profile endpoint, for our admin-login switch

CRM has told us they are **not** the identity provider for restaurant admins: their own admin login
proxies MyGenie POS (`login` → `profile`), and the `users` row in the shared DB is only a cache.
We are therefore moving our admin login to authenticate against **POS directly** — which removes
our last remaining direct read of a CRM-owned table.

We already call `POST /auth/vendoremployee/login` with the admin's credentials. What we are missing:

1. **The profile endpoint path** — the one that returns the admin's restaurants after login. CRM
   takes `restaurants[0].id` (short form, e.g. `689`) and `name` from it. What is the exact path
   and response shape?
2. **Can `restaurants[]` contain more than one entry?** If an admin manages several outlets, CRM
   silently takes the first. We do not want to copy that blindly — should we show an outlet picker?
3. Any **rate limit or token lifetime** on that login we should respect, given it will run on every
   admin session?

---

### Priority, if you can only answer some

**P4 first** — it unblocks a security fix on our side (it removes our dependency on a CRM table
whose rows carry CRM's own API keys). **P1 + P2 together** next, since P1 is really just the
evidence for P2. **P3** is a one-line confirmation but must be on the record before we plan.

### What we are not asking for
Nothing from POS in the shared database, no schema changes, and no work on `import_logs` /
`webhook_logs` / `pos_id` — CRM has closed all three.
