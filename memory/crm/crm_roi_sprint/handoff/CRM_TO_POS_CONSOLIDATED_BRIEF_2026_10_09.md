# CRM → POS — Consolidated brief: 4 open items
**Date:** 2026-10-09
**Owner sends; agents never send.**
**Re:** P7 (Pay Bill semantics, still open) · CR-085-A/A2 validation (P1–P8) · `country_code` optional ask · CR-014 hotel folio `room_info`

This combines everything we need from your side into one message. Previous partial replies have been received and are noted below — thank you for those. Four items remain open.

---

## §1 — P7: "Pay Bill" semantics — still open since 2026-10-03

From our October brief, P1 and P6 are answered (P1 = POS does not read `pos_event_logs`; P6 = parked TBD). **P7 has not yet been answered.**

**The question:**
> `POST /scan/request-bill` writes a `type:"request_bill"` event to `pos_event_logs`. The Customer App button says "Pay Bill." We need POS to confirm the frozen definition:

**Option (a)** — Staff request only: "Pay Bill" raises a staff request at the table (like "Call Waiter"). It does NOT collect card details, does NOT call a payment gateway, does NOT mark an order paid. CRM keeps writing the event; POS is expected to consume it when P6 is unparked.

**Option (b)** — In-app payment: "Pay Bill" eventually becomes a real payment. If so, flag it now — this is CRITICAL-risk scope (money) that requires a separate owner approval and a different integration design.

**Why this matters:** the name "Pay Bill" is reserved and we will not build any real payment logic until you confirm (a). If (b), we need to redesign before either side builds further.

**Reply needed:** `P7: (a)` or `P7: (b) + intent`.

---

## §2 — CR-085-A/A2: phone normalisation + guest orders — P1–P8 validation (re-send)

We sent this on 2026-10-09 and have not yet received your validation. Re-sending for completeness.

**Summary of what changed on POS-facing routes** (all additive — nothing rejected, no request shape change):

| Route | Change |
|---|---|
| `POST /pos/orders` (junk/blank phone, no `pos_customer_id`) | **GUEST ORDER** — `success:true`, `customer_id:null`, `guest_order:true`, `guest_reason:"invalid_phone"`, `points_earned:0`, `tier:null`. Invoice still generated. Coupon usage recorded with `customer_id:null`. No WhatsApp. |
| `POST /pos/orders` (valid phone or `pos_customer_id`) | **Unchanged** — links customer, earns points, sends WhatsApp as before. |
| `POST /pos/webhook/payment-received` (junk phone) | Same guest-order response pattern. Coupon maths applied. |
| `POST /pos/customer-lookup` | Junk/placeholder phones + `phone_invalid` records → `registered:false`. Valid phones normalised before match — `"+91 98765 43210"` and `"9876543210"` are the same customer. |
| `POST /pos/customers` | Phone stored digits-only + `country_code`; `phone_raw` preserved; junk → flagged `phone_invalid:true`, excluded from loyalty/WhatsApp. |

**Please validate on preview (tenant 689 or your test till) and reply:**

| # | Action | Expected |
|---|---|---|
| P1 | `POST /pos/customers` with `"+91 90000 00123"` | stored `phone:"9000000123"`, `country_code:"+91"` |
| P2 | `POST /pos/customer-lookup` with `"90000-00123"` | `registered:true` (same customer found) |
| P3 | `POST /pos/customer-lookup` with `"0000000000"` | `registered:false` |
| P4 | `POST /pos/orders` with `cust_mobile:"90000 00123"` | links to P1 customer, `guest_order:false`, points earned |
| P5 | `POST /pos/orders` with `cust_mobile:"0000000000"`, no `user_id` | `success:true`, `customer_id:null`, `guest_order:true`, `points_earned:0` |
| P6 | Same as P5 but with `user_id:<pos_customer_id of P1>` | links to P1 customer, `guest_order:false`, full loyalty |
| P7 | Replay P5 with the same `order_id` | `"Duplicate order"` |
| P8 | Till UI receiving a P5 response | no crash on `customer_id:null` |

**Key recommendation:** Send `user_id` (your POS customer ID) on every bill where you have it — it wins over the phone and keeps attribution even when the phone typed is bad.

**CRM closes CR-085-A/A2 after your P1–P8 evidence + owner smoke.**

---

## §3 — Optional ask: add `country_code` to order webhook + customer-lookup (nice-to-have)

This is **not blocking anything** — CRM defaults to `+91` for Indian numbers. We are raising it now so you have the full picture.

**What POS already does right:** `POST /pos/customers` already sends `phone` and `country_code` as separate fields. Thank you — that is exactly the right shape.

**Two places that still bundle phone+cc:**

| Route | Current | Recommended |
|---|---|---|
| `POST /pos/orders` webhook | `customer_phone: "9876543210"` (no cc field) | `customer_phone: "9876543210"`, `customer_country_code: "+91"` |
| `POST /pos/customer-lookup` | `phone: "9876543210"` (no cc) | `phone: "9876543210"`, `country_code: "+91"` |

CRM will normalise any format regardless — this is a forward-compat ask for restaurants with foreign guests (`+61`, `+44` etc.) whose phones are stored correctly by `POST /pos/customers` but come through without a cc on the webhook. No change needed if all your tenants are India-only.

**Reply format:** `§3: noted` or `§3: will add by <date>` or `§3: India-only, skip`. Any of these is fine.

---

## §4 — CR-014: hotel folio — `room_info` fields in order webhook (ongoing since 2026-06-06)

CRM's e-invoice supports three modes: food (auto-detected), hotel room, hotel folio. Modes switch automatically based on fields in the order webhook. **For the hotel display to show room number, check-in/check-out dates and room charges correctly, POS needs to populate `room_info`.**

**The 7 fields CRM reads from `room_info` in `POST /pos/orders`:**

| Field | Type | Priority | Notes |
|---|---|---|---|
| `room_number` | string | **P0** | e.g. `"101"` — triggers hotel mode |
| `check_in` | string ISO-8601 | **P0** | e.g. `"2026-10-09T14:00:00"` |
| `check_out` | string ISO-8601 | **P0** | e.g. `"2026-10-11T11:00:00"` |
| `guest_name` | string | P1 | overrides customer name on invoice |
| `folio_number` | string | P1 | hotel internal reference |
| `room_rate` | float | P1 | nightly room charge (₹) |
| `nights` | int | P1 | number of nights |

**What "P0 only" gives you:** the invoice shows `Hotel Room Receipt`, room number, dates, F&B items + total. All GST calculated correctly.

**What P1 adds:** full folio view with nightly breakdown, guest name, folio number.

**How to send it** — add to the existing `POST /pos/orders` body:
```json
{
  "order_id": "...",
  "customer_phone": "...",
  ...existing fields...,
  "room_info": {
    "room_number": "101",
    "check_in": "2026-10-09T14:00:00",
    "check_out": "2026-10-11T11:00:00"
  }
}
```

If `room_info` is absent, CRM generates a standard food receipt as today — fully backward compatible.

**Reply format:** `§4: will add P0 by <date>` or `§4: not applicable (no hotel tenants)`.

---

## Summary — one line each is enough

| Item | Your reply |
|---|---|
| §1 P7 | `P7: (a)` staff-request-only, or `P7: (b)` + intent |
| §2 CR-085-A/A2 | "P1–P8 validated on preview \<date\>: \<evidence\>" |
| §3 `country_code` | `noted` / `will add by <date>` / `India-only, skip` |
| §4 hotel `room_info` | `will add P0 by <date>` / `not applicable` |

---

*CRM internal refs: `handoff/CRM_TO_POS_CR085A_A2_LIVE_PLEASE_VALIDATE_2026_10_09.md` · `handoff/CRM_TO_POS_POS_EVENT_LOGS_AND_TABLE_ACTIONS_2026_10_03.md` · `handoff/CR_014_POS_HOTEL_FOLIO_DATA_CONTRACT.md` · `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` (POS section)*
