# CR-2026-05-30-001 — Item 1 Implementation Plan (No Edits)

| Field | Value |
|---|---|
| Date | 2026-05-30 |
| Mode | Planning only — **NO CODE / CONFIG EDITS** in this session |
| Owner-confirmed interpretation | **A** — wire up the existing five `otpRequired*` toggles. No new boolean. |
| Owner-confirmed default semantic | **OTP page IS shown by default.** Admin must explicitly turn a flag ON (= toggle the "OTP Required" admin row OFF) to skip. |
| 716 in scope? | **YES** — Item 1 applies to 716 too (only items 2 & 3 carve 716 out) |
| Pre-implementation gate | **`integration_playbook_expert_v2` MUST be consulted before any code is written** — this CR modifies an authentication flow (OTP / CRM skip-token) |

---

## 1. Decision summary (from owner Q&A)

| Q | Owner answer | Implication |
|---|---|---|
| 1 — which page | `/<rid>/password-setup` | This is the only screen affected. Landing page name/phone capture remains as today (governed separately by `mandatoryCustomerName/Phone`). |
| 2 — flag location | New flag(s) in `customer_app_config` (per-restaurant) | We **reuse** the five existing dead toggles — no schema additions. |
| 3 — granularity | Per-mode | The five toggles map 1:1 to: dine-in, takeaway, dine-in-with-table, walk-in, room |
| 4 — UX when skipped | Capture name/phone on landing (governed by separate mandatory flag), skip `/password-setup`, go straight to menu | Landing flow is unchanged; only the unconditional `navigate('/password-setup', …)` after `check-customer` becomes conditional. |
| 5 — identity when skipped | `crmSkipOtp(phone, restaurantId)` — attach to a real CRM customer record | Order is NOT anonymous; loyalty/repeat-customer features stay intact. |
| 6 — default | Current behaviour preserved — OTP page shown unless admin explicitly opts in | Runtime treats missing/null/undefined as "OTP required" |
| 7 — 716 | Honour the flag like everyone else | No 716 carve-out for Item 1 |

---

## 2. Naming and semantic contract

We are NOT adding new fields. We reuse:

| Toggle (DB / UI label as it appears today) | Order modes it gates | Today's runtime usage |
|---|---|---|
| `otpRequiredDineIn` ("OTP Required for Dine-In Orders") | `scannedOrderType === 'dinein'` AND not a scanned table (i.e. walk-in dine-in) | none (dead) |
| `otpRequiredDineInWithTable` ("OTP Required for Dine-In with Table Number") | `scannedOrderType === 'dinein'` AND a real `scannedTableId` AND `scannedRoomOrTable === 'table'` | none (dead) |
| `otpRequiredRoomOrders` ("OTP Required for Room Orders") | `scannedRoomOrTable === 'room'` (incl. 716) | none (dead) |
| `otpRequiredTakeaway` ("OTP Required for Takeaway Orders") | `scannedOrderType === 'takeaway'` or selected mode = takeaway | none (dead) |
| `otpRequiredWalkIn` ("OTP Required for Walk-In Dine Orders") | `roomOrTable === 'walkin'` from URL param | none (dead) |

**Semantic** (existing UI label is "OTP Required for …", so we keep it natural):

```text
otpRequired<Mode> === true                    →  OTP page IS shown   (admin opted IN to requiring)
otpRequired<Mode> === false                   →  OTP page is SKIPPED (admin opted OUT)
otpRequired<Mode> === undefined / null / NaN  →  OTP page IS shown   (preserves current behaviour for restaurants
                                                                       whose customer_app_config doc has no field)
```

The runtime helper will be a single boolean:

```text
shouldShowOtpPage(mode, config) := config[`otpRequired${ModeKey}`] !== false
```

This expression returns `true` for `true`, `undefined`, `null`, missing — and only `false` when the admin has explicitly saved `false`. ✅ matches the owner default.

---

## 3. Mode-to-flag mapping (single source of truth)

Resolved at `LandingPage.jsx` (where we already know `selectedMode`, `scannedOrderType`, `scannedRoomOrTable`, `scannedTableId`).

```text
function pickOtpFlag({ selectedMode, scannedOrderType, scannedRoomOrTable, scannedTableId }):

  if scannedRoomOrTable === 'room':
      return 'otpRequiredRoomOrders'             # covers 716 and any room-QR restaurant

  if scannedRoomOrTable === 'walkin':
      return 'otpRequiredWalkIn'

  if scannedOrderType === 'takeaway' or selectedMode === 'takeaway':
      return 'otpRequiredTakeaway'

  if scannedOrderType === 'delivery' or selectedMode === 'delivery':
      # NB: no `otpRequiredDelivery` exists today. See §6 "open issue D".
      return 'otpRequiredTakeaway'                # tentative — pending owner confirmation

  if scannedOrderType === 'dinein' and hasAssignedTable(scannedTableId)
                                   and scannedRoomOrTable === 'table':
      return 'otpRequiredDineInWithTable'

  # walk-in dine-in (no table id) / legacy direct URL
  return 'otpRequiredDineIn'
```

> **Open issue D — see §6.** Delivery currently has no dedicated toggle.

---

## 4. Files touched by the planned change

All **read-only inspections** so far. Below is the *prospective* edit map **for owner approval** — no edits made.

| # | File | Lines | Change |
|---|---|---|---|
| 1 | `frontend/src/pages/LandingPage.jsx` | ~487-520 (the existing `navigate('/<rid>/password-setup', ...)` block at L495 and L508) | Wrap the navigate calls in `if (shouldShowOtpPage(...))`. When false → call `crmSkipOtp(phone, userId)` instead, then `setCrmAuth(token, customerProfile, restaurantId)` (the same hook used by `PasswordSetup.handleSkip` at L65-82), then `navigateToMenu()`. |
| 2 | `frontend/src/pages/LandingPage.jsx` | top of file imports | Add `import { crmSkipOtp, buildUserId } from '../api/services/crmService';` (already imported in `PasswordSetup.jsx:5` — same module) |
| 3 | `frontend/src/utils/orderTypeHelpers.js` (or new file `frontend/src/utils/otpPolicy.js`) | new module | Add `pickOtpFlag(...)` and `shouldShowOtpPage(...)` pure helpers. Single source of truth. |
| 4 | `frontend/src/context/RestaurantConfigContext.jsx` | L96-100 + L446-450 | **No change** — defaults stay `false`. The runtime helper uses `!== false`, so the absence-of-field semantic is correctly preserved without flipping the JSON defaults. |
| 5 | `frontend/src/components/AdminSettings/VisibilityTab.jsx` | L131-135 | **No change** — toggles already render. Optional: add a small "Default: OTP required" hint under the section title. |
| 6 | `backend/server.py` | L203-218 (Pydantic config model) | **No change** — the five `otpRequired*` fields are already part of the dict pass-through. `otpRequiredWalkIn` is the only one explicitly modelled (L213, L1069); the other four flow through the generic config dict. Persistence already works (admin save → DB → fetch on next load). |

Total surface: **3 source files** (`LandingPage.jsx`, new `otpPolicy.js`, optional `VisibilityTab.jsx` hint). Zero backend code changes. Zero DB migration.

---

## 5. End-to-end runtime flow (after the change, owner-confirmed)

```text
A. Customer scans QR (or arrives via direct URL).

B. Landing page renders. If `configShowLandingCustomerCapture` is on,
   we ask for name/phone (mandatory-ness ruled by `mandatoryCustomerName`
   and `mandatoryCustomerPhone` — UNCHANGED).

C. Customer types name + phone (or skips, per Item-1-separate-flag).
   Hits "Browse Menu".

D. LandingPage.jsx (line ~440 region):
   - Existing validation runs unchanged (mandatory fields).
   - POST /api/auth/check-customer — unchanged.
   - NEW: const flagName = pickOtpFlag({...});  // §3
   - NEW: const showOtp = shouldShowOtpPage(flagName, config);  // §2
   - if (showOtp):
        navigate(`/${rid}/password-setup`, {...})  // today's path, untouched
   - else (skipping):
        try:
            const data = await crmSkipOtp(phone, buildUserId(rid));  // §6.3 below
            if (data?.token):
                setCrmAuth(data.token, { name, phone, ...data.customer }, rid);
                // sets crmToken in AuthContext exactly like PasswordSetup.handleSkip does
            navigateToMenu();   // same helper used by PasswordSetup
        catch:
            // FALLBACK: if crmSkipOtp fails, fall through to /password-setup
            // (preserves identity capture path; never strands the user)
            navigate(`/${rid}/password-setup`, {...});

E. Menu / Cart / ReviewOrder / OrderSuccess — all unchanged. The order
   payload carries cust_name/cust_phone exactly as today, plus the
   CRM token from setCrmAuth (which is read by any feature that needs
   a logged-in customer context — e.g. delivery address book).
```

### Visual contrast

| Scenario | Today | After change |
|---|---|---|
| All five flags absent (every existing restaurant today) | Password-setup screen always shown when phone captured | **Same** — password-setup shown |
| `otpRequiredDineIn=false`, customer scans table QR for dine-in with table → mapped to `otpRequiredDineInWithTable` (still absent → defaults to required) | Password-setup shown | **Same** — the `DineIn` flag is not the matching one for this mode |
| `otpRequiredDineInWithTable=false`, same scenario as above | Password-setup shown | **Skipped** — direct to menu, identity attached via `crmSkipOtp` |
| `otpRequiredTakeaway=false`, customer chooses takeaway mode | Password-setup shown | **Skipped** |
| Customer leaves phone blank (mandatory phone toggle is OFF) | Today: bypass entire customer-capture branch, straight to menu (L524-542 — no /password-setup). | **Same.** No regression — we only short-circuit *when phone is captured*, otherwise today's "no-phone → straight to menu" path is unchanged. |

> No edit changes any existing customer's experience until an admin actively flips a toggle to OFF. **Default = current behaviour preserved across all restaurants, including 716.**

---

## 6. Open issues / design decisions still requiring owner input

### D1. Delivery mode has no dedicated `otpRequiredDelivery` flag.
Today: delivery is forced through `effectiveMandatory*=true` (LandingPage L738-739) and the unconditional `/password-setup` navigation. After the change, do we want:
  - **a)** Delivery always requires OTP (hardcoded — no toggle). Same as today.
  - **b)** Delivery uses `otpRequiredTakeaway` (the closest cousin) — owner default in my plan.
  - **c)** Add a new sixth flag `otpRequiredDelivery`.

### D2. `LandingPage.jsx:738-739` — `effectiveMandatory*` forces both fields mandatory when `isTakeawayDeliveryMode`.
If we want to truly relax these for takeaway when `mandatoryCustomerName/Phone=false`, we have to touch L738-739 too. Otherwise the toggle is overridden for takeaway/delivery.
  - **a)** Leave as-is. Mandatoriness for takeaway/delivery stays forced. (Recommended default)
  - **b)** Make L738-739 honour the config too. Separate sub-CR; not part of Item 1 OTP-skip work.

### D3. `crmSkipOtp` failure semantics.
If the CRM "skip-otp" endpoint returns 4xx/5xx (CRM down, restaurant_id misconfigured, phone rejected):
  - **a)** Fall through to `/password-setup` (my default — never strand the user)
  - **b)** Show toast "Could not continue" and stay on landing (matches `PasswordSetup.handleSkip` behaviour at L75-78)
  - **c)** Place order as a true guest (no token) — most permissive
  - **d)** Block the user with a hard error

### D4. Empty phone + OTP-skip ON.
If the admin has both `mandatoryCustomerPhone=false` AND `otpRequiredDineIn=false`, the customer can reach the menu with **no phone** at all. Today's path already handles this (L524-542 → straight to menu). The skip path I propose would only fire when phone IS captured (because `crmSkipOtp` needs a phone). The "no phone" branch stays untouched.
  - Confirm this is acceptable, OR
  - Owner wants name-only / phone-omitted flow handled differently.

### D5. Edit Order path.
"Edit Order" from OrderSuccess re-enters Menu → ReviewOrder. It does NOT touch the password-setup screen. So the OTP-skip change has **no effect** on edit flows. Confirm OK.

### D6. Authenticated customers (returning users with a valid CRM token from a prior session).
Already short-circuited at LandingPage L442 (`!isAuthenticated && (configShowLandingCustomerCapture || isTakeawayDeliveryMode)`). The OTP-skip change is gated inside the same `!isAuthenticated` block, so logged-in users **never** see the password-setup screen and **never** trigger `crmSkipOtp`. No regression.

---

## 7. Test surface (for the future testing-agent run — NOT executed here)

### Manual scenarios
1. **Default behaviour preserved** — fresh restaurant, no flags saved, customer scans table QR with phone-mandatory: `/password-setup` appears (current behaviour).
2. **Skip works (dine-in-with-table)** — admin toggles `otpRequiredDineInWithTable=false` in VisibilityTab → saves → customer scans table QR with phone → tapped Browse Menu → lands directly on menu, NOT on password-setup. Order payload carries `cust_name` + `cust_phone` and is attached to a CRM customer (verify `crmSkipOtp` was called).
3. **Skip works (takeaway)** — admin toggles `otpRequiredTakeaway=false` → customer selects Takeaway → enters name+phone → goes to menu.
4. **Skip works (room)** — admin toggles `otpRequiredRoomOrders=false` → room QR scan → menu directly.
5. **Skip works (walk-in dine-in)** — admin toggles `otpRequiredDineIn=false` → direct URL with no QR scan → menu directly.
6. **Skip works (walk-in)** — admin toggles `otpRequiredWalkIn=false` → QR with `type=walkin` → menu directly.
7. **Mode + flag mismatch is ignored** — admin toggles ONLY `otpRequiredDineIn=false`, customer scans table QR (mode = DineInWithTable) → `/password-setup` still appears (because the matching flag, `otpRequiredDineInWithTable`, is still defaulted to required).
8. **No phone captured (mandatory off + skip on)** — admin sets `mandatoryCustomerPhone=false` AND `otpRequiredDineIn=false` → customer leaves phone blank → goes straight to menu (today's "no-phone → menu" branch). Order payload `cust_name=''`, `cust_phone=''`. No `crmSkipOtp` call.
9. **CRM down** — mock 503 on `crmSkipOtp` → customer falls through to `/password-setup` (per D3-a).
10. **Authenticated user** — already-logged-in customer with valid CRM token → no change, never hits `crmSkipOtp` regardless of flags.
11. **Restaurant 716** — toggle `otpRequiredRoomOrders=false` for 716 → room scan → goes to menu directly. (Confirms 716 is included per owner answer 7.)
12. **No regression in Item 2 / 3 paths** — table-id / room-id propagation remains identical. We only short-circuit the screen between Landing and Menu; ReviewOrder payload builders are untouched.

### Regression guard (must remain unchanged)
- Cart totals, taxes, service charge, delivery charge, GST math
- Razorpay flow
- KOT / print payloads
- Edit-order flow
- Loyalty redemption (depends on CRM customer attachment — `crmSkipOtp` returns a real customer record, so this should be preserved)
- Item 2 (`table_id` propagation) and Item 3 (room context) — completely orthogonal

---

## 8. Pre-implementation gate — **integration_playbook_expert_v2 MUST be consulted**

Per the platform's hard rule:

> *"When the task involves implementing or modifying ANY authentication (login, registration, password hashing, JWT, admin seeding, brute force, password reset), you MUST call `integration_playbook_expert_v2` BEFORE writing any auth code."*

This CR modifies an **authentication flow**: we're changing **when** OTP verification is bypassed and **how** an authenticated CRM session is created via `crmSkipOtp`. Before any code edit, I will call the integration playbook expert with the request:

> *"CRM customer-app OTP/auth flow change: conditionally bypass OTP via `crmSkipOtp` (existing v2 endpoint `POST /scan/auth/skip-otp`) based on per-restaurant config. Need playbook confirming: payload contract, expected response shape, token storage, failure modes, rate limits, and whether the existing `crmSkipOtp` helper is the right entry point or if a new CRM-side endpoint is needed."*

No code is written until that response is in hand.

---

## 9. Summary — what I am asking the owner to confirm before I implement

1. **D1**: delivery mode → use `otpRequiredTakeaway`, or add `otpRequiredDelivery`, or always require? (My default: reuse `otpRequiredTakeaway` for now.)
2. **D2**: leave `LandingPage:738-739` mandatory-override for takeaway/delivery as-is? (My default: yes — leave it. Separate sub-CR if you want it changed.)
3. **D3**: on `crmSkipOtp` failure, fall through to `/password-setup`? (My default: yes.)
4. **D4**: empty-phone + skip-on → today's "no-phone → menu" path stays unchanged? (My default: yes.)
5. **D5**: Edit Order is unaffected? (My default: yes.)
6. **D6**: authenticated users unaffected? (My default: yes.)
7. Authorisation to call `integration_playbook_expert_v2` and **then** proceed to a single implementation pass (Phase A: helper + LandingPage gate + tests).

> **No code edited. No config edited. Awaiting owner direction on D1–D7.**
