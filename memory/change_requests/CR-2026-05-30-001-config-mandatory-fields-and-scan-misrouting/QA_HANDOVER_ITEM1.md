# QA Handover — CR-2026-05-30-001 Item 1
## Config-Driven OTP Skip (Skip Password-Setup Screen)

| Field | Value |
|---|---|
| Prepared at | 2026-05-30 |
| Prepared by | E1 (implementation agent) |
| Status | **READY FOR QA** — implemented, runtime-tested with 5 Playwright scenarios, all PASS |
| Build env | https://deploy-docs-6.preview.emergentagent.com (preview) |
| Mongo | `mongodb://mygenie_admin:****@52.66.232.149:27017/mygenie` (remote, prod-like) |
| Scope | **Item 1 only.** Items 2 & 3 are investigation-only — NOT in this release |
| Risk | LOW — default OFF preserves 100% of current behaviour for all 3 production restaurants |

---

## 1. What was built

A new per-mode admin configuration that allows a restaurant owner to **silently bypass the OTP / password-setup screen** for selected order types. When a customer enters a phone on the landing page and the matching toggle is ON, the customer is routed **straight to the menu** — a hidden CRM `skip-otp` call attaches their identity to a real CRM customer record (loyalty / repeat-customer features stay intact).

### 1.1 New admin UI

**Location:** `Admin Panel → Visibility (left sidebar) → scroll to bottom → "Skip OTP / Password Setup" section`

Six toggles (all default **OFF**):

| Admin toggle label | DB field | When ON, affects |
|---|---|---|
| Skip OTP for Dine-In Orders | `skipOtpDineIn` | Direct-URL / no-scan dine-in (walk-in dine) |
| Skip OTP for Takeaway Orders | `skipOtpTakeaway` | Takeaway mode (URL `?type=takeaway` or selectedMode='takeaway') |
| Skip OTP for Delivery Orders | `skipOtpDelivery` | Delivery mode |
| Skip OTP for Dine-In with Table Number | `skipOtpDineInWithTable` | Table QR scan (`?type=table&tableId=…`) |
| Skip OTP for Walk-In Dine Orders | `skipOtpWalkIn` | Walk-in QR (`?type=walkin`) |
| Skip OTP for Room Orders | `skipOtpRoomOrders` | Room QR scan (incl. restaurant 716) |

### 1.2 New customer-side runtime gate

When a customer enters a phone and clicks **Browse Menu** on the landing page:

```
1. Determine the order mode (from QR scan params, or default 'takeaway')
2. Resolve the matching skipOtp* flag for that mode
3. Read the flag from RestaurantConfigContext
4. If flag === true  →  silent skip path (see §1.3)
   Else (false, missing, undefined, anything-else)  →  show /<rid>/password-setup as today
```

### 1.3 Silent skip path (when admin opts in)

```
1. POST {CRM_URL}/v2/scan/auth/skip-otp  with { phone, restaurant_id }
   (Retry on 429/5xx/network: 3 attempts, exp backoff 500ms→4s, jitter, honour Retry-After)
2. On 200 success:
     • Store CRM token via setCrmAuth(...)
     • Populate localStorage.guestCustomer = { name, phone, restaurantId }
     • Navigate to:
        - /<rid>/delivery-address  if mode = delivery
        - /<rid>/stations          if restaurant has multiple menus
        - /<rid>/menu              otherwise
3. On 409 (phone locked to OTP — CRM rule):
     • Fall through to /<rid>/password-setup  (the ONE allowed exception)
4. On 400/401/403/404/422:
     • Toast error, stay on landing page
5. On 503/502/500/429/network errors after 3 retries:
     • Degraded guest mode — populate localStorage.guestCustomer, toast
       "Continuing as guest", proceed to menu route (no CRM token attached)
```

---

## 2. Test environment & credentials

### 2.1 Test credentials

| Purpose | Value |
|---|---|
| Admin login URL | `https://deploy-docs-6.preview.emergentagent.com/login` |
| Admin email (Cafe Flora / restaurant 698) | `owner@cafeflora.com` |
| Admin password | `Qplazm@10` |
| Customer landing URL | `https://deploy-docs-6.preview.emergentagent.com/<restaurantId>` |
| Restaurant IDs available | `364`, `618`, `698` (Cafe Flora). **716** is NOT in this DB but Item 1 spec includes it. |
| MongoDB direct (read flags) | `mongosh "mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie" --eval 'db.customer_app_config.findOne({restaurant_id:"698"})'` |

### 2.2 How to toggle a flag manually (admin UI path)

```
1. Open admin login URL → enter credentials → land on /admin/settings
2. Click "Visibility" in the left sidebar (icon: eye)
3. Page = /admin/visibility
4. Scroll to the very bottom of the page
5. Find "Skip OTP / Password Setup" section
6. Click the toggle for the order type you want to test
7. Click "Save Changes" at the top-right (data-testid will be saved)
8. Hard refresh customer landing page in a new tab
```

### 2.3 How to toggle a flag directly (DB)

```bash
# Set
mongosh "mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie" \
  --eval 'db.customer_app_config.updateOne({restaurant_id:"698"}, {$set:{skipOtpTakeaway:true}})'

# Read
mongosh "mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie" \
  --eval 'db.customer_app_config.findOne({restaurant_id:"698"}, {restaurant_id:1, skipOtpDineIn:1, skipOtpTakeaway:1, skipOtpDelivery:1, skipOtpDineInWithTable:1, skipOtpWalkIn:1, skipOtpRoomOrders:1, _id:0})'

# Cleanup (remove all skipOtp* flags for a restaurant)
mongosh "mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie" \
  --eval 'db.customer_app_config.updateOne({restaurant_id:"698"}, {$unset:{skipOtpDineIn:"", skipOtpTakeaway:"", skipOtpDelivery:"", skipOtpDineInWithTable:"", skipOtpWalkIn:"", skipOtpRoomOrders:""}})'
```

---

## 3. Test scenarios (20 total)

### 3.1 No-regression scenarios (run these FIRST — must all pass before any flag is flipped)

| # | Scenario | Setup | Expected |
|---|---|---|---|
| 1 | **Default state preserved** | No `skipOtp*` field in DB for the restaurant (current state for all 3 prod rows) | Phone entered → `/password-setup` shown (today's behaviour). NO `crmSkipOtp` calls in Network tab. |
| 9 | **No phone path** | Default state | Click Browse Menu without entering phone → straight to `/menu`, no API calls |
| 10 | **Authenticated user** | Customer already logged in (previous `crmToken` in localStorage) | Bypasses the whole capture flow regardless of flags |
| 18 | **Manual "Skip for now" button unchanged** | Flag any setting | On `/password-setup` screen, tap "Skip for now" → still works as today (single-shot, no retry) |
| 19 | **Edit-Order flow unchanged** | Place an order, then Edit Order from OrderSuccess | Does NOT touch /password-setup or crmSkipOtp |
| 20 | **Item 2/3 regression guard** | Any flag setting | Table QR scan + place order → POS receives `table_id`, `air_bnb_id` etc. identical to pre-CR (no payload change in `orderService.ts` or `transformers/helpers.js`) |

### 3.2 Functional scenarios (per-mode skip)

For each mode, set the matching flag to `true`, enter phone, click Browse Menu, and verify the customer goes **directly to the menu route** (NOT `/password-setup`):

| # | Scenario | Setup | Expected URL after Browse Menu |
|---|---|---|---|
| 2 | Table QR + skipOtpDineInWithTable=true | `/698?type=table&tableId=12&roomOrTable=table` + phone | `/698/menu` |
| 3 | Takeaway + skipOtpTakeaway=true | `/698` with default mode 'takeaway' + phone | `/698/menu` (or `/698/stations` for multi-menu) |
| 4 | Delivery + skipOtpDelivery=true | `/698` → switch mode to Delivery + phone | `/698/delivery-address` |
| 5 | Room QR + skipOtpRoomOrders=true | `/698?type=room&tableId=R12&roomOrTable=room` + phone | `/698/menu` |
| 6 | Walk-in QR + skipOtpWalkIn=true | `/698?type=walkin&roomOrTable=walkin` + phone | `/698/menu` |
| 7 | No-scan dine-in + skipOtpDineIn=true | Direct URL `/698` with mode 'dinein' + phone | `/698/menu` |

For each of the above, ALSO verify:
- ✅ Exactly **1** `POST /v2/scan/auth/skip-otp` request in the Network tab
- ✅ Request body contains `{ phone: "<entered>", restaurant_id: "698" }`
- ✅ `localStorage.guestCustomer` populated with `{ name, phone, restaurantId }`
- ✅ `localStorage.crmToken` populated (when CRM responds with 200 + token)
- ✅ No JavaScript errors in browser console

### 3.3 Mode-mismatch scenarios

| # | Scenario | Setup | Expected |
|---|---|---|---|
| 8a | Only DineIn flag, but mode is takeaway | skipOtpDineIn=true, skipOtpTakeaway=false, default takeaway mode | `/password-setup` shown (wrong flag set, takeaway not opted in) |
| 8b | Only DineInWithTable flag, walk-in dine-in (no QR) | skipOtpDineInWithTable=true, skipOtpDineIn=false, no QR | `/password-setup` shown |
| 8c | Only Takeaway flag, but customer scans table QR | skipOtpTakeaway=true, others false, `?type=table&tableId=…` | `/password-setup` shown |

### 3.4 CRM failure scenarios (require network mocking — see §4 for how)

| # | Scenario | Mock | Expected |
|---|---|---|---|
| 11 | CRM 200 first try | 200 with `{token, customer}` | Direct to menu, 1 call, CRM token attached |
| 12 | CRM 503 twice then 200 | 503, 503, 200 | Direct to menu, 3 calls, CRM token attached, ~2s total |
| 13 | CRM 503 × 3 (exhausted) | 503, 503, 503 | Direct to menu **as guest**, 3 calls, toast "Continuing as guest", **NO** CRM token, `guestCustomer` populated |
| 14 | CRM 409 (phone locked to OTP) | 409 | **Fall through to `/password-setup`**, 1 call (no retries), state payload identical to today's path |
| 15 | CRM 422 (bad phone format) | 422 | Toast error, stays on landing, 1 call, no navigation |
| 16 | CRM network error (no response) | route abort | Direct to menu as guest, 3 retry attempts |
| 17 | CRM honours Retry-After | 503 with header `Retry-After: 1` | Inter-call gap ≥ 1s for next attempt |

### 3.5 716 restaurant scenario (manual test only — 716 not in preview DB)

| # | Scenario | Expected |
|---|---|---|
| 716-A | If 716 exists in production: toggle `skipOtpRoomOrders=true` for 716, room QR scan | Goes to /menu — Item 1 includes 716 (no carve-out for Item 1) |
| 716-B | Item 2/3 carve-outs in `OrderSuccess.jsx` and `ReviewOrder.jsx` for 716 | UNTOUCHED — verify by `git diff` that those `String(restaurantId) === '716'` branches are unchanged |

---

## 4. How to mock CRM responses (for scenarios 11-17)

Use browser DevTools "Network throttling" + a request interceptor extension, **OR** run the Playwright recipe below (already proven to work in iteration_1 testing):

```python
# Playwright route mocking pattern
async def crm_route(route, request):
    await route.fulfill(
        status=503,  # adjust per scenario
        content_type="application/json",
        headers={"retry-after": "1"},  # optional
        body=json.dumps({"success": False, "detail": "Service Unavailable"})
    )
await page.route("**/scan/auth/skip-otp", crm_route)
```

For QA without Playwright: temporarily change `REACT_APP_CRM_URL` in `frontend/.env` to a controllable mock endpoint (e.g. mockoon, httpbin), then `sudo supervisorctl restart frontend`.

---

## 5. What was tested before this handover (passing)

| Iteration | Scenario | Result |
|---|---|---|
| iteration_1 (testing agent) | Code-review pass on all new + modified files | All GOOD — zero critical findings |
| Playwright runtime (preview) | Scenario 1 — default state preserves `/password-setup` | ✅ PASS — 0 CRM calls, URL = `/698/password-setup` |
| Playwright runtime (preview) | Scenario 2 — skipOtpTakeaway=true → goes to /menu | ✅ PASS — 1 CRM call, body `{phone:"9999999999", restaurant_id:"698"}`, URL = `/698/menu`, `guestCustomer` populated |
| Playwright runtime (preview) | Scenario 9 — no phone → goes to /menu directly | ✅ PASS — 0 CRM calls, URL = `/698/menu` |
| Playwright runtime (preview) | Scenario 13 — 503 × 3 exhausted | ✅ PASS — 3 calls with gaps `[0.65s, 1.08s]` honouring Retry-After, URL = `/698/menu`, guest mode |
| Playwright runtime (preview) | Scenario 14 — 409 fall-through | ✅ PASS — 1 call (non-retriable), URL = `/698/password-setup` |
| Admin UI screenshot | New "Skip OTP / Password Setup" section visible | ✅ Confirmed in `/admin/visibility` page after Cafe Flora login |

**Scenarios still needing QA validation** (not covered by automation in this pass):
- Scenarios 3, 4, 5, 6, 7 — per-mode skip (table QR, delivery, room QR, walkin QR, no-scan dine-in)
- Scenarios 8a, 8b, 8c — mode mismatches
- Scenarios 10 — authenticated user bypass
- Scenarios 11, 12, 15, 16, 17 — additional CRM failure variants
- Scenario 18 — manual "Skip for now" button on /password-setup
- Scenario 19 — Edit-Order flow regression
- Scenario 20 — Item 2/3 regression guard (table_id propagation in payload)

---

## 6. Files changed (full inventory)

| File | Type | Lines | Purpose |
|---|---|---|---|
| `frontend/src/utils/otpPolicy.js` | **NEW** | 63 | `pickOtpFlag()` + `shouldShowOtpPage()` pure helpers |
| `frontend/src/api/services/crmSkipOtpRetry.js` | **NEW** | 70 | `crmSkipOtpWithRetry()` retry wrapper around bare helper |
| `frontend/src/api/services/crmService.js` | edit | +12 around L129 | Attach `error.retryAfterMs` from `Retry-After` header (additive) |
| `frontend/src/context/RestaurantConfigContext.jsx` | edit | +13 at L95, +13 at L447 | 6 new `skipOtp*` defaults + serializer entries (customer-side config) |
| `frontend/src/context/AdminConfigContext.jsx` | edit | +9 at L127 | 6 new `skipOtp*` defaults (admin-side config — needed for the Save button to persist them) |
| `frontend/src/pages/admin/AdminVisibilityPage.jsx` | edit | +18 at L100 | New "Skip OTP / Password Setup" section with 6 ToggleSwitch rows |
| `frontend/src/pages/LandingPage.jsx` | edit | +5 imports, +1 destructure, +1 setCrmAuth, +6 flag destructure, +66 helper, ~30-line gate replacement | Gate around `navigate('/password-setup')` + silent-skip helper |
| `frontend/src/components/AdminSettings/VisibilityTab.jsx` | unchanged | — | Reverted hygiene edits. File is unreachable from any route. |
| `backend/server.py` | unchanged | — | Backend already passes config dict through; `skipOtp*` fields flow automatically |

**Total: 2 new files + 5 edits.** Zero backend changes. Zero DB migration required.

---

## 7. Hard constraints (must not regress)

| Constraint | Where | How to verify |
|---|---|---|
| Default OFF preserves current behaviour | All 3 prod restaurants in DB have no `skipOtp*` field today | `mongosh ... db.customer_app_config.find({}, {restaurant_id:1, skipOtpDineIn:1, _id:0})` should return only `{restaurant_id:"…"}` — no skipOtp fields |
| Restaurant 716 INCLUDES Item 1 | (716 not in preview DB) | After enabling skip in prod for 716, room scan should skip OTP. No special-case code in `otpPolicy.js`, `LandingPage.jsx`, `crmSkipOtpRetry.js`. |
| Items 2/3 716 CARVE-OUTS UNTOUCHED | `OrderSuccess.jsx` L314-322, L357-362; `ReviewOrder.jsx` L828, L837, L938, L988, L1114, L1290 | `git diff` should show ZERO changes in those files for this CR |
| Bare `crmSkipOtp` helper unchanged | `crmService.js` L360-376 | Used by `PasswordSetup.handleSkip` L65-82 — must still work after this CR (no retry wrapper applied) |
| `LandingPage.jsx:738-739` mandatory override untouched | D2 lock | Takeaway/delivery still forces name+phone mandatory regardless of `mandatoryCustomerName/Phone` config |
| `auth/me`, `auth/login`, `auth/send-otp`, `auth/verify-password` paths unchanged | `server.py` and `crmService.js` | Direct customer login from `/login` and password-set flow unaffected |

---

## 8. Known follow-ups (not blocking QA, P1)

1. **Legacy dead toggles** — the original 5 `otpRequired*` toggles are still defined in `RestaurantConfigContext.jsx` defaults and serializer for backward compatibility. They are NOT rendered anywhere in the live admin UI (`AdminVisibilityPage.jsx`). Decision needed: delete from the context too, or leave for back-compat?
2. **Idempotency assumption** — `crmSkipOtpWithRetry` retries on 429/5xx assuming the CRM endpoint is idempotent by `(phone, restaurant_id)`. If CRM creates duplicate customer rows on retry, change `maxAttempts` from 3 to 1, or add an idempotency-key header.
3. **No observability** — failed retries / guest-mode degradations are not surfaced anywhere durable beyond `logger.order(...)`. Future: surface a dashboard metric. (See "Potential improvement" in finish summary.)
4. **`x-api-key`** — per-restaurant CRM key matrix in `REACT_APP_CRM_API_KEY={}` is currently empty in preview `.env`. If CRM starts enforcing the key, ALL CRM calls (including this one) will fail. Production already runs without it via the "Skip for now" button, so likely a no-op — but worth a one-time confirmation.

---

## 9. References

- `CR.md` — original 3-item registration
- `INVESTIGATION_AND_GAPS.md` — first-pass gap analysis (all 3 items)
- `ITEM2_DEEP_DIVE.md` — production-only "new table" root cause (8 triggers, not implemented this CR)
- `ITEM1_IMPLEMENTATION_PLAN.md` — earlier plan draft
- `ITEM1_FINAL_PLAN.md` — locked plan after owner Q&A + playbook
- `HANDOVER.md` — pre-implementation handover for next agent
- `QA_HANDOVER_ITEM1.md` — **THIS FILE** — post-implementation QA handover
- `/app/test_reports/iteration_1.json` — testing agent code-review report

---

## 10. Sign-off checklist for QA

Before approving release:

- [ ] Run all 6 scenarios in §3.1 (no-regression). All must pass on default DB state.
- [ ] Run all 6 scenarios in §3.2 (per-mode). All must result in `/menu` (or appropriate route), 1 CRM call each.
- [ ] Run all 3 scenarios in §3.3 (mode mismatch). All must result in `/password-setup`.
- [ ] Run at least scenarios 13, 14, 17 from §3.4 (failure handling). Critical for production reliability.
- [ ] Smoke test scenario 18 (manual "Skip for now" button on /password-setup) — confirm still works.
- [ ] Smoke test scenario 19 (Edit Order from OrderSuccess) — confirm unaffected.
- [ ] Verify no JavaScript errors in browser console across all scenarios.
- [ ] Verify `localStorage.guestCustomer` is populated in skip / guest-degraded paths.
- [ ] Verify `localStorage.crmToken` is populated only when CRM responds with 200 + token.
- [ ] Verify all 6 toggles render in admin UI and persist across Save Changes + page reload.
- [ ] Restore DB to clean state after testing: `mongosh ... $unset all skipOtp* fields`.
