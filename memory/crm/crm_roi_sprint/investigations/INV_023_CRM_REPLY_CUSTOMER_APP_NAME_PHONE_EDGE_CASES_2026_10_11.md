# INV-023 — CRM reply to Customer App brief 2026-10-11: name correction + phone change on Review Order
**Date**: 2026-10-11 · **Role**: Investigation Agent (read-only; no code, no data writes) · **Brief**: "Edge Case 1 — name correction · Edge Case 2 — phone change" from MyGenie Customer App (Scan & Order) · **Code verified**: `routers/scan.py` (preprod branch, 891 LOC) · `core/auth.py` · `routers/pos.py:670-720` · contract `INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` §2.2, §1

---

## 0. One correction before the answers — `skip-otp` does **not** accept `name`

The brief states *"we will now include `name` in the body (confirmed supported per CRM contract)"*. **That is not correct.**

- `SkipOTPRequest` (`scan.py:163-166`) = `{ phone, restaurant_id, country_code? }` only. Pydantic default `extra="ignore"` → a `name` key is **silently dropped** (no 422). Proven: `SkipOTPRequest(phone, restaurant_id, name="Jon").model_dump()` → `{'phone','restaurant_id','country_code'}`.
- A new customer created by `skip-otp` gets **`name: ""`** (`scan.py:205`). The contract v2 §1 line 82 already says so: *"`name` may be `""` for skip-otp-created customers"*. No CR ever added `name` to `skip-otp` (CR-089 added rate limits; CR-102 added `country_code`).
- `skip-otp` response = `{ token, customer_id, is_new_customer, phone }` — **no name/points/tier** (`scan.py:230-235`).

**Consequence for the happy path in the brief**: step 4 "CRM creates the customer record with their name" does not happen. Step 5 "name pre-filled from the CRM profile" will show **blank** for every first-time diner. So the "edge case" is the **main path**: the app must set the name after `skip-otp` with the endpoint in §1 — for *every* new customer, not only on correction.

---

## 1. Edge Case 1 — update the customer's name → **`PUT /scan/profile`** (exists today)

| | |
|---|---|
| **Endpoint** | **`PUT /scan/profile`** (`scan.py:331-343`). There is **no** `PATCH /scan/auth/me`. |
| **Auth** | `Authorization: Bearer <customer token from skip-otp>` — scoped to that customer_id + restaurant_id |
| **Body** | `{ "name": "John" }` — any subset of `name, email, dob, anniversary, gender, preferred_language, allergies[], favorites[], diet_preference, spice_level, cuisine_preference`. `phone` / `country_code` are **not** accepted (cannot change phone — by design). |
| **Response** | `200 { "success": true, "message": "Profile updated", "data": null }` · `200 { "success": false, "message": "No fields to update" }` when body has no known keys · `401` bad/expired token |
| **Semantics** | `$set` of the provided keys + `updated_at`. Overwrites, no history. |
| **Rate limit** | none on this route (token-gated) |
| **Caveats (CRM side, read-only observations)** | (i) **no validation on `name`** — `""` is accepted and will blank the name (`v is not None` filter, `scan.py:334`); whitespace-only and 500-char strings are accepted as-is. App should trim and skip the call when empty. (ii) `PUT` is honoured for existing customers too — a returning diner "Alok" who edits the field will overwrite "Alok". Only send when the diner actually edited the field. |
| **Recommended flow** | `skip-otp` → if `is_new_customer:true` **or** `GET /scan/auth/me` returns blank `name` → `PUT /scan/profile {name}` → Review Order. On "Jon → John" correction → same `PUT` before placing the order. |

**Does the order payload fix the name anyway?** No. The Scan app sends the order to the **POS**; the POS forwards it to CRM `POST /pos/orders` with `cust_name`. For an **existing** customer that path only back-fills `pos_customer_id` (`pos.py:690-697`); it **never updates `name`**. `cust_name` is used only when the customer is *created* by that path (`pos.py:716`). So after `skip-otp` created "" / "Jon", the order with `cust_name:"John"` leaves the CRM record unchanged. `PUT /scan/profile` is the only fix.

---

## 2. Edge Case 2 — phone changed on Review → **repeat `POST /scan/auth/skip-otp`** (works today)

| Q | Answer |
|---|---|
| **1. Does repeat `skip-otp` work for re-auth?** | **Yes.** The route is stateless find-or-create by `phone_match(restaurant, digits, cc)` (`scan.py:194-197`). Each call returns a fresh 24 h JWT for the customer that owns the phone in the body. Nothing ties a device/IP to the first phone. |
| **2. New number → fresh record?** | **Yes.** `is_new_customer:true`, record created with `name:""`, tier Bronze, 0 points (`scan.py:200-225`). → then `PUT /scan/profile {name}` with the **new** token (see §1). |
| **3. Existing number → existing profile?** | **Yes, the token belongs to the existing customer** (`is_new_customer:false`, `customer_id` = theirs). The `skip-otp` **response itself does not carry name/points/tier**; call **`GET /scan/auth/me`** (full customer doc: `name, tier, total_points, wallet_balance, total_visits, …`) or **`GET /scan/loyalty`** (computed summary) with the new token. |

**Constraints you must respect**

| Constraint | Value | Source |
|---|---|---|
| Rate limit per IP | **30 per 60 s** (restaurant Wi-Fi shared) → `429` + `Retry-After` | `scan.py:69,180` |
| Rate limit per phone+restaurant | **5 per 300 s** → `429` + `Retry-After` | `scan.py:70,189`. Two calls (wrong number, right number) are fine; a diner re-editing the same number 6× in 5 min will be throttled. |
| Phone validation | 10 digits, starts 6–9, not all-same digit; `+91`, `91`, leading `0`, spaces/dashes tolerated; **invalid → `400 "Enter a valid mobile number"`** (not a customer record) | CR-085 W13 |
| `country_code` | optional, default `+91`; send it when you have it (CR-102) | `scan.py:166` |
| `restaurant_id` | short (`"689"`) or full (`"pos_0001_restaurant_689"`) both accepted | BUG-030 |
| Token | HS256 JWT, **24 h**, **no refresh, no server-side revocation** — the old token for 9535310660 stays technically valid until expiry; the app must discard it (as the brief proposes). Never reuse it after the phone change. | `core/auth.py:33-45`, contract Q-O7 |
| Blocked / flagged customers | `skip-otp` does **not** check `is_blocked` or `phone_invalid` (only `/auth/lookup` does, `scan.py:266`) — a blocked diner still gets a token. Known gap, noted for CRM backlog (not a Customer-App action). | read-only observation |

---

## 3. Data-quality side effect the Customer App should know about (CRM ask back)

Calling `skip-otp` at **Browse Menu** creates a CRM customer for **every phone typed**, before the diner has committed to anything. In the phone-change scenario the wrong number **9535310660** now exists as a customer with `name:""`, 0 orders — permanently. On production there are already 21+ such blank-name diner records (CR-089 probe). CRM is in the middle of a data-quality batch (DQ-1) whose whole purpose is to stop junk records from being created.

**Ask (P2, no API change needed):** move the `skip-otp` call from *Browse Menu* to *Place Order* (after the Review screen, with the final phone + name), and use the **read-only `POST /scan/auth/lookup`** (`{exists, name}`, no token, no record created) for the "Welcome back, Alok" greeting on the landing page — exactly as agreed in INV-022 B1. Then: one `skip-otp` per real order, `PUT /scan/profile` only when the name was edited or blank, and no abandoned records on phone change. If the menu-browsing experience needs a token earlier (e.g. to show personal points), say so and we will discuss a lighter path.

---

## 4. Summary table (brief format)

| # | Need | **Actual endpoint** | Status |
|---|---|---|---|
| 0 | Set name at first login | `skip-otp` **ignores `name`** → `PUT /scan/profile { name }` right after | ⚠️ brief assumption wrong — must be handled on **every** new customer |
| 1 | Update name after creation | **`PUT /scan/profile`** · Bearer customer token · `{ "name": "John" }` → `200 {success:true}` | ✅ exists, live |
| 2 | Re-auth with different phone | **`POST /scan/auth/skip-otp`** again with the new phone (+ `country_code`) → new token; then `GET /scan/auth/me` for name/points/tier | ✅ works; limits 30/min/IP, 5/5 min/phone; discard old token |
| 3 | CRM ask back | call `skip-otp` at Place Order, `lookup` for greeting | 🟡 please confirm |

No CRM code change is required for 1 and 2. **Optional CRM follow-ups** (register as CRs only if the Customer App wants them): (a) accept `name` in `skip-otp` body (would make step 0 one call instead of two — ~6 lines, LOW risk); (b) `skip-otp` honour `is_blocked`; (c) validate `name` in `PUT /scan/profile` (trim, 1–100 chars). Not started; owner decision.

---

## 5. Plain-English version for the owner (read this aloud first)

**What the Customer App team asked.** When a diner uses Scan & Order for the first time they type their phone and name, browse the menu, and on the final "Review Order" screen they can still edit both. The app team asked two things: (1) if the diner fixes a typo in their name ("Jon" → "John"), how do they tell the CRM? (2) if the diner changes the phone number, can they simply log in again with the new number?

**What we found by reading the code (nothing was changed).**

1. **Their starting assumption is wrong.** They believe they can send the diner's name together with the phone at login (`skip-otp`) and that the CRM stores it. It doesn't — the login call only reads phone, restaurant and country code; a `name` field is silently thrown away. Every brand-new diner is therefore created with an **empty name**. This means the name problem is not an edge case for them — it affects **every first-time diner**, and they must fix it in their flow.

2. **The name can be updated — the endpoint already exists.** `PUT /scan/profile` with the diner's login token and `{ "name": "John" }`. That is the one they should call right after login for new diners, and again if the diner corrects the name on the Review screen. Small caution: the CRM accepts an empty name too, so the app must not send blanks. Also: the order itself will *not* correct the name — when the bill arrives from the POS the CRM never overwrites an existing customer's name.

3. **Changing the phone works the way they hope.** Calling login again with the new number gives a new token for whoever owns that number: a brand-new record if the number is new (again with empty name → they must call the profile update), or the existing diner's record if the number is known (name, points and tier are then fetched with `GET /scan/auth/me`). Limits: max 5 logins per phone per 5 minutes and 30 per minute per Wi-Fi network; invalid numbers are rejected; the old token stays valid for 24 hours so the app must throw it away.

4. **One thing we should ask them to change.** Because they log the diner in the moment they press "Browse Menu", every phone number ever typed — including wrong ones — becomes a permanent CRM customer with no name and no orders. That is exactly the kind of junk our data-quality batch is trying to stop. We should ask them to log in at **"Place Order"** instead, and use the read-only "does this number exist?" lookup for the welcome greeting (which they already agreed to earlier).

5. **Small CRM gaps noticed on the way** (not theirs to fix, our backlog, not registered yet): login ignores the "blocked customer" flag; the profile update doesn't validate the name; and we *could* accept the name at login in ~6 lines if the owner wants to make life easier for them.

**Decision needed from the owner:** send the reply (§0–§4) as-is? And do you want any of the three small CRM follow-ups registered as CRs?

---

```text
Investigation complete: INV-023 Customer App brief 2026-10-11 (name correction / phone change)
Findings: (F1) skip-otp does NOT accept `name` — brief's "confirmed supported" is wrong; new diners get name "" · (F2) name update endpoint exists: PUT /scan/profile {name}, Bearer customer token; no PATCH /scan/auth/me · (F3) repeat skip-otp with a new phone works (stateless find-or-create); profile via GET /scan/auth/me · (F4) limits 30/60s per IP, 5/300s per phone+restaurant; JWT 24 h, no revocation · (F5) POS order path never updates an existing customer's name · (F6) skip-otp ignores is_blocked/phone_invalid (CRM backlog) · (F7) skip-otp-at-Browse-Menu creates an abandoned record on every phone change (DQ ask back)
Code changed: NONE · Data written: NONE · Testing agent: N/A (no fix applied — investigation only)
Candidate CRs (not registered): accept `name` in skip-otp · is_blocked check in skip-otp · name validation in PUT /scan/profile
Docs: investigations/INV_023_CRM_REPLY_CUSTOMER_APP_NAME_PHONE_EDGE_CASES_2026_10_11.md
Next: owner approves reply → send §0–§4 to Customer App · owner decides whether to register the 3 candidate CRs (Intake)
```
