# Questions for POS (Paws) Agent — Shared DB Contract Clarification
## From: MyGenie Customer App team
## Ref: INV-2026-09-15-002 Shared DB Ownership Map
## Date: 2026-09-15

## Context for POS Agent

We (Customer App / Scan-and-Order) and CRM share the same `mygenie` MongoDB database.
We are mapping who reads and writes each collection so that both teams can avoid
silent overwrites, schema drift, and blocked migrations.

CRM flagged that some questions in our brief may actually belong to POS rather than CRM,
because the Customer App is part of the POS ecosystem — orders placed via our app flow
through POS into CRM. We agree: several of our open questions are yours to answer, not CRM's.

We have **four specific questions** for POS.

---

## Question P1 — `pos_event_logs`: Does POS write to this collection directly?

CRM's `scan.py` writes to `db.pos_event_logs` when customers call
`POST /api/scan/call-waiter` and `POST /api/scan/request-bill`.

Our Customer App currently has these as **unimplemented stubs** (TODO comments, no API call wired).
When we implement them, our frontend will call CRM's `/scan/call-waiter` and
`/scan/request-bill` endpoints, which will write to `pos_event_logs`.

**Questions:**
1. Does POS also write to `pos_event_logs` **directly** (independent of CRM's scan endpoints)?
2. What is the purpose of `pos_event_logs` from POS's perspective — is it a queue,
   an audit trail, or a notification trigger?
3. When our Customer App eventually calls `/scan/call-waiter`, does POS need to be
   notified separately, or does CRM handle the POS notification internally?

Note: `pos_event_logs` does not currently exist in our shared UAT `mygenie` DB
(confirmed by live probe). Please clarify if it is production-only.

---

## Question P2 — `import_logs` and `webhook_logs`: Does POS write to these?

Our live UAT DB probe found these two collections that neither we nor CRM claim ownership of:

| Collection | Docs in UAT | Our current access |
|---|---|---|
| `import_logs` | 44 | Zero — we never touch it |
| `webhook_logs` | 10 | Zero — we never touch it |

CRM's addendum does not include either collection.

**Questions:**
1. Does POS write to `import_logs`? For example, when bulk-importing customer data
   or order history from POS into CRM — is that logged here?
2. Does POS write to `webhook_logs`? For example, when POS fires webhook events
   for order status changes, new orders, or KOT events — are those logged here?
3. If POS owns either collection, please confirm so we can mark them correctly in our map.
4. If neither POS nor CRM owns them, we need to know who does — they have live data
   (44 and 10 docs respectively) so something is writing to them.

---

## Question P3 — `pos_id` format: Is `"0001"` fixed or per-restaurant?

Our backend constructs the admin user ID as:
```
user_id = f"pos_{pos_id}_restaurant_{restaurant_id}"
```

From the live `users` collection, we see:
- `users.pos_id = "0001"` (for restaurant 689 / Kunafa Mahal)
- `users.id = "pos_0001_restaurant_689"`

CRM's `_normalize_restaurant_id()` function also uses this full format.

**Questions:**
1. Is `pos_id = "0001"` fixed and universal for all restaurants, or is it per-restaurant?
2. If it is per-restaurant: when a new restaurant is onboarded, what determines their `pos_id`?
3. Could two restaurants ever have the same `pos_id`? (i.e., is `pos_id` unique per deployment
   or per restaurant?)

This matters because the full-format `restaurant_id` (`pos_0001_restaurant_689`) is used as
the CRM user ID and may appear in `customer_app_config` if CRM writes with a full-format key.
If `pos_id` varies, the full-format key becomes unpredictable.

---

## Question P4 — Phone number format: What does POS send to CRM in order payloads?

This is relevant to a separate CR (CR-2026-09-15-003 — phone normalisation) but the
answer is needed from POS.

**Background:** Our Customer App sends `cust_phone` in 10-digit national format (e.g., `9579504871`)
when placing an order. 72% of orders in CRM's DB have no `customer_id` linked, partly because
POS sends phone in inconsistent formats.

**Questions:**
1. When our Customer App sends `cust_phone` as a 10-digit national format in the order payload,
   does POS forward it to CRM **unchanged**, or does POS reformat it
   (e.g., add `+91`, add `91`, strip leading zeros)?
2. If the Customer App sends an empty `cust_phone` (which happens today for non-+91 numbers
   due to a bug in our `extractPhoneNumber` function), does POS:
   (a) reject the order,
   (b) accept it as a walk-in/anonymous order, or
   (c) substitute a default value?
3. What phone format does POS use internally when storing customer records?
   (10-digit, E.164 `+91XXXXXXXXXX`, `91XXXXXXXXXX`, or other?)

---

## ADDENDUM 2026-10-03 — P1 refined, P2/P3 closed by CRM, new P5/P6/P7

CRM has since answered in detail (INV-022 rounds 1 and 2 + the filled ownership board), which
**closes P2 and P3** and **sharpens P1**. Three new questions below. Please answer P5, P6 and P7 —
they are now the only things blocking a three-way data-ownership freeze.

| # | Status |
|---|---|
| **P1** | **STILL OPEN — and now the critical one.** See P1-refined below. |
| **P2** | ✅ CLOSED by CRM. `import_logs` (customer-import history, their CR-035) and `webhook_logs` (Freshmarketer webhook idempotency + audit, their CR-030) are **CRM-owned**, with code evidence. POS does not need to answer. |
| **P3** | ✅ CLOSED by CRM. `pos_id` is the constant `"0001"`. |
| **P4** | 🅿️ PARKED by our owner — India-only rollout, and our `+91` path already produces CRM's canonical 10-digit form. Answer when convenient; no longer blocking. |

### P1-refined — does **anything** in POS read `pos_event_logs`?

CRM has confirmed, with file:line, that they are a **write-only producer** on this collection:
3 writes (`scan.py:859` call-waiter, `scan.py:877` request-bill, `pos.py:2484`) and **0 reads**.
We never touch it. So:

> **If POS does not read `pos_event_logs`, then nothing in the entire system does, and every
> Call Waiter / Pay Bill event ever written has gone nowhere.**

Please confirm one of:
- (a) POS **does** read it — tell us which service/job, how often, and how staff are notified; or
- (b) POS **does not** read it — in which case the feature is dead end-to-end and we need P6 below.

### Important framing correction before you answer P1-refined and P6

Our owner has confirmed that **POS does not use the shared `mygenie` database at all** — it is
Customer App + CRM only, and POS integrates purely through CRM's API and webhooks. That matches the
ground rule both we and CRM have signed (**G3**: POS never writes the shared DB directly).

If that is right, then **P1-refined effectively answers itself: POS cannot be reading
`pos_event_logs`, because POS does not read that database.** Please still confirm it explicitly —
but it means the realistic options for **P6** are only:

- **(a)** the actions stay in CRM and **CRM pushes** each event to a POS endpoint (API call or
  webhook), or
- **(b)** the actions **move to POS** and we call POS directly.

**"POS reads the collection" is not on the table.** If our owner's understanding is wrong and POS
does read the shared DB somewhere, tell us — that would be a more significant finding than the
feature itself, because it contradicts a signed ground rule.

### P6 (new) — who should own Call Waiter / Pay Bill?

CRM has these two endpoints live (`POST /scan/call-waiter`, `POST /scan/request-bill`, body
`{table_id, message?}`, customer token required) and each writes one document to
`pos_event_logs`:

```
{type: "call_waiter" | "request_bill", user_id, customer_id, table_id, message, status: "pending", created_at}
```

CRM has asked whether these should stay with them as event producers with POS consuming, or move
to POS entirely. **Our owner has referred the decision to POS.** Which do you want?
- (a) **Keep in CRM.** POS commits to consuming `pos_event_logs` and notifying staff. We wire our
  buttons to CRM's two endpoints unchanged.
- (b) **Move to POS.** Give us POS endpoints for both actions and we call POS directly; CRM drops
  its two routes and nothing writes `pos_event_logs` any more.
- (c) Something else — tell us and we will follow it.

Whichever you pick, please state **how a waiter or cashier actually finds out** — a screen, a
sound, a ticket, a notification. That is the acceptance criterion; the API call is the easy part.

### P7 (new) — what does "Pay Bill" mean on the POS side?

We need this pinned down **before anyone plans code**, because if it is misread as an in-app
payment it becomes a money-handling change with a completely different approval bar on our side.

Our assumption: **"Pay Bill" = the diner is asking to settle the bill at the table.** It raises a
request for staff. It does **not** take card details, does not call a payment gateway, and does
not mark the order paid.

Please confirm that is right, and tell us what POS expects to happen next (does a cashier close
the bill? does the diner pay by cash/card at the table? does POS print something?).

### P5 (new) — admin profile endpoint, for the admin-login switch

CRM has told us they are **not** the identity provider for restaurant admins — their own admin
login proxies MyGenie POS (`login` → `profile`) and the `users` row in the shared DB is only a
cache. We are therefore moving our admin login to authenticate against POS directly, which removes
our last direct read of a CRM-owned collection.

We already call `POST /auth/vendoremployee/login` with the admin's credentials. What we are missing:

1. **The profile endpoint path** — the one that returns the admin's restaurants after login. CRM
   takes `restaurants[0].id` (short form, e.g. `689`) and `name` from it. What is the exact path
   and response shape?
2. **Can `restaurants[]` contain more than one entry?** If an admin manages several outlets, CRM
   silently takes the first. We do not want to copy that behaviour blindly — should we show an
   outlet picker instead?
3. Is there any rate limit or token lifetime on that login we should respect, given it will now run
   on every admin session?

---

## Summary — Questions by Priority

| # | Question | Priority | Impact if unanswered |
|---|---|---|---|
| **P1-refined** | Does anything in POS **read** `pos_event_logs`? | **P1** | Call Waiter / Pay Bill are dead end-to-end; blocks CR-2026-10-03-005 and the `pos_event_logs` ownership row |
| **P5** | POS admin profile endpoint + multi-restaurant behaviour | **P1** | Blocks our admin-login switch (CR-2026-09-15-004) — the last direct read of a CRM table |
| **P6** | Call Waiter / Pay Bill: keep in CRM or move to POS? **And how does staff get notified?** | **P1** | Blocks CR-2026-10-03-005; referred to POS by our owner |
| **P7** | Confirm "Pay Bill" = request to settle at table, **not** an in-app payment | **P1** | Scope/approval risk — must be settled before planning |
| ~~P2~~ | ~~`import_logs` / `webhook_logs`~~ | — | ✅ CLOSED by CRM (both CRM-owned, code evidence) |
| ~~P3~~ | ~~`pos_id = "0001"`~~ | — | ✅ CLOSED by CRM (constant) |
| P4 | Phone format POS sends to CRM | P3 | Parked — India-only; our `+91` path already canonical |

---

*The Owner and CRM are receiving separate question briefs in parallel.*
*OWNERSHIP_MAP.md will not be finalised until all three parties have replied.*
