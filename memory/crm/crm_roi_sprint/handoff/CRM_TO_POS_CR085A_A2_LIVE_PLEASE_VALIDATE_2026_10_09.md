**To:** POS team (MyGenie POS agent)
**From:** CRM team
**Re:** CR-085-A + CR-085-A2 LIVE on preview — canonical phone, guest orders, customer-lookup change — please validate
**Date:** 2026-10-09

This supersedes our 2026-10-09 085-A note (the "pending owner decision" in it is now resolved). Everything below is live on the CRM preview. **Nothing is rejected on any POS route; request shapes are unchanged; responses only gained fields.**

## 1. What changed for POS
| Route | Before | Now |
|---|---|---|
| `POST /pos/customers` (create) | phone stored as sent | phone stored **digits-only** + `country_code` (`+91` default); `phone_raw` kept when we cleaned it; junk phone (e.g. `0000000000`, 9 digits, all-same digits) → created but flagged `phone_invalid:true` and excluded from WhatsApp/loyalty jobs |
| `PUT /pos/customers/{id}` | — | same normalisation; junk → flagged, loyalty preserved |
| `POST /pos/customer-lookup` | returned any record matching the raw string | **junk phone → `success:false, "Customer not found", registered:false`; records flagged `phone_invalid` are hidden too** → capture a fresh number at the till |
| `POST /pos/orders` (realtime bill) | bill with junk/blank phone created or credited a customer | **GUEST ORDER**: `success:true`, `data.customer_id:null`, `data.guest_order:true`, `data.guest_reason:"invalid_phone"`, `points_earned:0`, `tier:null`, `is_new_customer:false`. No customer created or credited, no WhatsApp, invoice still generated, coupon usage still recorded. **If you send `pos_customer_id` (`user_id` in the body) and it matches, that wins** — full loyalty as before, even with a junk phone. `loyalty_points_used`/`wallet_used` on a guest bill are ignored (logged), the order is **not** rejected. Duplicate `order_id` still → `"Duplicate order"`. |
| `POST /pos/webhook/payment-received` | junk phone created a customer | junk phone → `customer_id:null, guest_order:true`, coupon maths still applied, no points |
| Customer sync (`customer_sync`) | — | phones normalised + de-duplicated across formats; junk flagged |
| All valid-phone paths | — | **unchanged**: `"+91 98765 43210"`, `"98765-43210"`, `"9876543210"` now all resolve to the **same** customer |

Response additions are **additive only**; `customer_id` / `customer_name` / `tier` can now be `null` on guest bills — please make sure your till code tolerates that.

## 2. Please validate on preview (tenant 69 / your test till), reply with evidence
| # | Action | Expected |
|---|---|---|
| P1 | `POST /pos/customers` with `"+91 90000 00123"` | stored `phone:"9000000123"`, `country_code:"+91"` |
| P2 | `POST /pos/customer-lookup` with `"90000-00123"` | `registered:true` (same customer) |
| P3 | `POST /pos/customer-lookup` with `"0000000000"` | `registered:false` |
| P4 | `POST /pos/orders` with `cust_mobile:"90000 00123"` | links to P1 customer, points as usual, `guest_order:false` |
| P5 | `POST /pos/orders` with `cust_mobile:"0000000000"`, no `user_id` | `success:true`, `customer_id:null`, `guest_order:true`, `points_earned:0` — bill accepted |
| P6 | Same as P5 but with `user_id:<pos_customer_id of P1>` | links to P1 customer, `guest_order:false` |
| P7 | Replay P5 with the same `order_id` | `"Duplicate order"` |
| P8 | Till UI with a P5 response | no crash on `customer_id:null` |

## 3. Recommendation for your side
Send `user_id` (your POS customer id) on every bill where you have it — it keeps attribution even when the phone typed at the till is bad. Where you only have a phone, validate 10 digits starting 6–9 before applying a customer-limited coupon or loyalty redemption, since a junk phone now means **no customer**.

## 4. FYI — not for POS
Customer App login (`skip-otp`) hardening (rate-limit bucket, `country_code`) shipped the same day; no POS impact.

CRM closes CR-085-A / A2 after your evidence + the owner's smoke test.
