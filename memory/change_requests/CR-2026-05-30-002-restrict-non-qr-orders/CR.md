# CR-2026-05-30-002 — Restrict Non-QR Orders (Scan-Required Mode)

| Field | Value |
|---|---|
| CR ID | CR-2026-05-30-002 |
| Registered at (UTC) | 2026-05-30 |
| Locked at (UTC) | 2026-05-30 (Q1–Q10 answered by owner) |
| Registered by | E1 (on behalf of owner) |
| Parent context | Pulled out of CR-2026-05-30-001 Item 2 + URL-tampering brainstorm |
| Status | **IMPLEMENTED — all components shipped (3 new FE files + 6 FE edits + 1 BE endpoint). Status label updated 2026-06-17 after code verification.** |
| Action requested in this session | Registration + design lock. No code edits. |

---

## 1. Owner-stated scope (verbatim, lightly cleaned)

> We want to register a small CR that does a very simple thing — control whether non-QR orders are allowed.
> 1. Add a flag at restaurant level: are non-QR scanners allowed or not?
> 2. **Default = allowed** for all restaurants (backward-compatible).
> 3. Restaurants can turn it OFF.
> 4. When OFF, and the customer is NOT on a table, they must be asked to rescan at **multiple checkpoints** (landing + add-to-cart + place-order).
> 5. Restaurant **716 must NOT be disturbed** under this CR (carry-forward from parent CR).

---

## 2. Why this is a good de-scoping

This CR is essentially **F4 from `ITEM2_FIX_INVESTIGATION.md`** — the defence-in-depth guard — pulled out and shipped as a standalone admin policy. It does NOT attempt to fix the underlying Item 2 root cause (`ReviewOrder.jsx:982-985` ignoring `editOrder.tableId` from CartContext) — that remains parked. Instead, it adds a policy gate that lets a restaurant opt out of the "non-QR" path entirely, so the systemic bug becomes inaccessible to customers. Small surface (~50 LOC FE + ~30 LOC BE), fully reversible via the flag, **zero behaviour change Day 1** (default ON / allowed).

---

## 3. Locked semantics

| Aspect | Locked value |
|---|---|
| Flag name | `allowNonQrOrders` |
| Default value | `true` (allowed — current behaviour preserved) |
| Effect when `false` | Block customers who don't have a valid QR scan at 3 checkpoints |
| Effect when `true` / missing / null | No change — current behaviour for every restaurant |
| Admin UI | New section "Order Access Policy" in `Admin → Visibility` with single ToggleSwitch row "Allow Non-QR Orders" |
| Storage | `customer_app_config.allowNonQrOrders` (new boolean field) |
| Backend | One new diagnostic endpoint (see §6); no model change needed beyond the config dict |

### 3.1 "Non-QR" detection (locked)

```text
isNonQrOrder := !isScanned
              = scannedTableId is absent  AND
                scannedRoomOrTable NOT IN {'table', 'room', 'walkin'}
```

**Walk-in QR (`type=walkin`) IS a valid scan** — it's still a QR. NOT blocked.

### 3.2 Bypass conditions (locked — all owner-confirmed)

The guard does NOT fire when ANY of these is true:

| # | Condition | Why |
|---|---|---|
| B1 | `String(restaurantId) === '716'` | Hard CR-level carve-out |
| B2 | `selectedMode ∈ {'takeaway', 'delivery'}` OR `scannedOrderType ∈ {'takeaway', 'delivery'}` | Legitimate non-table modes; never expected a QR |
| B3 | `isEditMode === true` (from CartContext) | Order being edited was placed with a valid QR originally |
| B4 | `allowNonQrOrders === true` (or missing/null/undefined) | Restriction not enabled |

**The guard DOES fire for** authenticated returning customers (no bypass — login doesn't prove physical presence at table).

---

## 4. Checkpoints (locked — 3)

| # | Checkpoint | File:Location | When it fires |
|---|---|---|---|
| C1 | **Landing → Browse Menu** | `LandingPage.jsx` `handleDiningMenuClick` (or wherever Browse Menu is wired) | Before navigating to `/menu` |
| C2 | **Add-to-Cart (first item per session)** | wherever add-to-cart fires (likely `MenuItemCard.jsx` or `CartContext.addItem`) | First time `cart.length === 0` becomes `cart.length === 1`. Subsequent adds do not re-check. |
| C3 | **Place Order / Update Order** | `ReviewOrder.jsx` `handlePlaceOrder` near L820 | Right before the place/update API call |

When ANY checkpoint fires, run:

```
1. Clear cart  (CartContext.clearCart)
2. Show non-dismissable modal
   "Your session has expired. Please rescan the QR code at your table to continue."
   [OK, take me back]
3. On CTA tap → navigate('/<rid>')   (landing page)
4. Fire-and-forget POST /api/diagnostics/non-qr-block with the snapshot (§6)
```

---

## 5. UX (locked)

| Aspect | Locked |
|---|---|
| Component | Non-dismissable modal — no backdrop dismissal, no Escape-to-close |
| Title | "Session Expired" |
| Body | "Please rescan the QR code at your table to continue. Items in your cart will be cleared." |
| CTA | Single button "OK, Rescan" → routes to `/<rid>` landing |
| Cart behaviour | **Cleared on block** (before modal shows, so the customer sees an empty cart if they retry) |
| Toast fallback | None — modal only |

---

## 6. Telemetry (locked)

### 6.1 Endpoint

`POST /api/diagnostics/non-qr-block`
- Auth: none required (this is a client-generated diagnostic, not user-trusted)
- Body: JSON (see §6.3)
- Response: 204 No Content (fire-and-forget; FE doesn't block on it)

### 6.2 Storage

- **MongoDB capped collection** per restaurant: write to a single collection `non_qr_blocks` with `restaurant_id` index
- Capped to **200 documents PER RESTAURANT** (enforced by a `restaurant_id`-keyed rolling delete on insert, since native capped collections can't be partitioned per-key). Simplest impl: after each insert, `db.non_qr_blocks.delete_many({restaurant_id: <rid>, _id: {$nin: <top-200-by-ts>}})` OR use a `bulk_write` with delete + insert.
- Alternative: native capped collection at 200 × N (where N = number of restaurants). Simpler but mixes restaurants. Owner-confirmed: per-restaurant 200 is the target.

### 6.3 Payload captured

| Field | Source | Notes |
|---|---|---|
| `restaurant_id` | request body | string |
| `checkpoint` | request body | `'landing' \| 'add_to_cart' \| 'place_order'` |
| `scanned_room_or_table` | request body | `'table' \| 'room' \| 'walkin' \| null` (from FE state at moment of block) |
| `final_table_id` | request body | what would have been sent to POS (string, possibly `'0'`) |
| `is_edit_mode` | request body | bool |
| `is_authenticated` | request body | bool |
| `client_ip` | header `X-Forwarded-For` (first chunk) → fallback `request.client.host` | k8s ingress sets X-Forwarded-For |
| `user_agent` | header `user-agent` | full UA string |
| `referer` | header `referer` | which route the block fired from |
| `ts` | backend (`datetime.now(timezone.utc)`) | ISO 8601 string |

### 6.4 Auto-enable behaviour (locked)

> **The endpoint is always callable.** The FE only fires it when a block actually happens. A block only happens when `allowNonQrOrders === false`. So telemetry is **self-gated by the policy flag** — no env var, no second toggle, no admin action required. When admin flips the policy ON for restriction, telemetry starts. When they flip it OFF, telemetry stops.
>
> If the endpoint receives a POST when no policy is enabled (e.g. dev testing or someone curl'ing it manually), it still writes — that's a feature, not a bug.

### 6.5 Privacy considerations

- `client_ip` is logged. This is comparable to webserver access logs — standard practice. Should be acceptable, but flag to legal/owner before going to prod.
- No customer phone or name captured at the diagnostic level. Those remain in their existing places (`customers` collection, order docs).
- 30-day retention is NOT used here — instead, 200-doc rolling cap per restaurant.
- The collection is NOT exposed via any customer-facing API.

---

## 7. File surface (estimated, no edits yet)

| File | Change | LOC |
|---|---|---|
| `frontend/src/utils/orderAccessPolicy.js` | **NEW** | `shouldBlockNonQrOrder(ctx, config)` — single source of truth | ~20 |
| `frontend/src/components/NonQrBlockModal.jsx` | **NEW** | the modal | ~30 |
| `frontend/src/api/services/diagnosticsService.js` | **NEW** | `postNonQrBlock(payload)` fire-and-forget | ~15 |
| `frontend/src/context/AdminConfigContext.jsx` | + 1 default | ~1 |
| `frontend/src/context/RestaurantConfigContext.jsx` | + 1 default + 1 serializer | ~2 |
| `frontend/src/pages/admin/AdminVisibilityPage.jsx` | + 1 section + 1 ToggleSwitch row | ~10 |
| `frontend/src/pages/LandingPage.jsx` | Guard #1 (C1) | ~6 |
| `frontend/src/context/CartContext.js` (or `Menu.jsx`) | Guard #2 (C2) at first add | ~6 |
| `frontend/src/pages/ReviewOrder.jsx` | Guard #3 (C3) before place-order | ~6 |
| `backend/server.py` | New endpoint `POST /api/diagnostics/non-qr-block` with capped collection logic | ~30 |

**Total: 3 new FE files + 6 small FE edits + 1 backend endpoint. ~125 LOC.**

---

## 8. Hard constraints

| # | Constraint | Where it applies |
|---|---|---|
| HC1 | Restaurant **716** untouched | All 3 guards wrap in `String(restaurantId) !== '716'` exclusion |
| HC2 | No Item 2 root-cause fix in this CR | `ReviewOrder.jsx:982-985` and the `editOrder.tableId` dead-state stay parked |
| HC3 | No conflict with Item 1 (`skipOtp*`) | The new guard fires BEFORE the OTP-skip logic. If a customer would be blocked, they never reach the OTP gate. |
| HC4 | Day-1 behaviour preserved | Default `allowNonQrOrders=true` for every restaurant. Admin must explicitly opt in to enforcement. |
| HC5 | Bypass for Edit Order | `isEditMode === true` skips all 3 guards |
| HC6 | Bypass for Takeaway / Delivery | Mode-based; checks `selectedMode` and `scannedOrderType` |
| HC7 | Walk-in QR is treated as a valid scan | `scannedRoomOrTable === 'walkin'` is NOT considered "non-QR" |
| HC8 | Telemetry endpoint always callable, FE auto-gated by `allowNonQrOrders=false` | No env var, no second toggle |

---

## 9. Test scenarios (for the future implementation + testing agent)

| # | Scenario | Setup | Expected |
|---|---|---|---|
| 1 | Default state preserved | `allowNonQrOrders` missing/true | Customer arrives without QR → normal flow, no block, no telemetry |
| 2 | Block at landing | `allowNonQrOrders=false`, customer arrives at `/<rid>` (no QR) → taps "Browse Menu" | Modal shows; CTA routes to landing; telemetry POST fired with `checkpoint='landing'` |
| 3 | Block at add-to-cart | `allowNonQrOrders=false`, customer somehow reaches `/menu` (e.g. existing tab) → adds first item | Modal; cart cleared; telemetry `checkpoint='add_to_cart'` |
| 4 | Block at place-order | `allowNonQrOrders=false`, customer reaches `/review-order` → taps Place Order | Modal; cart cleared; telemetry `checkpoint='place_order'` |
| 5 | Valid table QR bypasses block | `allowNonQrOrders=false`, customer scans `?type=table&tableId=12` | No block at any checkpoint |
| 6 | Valid room QR bypasses block | `allowNonQrOrders=false`, customer scans `?type=room&tableId=R5` | No block at any checkpoint |
| 7 | Walk-in QR bypasses block | `allowNonQrOrders=false`, customer scans `?type=walkin` | No block — HC7 |
| 8 | Takeaway never blocked | `allowNonQrOrders=false`, customer selects Takeaway mode (no QR) | No block — HC6 |
| 9 | Delivery never blocked | `allowNonQrOrders=false`, customer selects Delivery mode | No block — HC6 |
| 10 | Edit Order bypasses | `allowNonQrOrders=false`, customer in `isEditMode=true` (sessionStorage clean) | No block at any checkpoint — HC5 |
| 11 | Authenticated user STILL blocked | `allowNonQrOrders=false`, customer has CRM token from previous session, no QR this session | Block fires (Q4 = no bypass for auth) |
| 12 | Restaurant 716 untouched | `allowNonQrOrders=false` for 716, customer arrives without QR | No block — HC1 |
| 13 | Cart is cleared on block | Customer adds 4 items, then tab is wiped, then add-to-cart fires guard | Cart=0 after block, modal shown |
| 14 | Telemetry capped at 200 per rid | Trigger 250 blocks for `rid=698` | Collection has exactly 200 docs for `restaurant_id="698"`; oldest dropped |
| 15 | Item 1 (`skipOtp*`) still works alongside | Customer with `skipOtpTakeaway=true` + `allowNonQrOrders=false`, selects takeaway | Block does NOT fire (HC6 — takeaway is bypassed). OTP-skip still works. |
| 16 | Modal is truly non-dismissable | Tap backdrop / press Esc | Modal stays |
| 17 | Telemetry endpoint privacy | No customer PII (phone, name) in the payload | Confirmed by inspecting the request body |
| 18 | Telemetry auto-disables when flag is OFF | `allowNonQrOrders=true`, customer arrives without QR | Zero telemetry calls (FE doesn't fire any block) |

---

## 10. Out of scope (explicit)

- The systemic Item 2 fix (`ReviewOrder.jsx:982-985` `editOrder.tableId` dead state) — remains parked
- Item 3 room → walk-in misrouting — remains parked
- sessionStorage → localStorage migration (F3 from parked investigation) — remains parked
- `useScannedTable` merge fix (F2) — remains parked
- A separate `allowWalkInQrOrders` flag to disable walk-in QRs independently — future backlog
- Editing the legacy `otpRequired*` toggles — remains parked

---

## 11. Implementation phasing

**Single PR** recommended:
- 3 new FE files
- 6 small FE edits
- 1 backend endpoint
- Default `true` preserves Day-1 behaviour for every restaurant — observable risk on merge is zero
- Reviewer can validate by reading `shouldBlockNonQrOrder(...)` (single expression)

After merge: admin can flip a restaurant's `allowNonQrOrders=false` in pre-prod, validate, then GA.

---

## 12. Next step

Implementation is NOT started. When owner says "implement CR-002", the agent should:
1. Re-read this doc end-to-end
2. Confirm `git log` for any drift since 2026-05-30
3. Confirm Item 1 (`skipOtp*`) is still live + working
4. Build the 3 FE files + edits + 1 backend endpoint
5. Run testing agent against the 18 scenarios in §9
6. Update `/app/memory/PRD.md` and finish summary

> **No code, no config, no service changes in this session.**
