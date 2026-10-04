# CRM → POS — Brief: `pos_event_logs` consumption + Call Waiter / Pay Bill direction

## From: MyGenie CRM · To: MyGenie POS team
## Date: 2026-10-03 · Status: **DRAFT — awaiting CRM owner review before sending**
## Ref: CONTRACT_CUSTOMER_APP_CRM_v1.0 §7 (P1-refined, O-4/P6, O-11/P7) · INV-022

## Why you're getting this

The Customer App ↔ CRM contract (v1.0-RC3) is signed on the CRM + Customer App side for Part 1.
Three open items are owed by **POS**, and all three depend on CRM-side facts that only we can
supply. This brief gives you that evidence so you can answer without guessing. **No CRM change is
requested or pending** — we are read-only producers here.

---

## 1. The one fact that drives all three questions

**CRM writes to `pos_event_logs` and never reads it.** Code scan of the entire CRM backend:
- Writes: **3 call sites** (below)
- Reads: **0** — no `find` / `aggregate` / `count` anywhere in CRM touches this collection.

So anything CRM puts in `pos_event_logs` is **inert unless POS consumes it.**

### `pos_event_logs` is overloaded — it holds TWO different document shapes

**Shape A — customer table actions** (Call Waiter / Pay Bill), written by `routers/scan.py`:
```json
{
  "id": "<uuid>",
  "type": "call_waiter" | "request_bill",
  "user_id": "<full restaurant id, e.g. pos_0001_restaurant_689>",
  "customer_id": "<crm customer id>",
  "table_id": "<string>",
  "message": "<optional string>",
  "status": "pending",
  "created_at": "<iso8601>"
}
```
- `POST /scan/call-waiter` → `scan.py:845` (write at `scan.py:859`)
- `POST /scan/request-bill` → `scan.py:863` (write at `scan.py:877`)
- Auth: **customer token required**. Body: `{table_id, message?}`.

**Shape B — POS WhatsApp event log**, written by `routers/pos.py:2484`:
```json
{
  "id": "<uuid>", "user_id": "...", "pos_id": "...", "restaurant_id": "...",
  "event_type": "...", "order_id": "...", "customer_phone": "...",
  "recipient_phone": "...", "recipient_type": "...", "customer_id": "...",
  "whatsapp_sent": true, "whatsapp_error": null, "event_data": {...},
  "created_at": "<iso8601>"
}
```
- This is an audit log of POS-triggered WhatsApp events. Note the field is `event_type` here vs
  `type` in Shape A — the two shapes coexist in one collection.

---

## 2. What we need from POS

### P1-refined — Does POS read `pos_event_logs` at all?
- Does any POS process **poll / read / subscribe** to this collection?
- If yes: which shape(s) — A (table actions), B (event audit), or both?
- If no: then every Call Waiter / Pay Bill press today is recorded and **nothing happens** — no
  waiter is notified. We need to know which it is.

### P6 (contract O-4) — Call Waiter / Pay Bill direction
Two viable models — **POS to choose**:
- **(a) Keep in CRM as producer, POS consumes** — CRM keeps `/scan/call-waiter` + `/scan/request-bill`
  writing Shape A; **POS reads `pos_event_logs` and notifies staff**. CRM needs to know the read
  mechanism you'd use (poll interval? change stream? a CRM push endpoint you'd prefer we call?).
- **(b) Move to POS entirely** — Customer App calls a POS endpoint directly; CRM removes the two
  `/scan/*` routes. If so, give us the POS endpoint path + request body so Customer App can wire it.
- **And in both cases:** how does a waiter actually get notified today (POS screen / KDS / printer /
  push)? That's the missing half of the loop.

### P7 (contract O-11 / clause I6) — "Pay Bill" semantics
Please confirm our frozen definition: **"Pay Bill" = a request to settle the bill at the table. It
is NOT an in-app payment** — it raises a staff request, does not collect card details, does not call
a payment gateway, and does not mark an order paid. Per the operating prompt, anything touching money
is CRITICAL-risk with a different approval bar, so we've reserved this name until POS confirms. If POS
intends "Pay Bill" to ever become real in-app payment, flag it now so it's scoped separately.

---

## 3. What CRM is NOT asking / NOT changing
- CRM is not modifying `/scan/call-waiter` or `/scan/request-bill` until the direction (P6) is decided.
- CRM does not read `pos_event_logs` and has no plan to.
- Shape B (POS WhatsApp event log) is unaffected by this discussion — raised only so you know the
  collection is shared between two shapes.

## 4. Not in scope for CRM
Contract item **P5** (admin profile endpoint path, `restaurants[]` cardinality) is a POS → Customer
App matter — CRM has no input and makes no claim there.

---

**Reply format requested:** one line each — `P1:` … `P6:` … `P7:` — plus, if P6 = (a), the read
mechanism you want; if P6 = (b), the endpoint + body. We'll fold your answers into CONTRACT v1.0 and
unblock the `OWNERSHIP_MAP.md` freeze.
