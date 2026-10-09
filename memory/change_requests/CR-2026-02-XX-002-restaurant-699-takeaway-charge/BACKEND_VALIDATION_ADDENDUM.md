# INVESTIGATION_ADDENDUM — CR-2026-02-XX-002 (Backend Validation)

**Purpose:** Validate owner's statement "have added takeaway_charges key from backend in restaurant setting api" against actual code + running system.
**Investigation by:** E1 (Role 6 — Investigation, read-only)
**Date:** 2026-02 (this session)
**Result:** ❌ **CLAIM NOT VERIFIED** — the `takeaway_charge` field is NOT present in any of the restaurant-setting endpoints reachable from the customer app in the current environment.

---

## 1. Credentials validation — `owner@brew.com` / `Qplazm@10`

### 1.1 Result: ❌ Login FAILED

```
POST {BACKEND}/api/auth/login
Body: {"phone_or_email":"owner@brew.com","password":"Qplazm@10","pos_id":"0001"}
Response: 404 {"detail":"Account not found. Please contact restaurant."}
```

### 1.2 Direct MongoDB check confirms

Own-backend `users` collection has 29 total entries. **Zero match** email/phone `owner@brew.com` (or any string containing `brew`).

```python
db.users.find({"$or":[{"email":"owner@brew.com"},{"phone":"owner@brew.com"}]})
# → None
db.users.count_documents({}) → 29 total; none brew-related
```

### 1.3 Why the credential fails

Reading `server.py:501-616` (unified login flow):

- **Step 1**: Look for a customer scoped by `restaurant_id` → skipped (no `restaurant_id` in payload).
- **Step 2**: Look for a customer by phone/email alone → not a customer.
- **Step 3**: Look in `users` collection (restaurant admins) by email/phone → **fails here — no such row in our DB**.
- **Step 4**: Return 404.

Our own-backend never calls the POS `/auth/login` endpoint to *validate* — POS is only called *after* we find a local user, purely to refresh the POS session token. So an admin who exists on POS but hasn't been onboarded to our own-backend `users` collection cannot log in at all.

## 2. Restaurant-setting API validation

I checked all three places the customer app reads restaurant configuration from:

### 2.1 Own-backend `GET /api/config/{restaurant_id}` — ❌ NO takeaway_charge

Tested restaurant IDs `478`, `716`, `699`, `550`, `509`, `1`. All return **86 top-level keys**. Takeaway-related keys present:

| Key | Type | Value at rid=699 |
|---|---|---|
| `onlinePaymentTakeaway` | boolean | `True` |
| `otpRequiredTakeaway` | boolean | `False` |
| `skipOtpTakeaway` (some configs) | boolean | (variable) |

Any of these substrings in the 86 keys: `charge`, `fee`, `takeaway_charge`, `takeaway_charges`, `takeawayCharge`, `takeaway_fee`, `packagingCharge`, `packaging_fee`, `handling_charge` → **ZERO hits**.

### 2.2 Direct Mongo `db.customer_app_config` — ❌ NO takeaway_charge

9 total documents. Every document sampled has the same shape as the API response. No monetary takeaway field present in any of them.

### 2.3 POS API `POST /web/restaurant-info` — ❌ NO takeaway_charge

Called successfully with a fresh POS token (via `/api/pos/auth-token`) and correct payload shape `{"restaurant_web":"699","pos_id":"0001"}`.

Charge/fee-related fields present in POS response:
- `minimum_shipping_charge = 0`
- `per_km_shipping_charge = None`
- `maximum_shipping_charge = None`
- `service_charge = 'No'`, `service_charge_percentage = '0.00'`
- `surcharge = 'Yes'`
- `auto_service_charge = 'No'`
- `service_charge_tax = '0.00'`
- `deliver_charge_gst = '0.00'`
- `delivery_fee = 'No'`

Takeaway-related keys:
- `live_payment.takeaway_online_payment = 'No'` — boolean flag only

**No `takeaway_charge`, no `takeaway_fee`, no `packaging_charge`, no `handling_fee`.** The field is not exposed by POS `web/restaurant-info` in this environment.

## 3. Conclusion of validation

The change owner described (`takeaway_charges` key added to the "restaurant setting api" backend) is **not observable** from any of the three data sources the customer app currently reads:

| Source | Endpoint | takeaway_charge exposed? |
|---|---|---|
| Own-backend | `GET /api/config/{rid}` | ❌ No |
| MongoDB direct | `db.customer_app_config` | ❌ No |
| POS API | `POST /web/restaurant-info` | ❌ No |

## 4. Possible explanations (owner to confirm)

Ordered by probability:

### 4.1 Deploy environment mismatch (most likely)

The customer app's `MYGENIE_API_URL` points to `https://preprod.mygenie.online/api/v1`. If the backend change was deployed to a **different environment** — production, a staging branch, a separate MyGenie backend, or a feature branch not merged into preprod — this environment simply hasn't received the change yet.

**How to confirm:** owner shares the deploy URL/environment where the field is live, or confirms the merge status.

### 4.2 Different API surface

"Restaurant setting api" could refer to an admin-side POS endpoint that the customer app does not call. For example:
- `POST /admin/restaurant-settings/{rid}` on POS (admin-only, requires admin JWT)
- A CRM-side settings endpoint
- A new own-backend endpoint like `/api/restaurant-info/{rid}` (which agent prompt §7 flags as a "silent 404" — GAP-007)

**How to confirm:** owner shares the exact endpoint path + method + one example response.

### 4.3 Different field name

The field was added under a name I didn't grep for (`packaging_fee`, `handling_charge`, `to_go_charge`, `pickup_charge`, etc.).

**How to confirm:** owner shares the exact key name.

### 4.4 User account not provisioned in customer app

Even if the POS-side change is live, `owner@brew.com` cannot log in through our own-backend flow because the account is missing from `db.users`. Login-based validation (as owner requested) is currently impossible.

**How to confirm:** owner either provisions the account in our `users` collection, or provides admin credentials that already exist locally.

## 5. What this means for CR-2026-02-XX-002

If the `takeaway_charge` field IS live somewhere (per §4.1/4.2/4.3):

- **Option C** from the earlier investigation (config-driven, admin-editable per-restaurant) becomes **immediately viable and the correct recommendation** — no need to hardcode Rest 699 anymore.
- The FE just needs to read `config.takeaway_charge` (or whatever the exact key name is) from `RestaurantConfigContext` and add it to `orderService.ts`'s `delivery_charge` payload when `orderType === 'takeaway'`.
- GAP-021 would still be registered but as **CLOSED IMMEDIATELY** — replaced by config-driven behavior. No landmine created.

If the field is NOT actually live yet in preprod (per §4.1):

- Option B (helper module) remains the correct short-term recommendation.
- GAP-021 stays as documented, with sunset condition: "when takeaway_charge field is available in `/api/config/{rid}` response."

## 6. Impact on BUG-2026-02-XX-001 (delivery charge investigation)

None. The delivery-charge bug root cause (`order_value: '0'` hardcode) is independent of this validation.

## 7. Next steps (blocked pending owner clarification)

I cannot validate further without one of:

| # | Owner action | Unblocks |
|---|---|---|
| Q-B1 | Confirm which environment / URL has the `takeaway_charge` field live | §4.1 |
| Q-B2 | Share exact endpoint path + payload + example response showing the field | §4.2 |
| Q-B3 | Confirm exact field name (in case my grep missed it) | §4.3 |
| Q-B4 | Provision `owner@brew.com` in own-backend `users`, OR share admin creds that exist locally | §4.4 + full end-to-end validation via login |

Once any one of Q-B1/Q-B2/Q-B3 is answered, I can re-run the validation and confirm. Q-B4 is only needed if you specifically want login-based validation; the field's presence can be confirmed without login (I already tested config API without any auth on `/api/config/{rid}` — it's a public read).

## 8. Validation output (canonical)

```text
Validation complete: CR-2026-02-XX-002 (addendum)
Result: CLAIM NOT VERIFIED — takeaway_charge field not present in customer-app-reachable APIs in this environment.
Evidence: 3 sources checked (own-BE /api/config, Mongo customer_app_config, POS /web/restaurant-info). Zero hits for takeaway_charge / packaging_charge / takeaway_fee / handling_charge / to_go_charge.
Credentials: owner@brew.com does NOT exist in own-BE users collection — login flow returns 404.
Confidence: HIGH — negative result confirmed via 3 independent data sources + direct DB read.
Steps used: 6/10
Blockers: Owner must answer Q-B1 / Q-B2 / Q-B3 to unblock re-validation. Q-B4 is optional.
Docs updated: /app/memory/change_requests/CR-2026-02-XX-002-restaurant-699-takeaway-charge/BACKEND_VALIDATION_ADDENDUM.md
Next: Owner clarifies deploy location or field name → I re-validate → if confirmed, switch recommendation from Option B (hardcode helper) to Option C (config-driven).
```

---

## 9. RE-VALIDATION — Owner clarification received (2026-07-13) ✅ RESOLVED

**Owner provided:**
- Exact curl: `POST preprod.mygenie.online/api/v1/web/restaurant-info` with `{"restaurant_web":"699"}` (no `pos_id`)
- Exact field name: `takeaway_charges` (plural)
- DevTools screenshot confirming `"takeaway_charges":10` in live response

**Re-validation result: ✅ CLAIM VERIFIED**

```json
// preprod.mygenie.online/api/v1/web/restaurant-info — {"restaurant_web":"699"}
"takeaway_charges": 10
```

**Root cause of prior miss:**
The original validation called the endpoint with `{"restaurant_web":"699","pos_id":"0001"}`. The correct minimal payload is `{"restaurant_web":"699"}` without `pos_id`. This payload difference caused a different response shape (or the field was stripped). The field was present in the POS all along.

**Own-backend `/api/config/699` still does NOT expose `takeaway_charges`** — confirmed. However, this is NOT needed. The FE already fetches POS restaurant-info directly via `useRestaurantDetails` → `RESTAURANT_DETAILS` endpoint. `posRestaurant.takeaway_charges = 10` is available in the FE without any backend changes.

**Q-B1/Q-B2/Q-B3: All resolved by the owner curl + field name.**
**Q-B4: owner@brew.com still not in own-BE users — only blocks smoke test, not implementation.**

### 9.1 Updated validation output (canonical)

```text
Re-validation complete: CR-2026-02-XX-002 (BACKEND_VALIDATION_ADDENDUM §9)
Result: CLAIM VERIFIED — takeaway_charges:10 confirmed in POS /web/restaurant-info
Field: takeaway_charges (plural, integer, value=10 for restaurant 699)
Prior miss: payload included pos_id which is not required; omitting it returns the field
Own-BE /api/config: still does NOT expose field — not needed (FE reads POS directly)
Recommendation: Option C (config-driven via useRestaurantDetails) — no backend changes required
All Q-B1/Q-B2/Q-B3 resolved. Q-B4 (owner@brew.com) still open — non-blocking for implementation.
Docs updated: BACKEND_VALIDATION_ADDENDUM.md (§9), INVESTIGATION_REPORT.md (§11), SESSION_HANDOVER.md (new)
```

---

*End of validation addendum (updated 2026-07-13 — claim verified, blockers resolved). Investigation agent must not code.*
