# INTAKE DOC — CR-2026-08-06-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-08-06-001 |
| **Title** | Per-channel time-controlled ordering (Delivery, Takeaway, Dine-in, Room, Walk-in) |
| **Classification** | CR — Feature + Enforcement Gap |
| **Date Registered** | 2026-08-06 |
| **Reported By** | Owner |
| **Severity** | P1 |
| **Risk** | HIGH → CRITICAL |
| **Status** | INTAKE COMPLETE — ready for Planning |

---

## 1. Owner Request (verbatim)

> "need a way that delivery takeaway room and table walkin all ordering can be time controlled,
>  currently customer can place order in midnight also"
> "ideally when he clicks on browse menu we should show delivery unavailable and show delivery time"
> "customer should not be able to place order — show same message"
> "shift controls all channel — i want control over channels"
> "during impact i want to see design"

---

## 2. Classification

| Check | Result |
|-------|--------|
| Bug? | Partially — order placement has zero time enforcement (gap in existing feature) |
| Feature? | Yes — per-channel hours is new capability |
| Refactor? | No |
| Investigation done? | Yes — INV-2026-08-06-001 closed |
| **Final classification** | **CR — Feature + Enforcement gap** |

---

## 3. Duplicate Check

| Related item | Relationship | Status |
|-------------|-------------|--------|
| `restaurantShifts` config (existing) | Foundation this CR extends — one global clock becomes per-channel | In use |
| `isRestaurantOpen()` in `itemAvailability.js` | Existing utility this CR extends | In use |
| `isOnlineOrderEnabled` in `MenuItems.jsx` | Current enforcement point — this CR extends it | In use |
| ROADMAP / backlog | No prior CR for per-channel hours | Clean |

**Verdict: DISTINCT.** No duplicate. Extends existing shift infrastructure.

---

## 4. Severity Assessment

| Factor | Assessment |
|--------|-----------|
| Customer impact today | HIGH — midnight orders going through for all channels. Restaurants receiving unwanted orders. |
| Operational impact | HIGH — restaurant staff has no way to close specific channels independently |
| Revenue impact | MEDIUM — unwanted orders create refunds, complaints, staff disruption |
| Technical debt | LOW — existing shift infrastructure is sound, this extends it cleanly |
| **Final Severity** | **P1** |

---

## 5. Risk Assessment

| File / Area | Risk | Reason |
|-------------|------|--------|
| `ReviewOrder.jsx` | **CRITICAL** | Highest-risk file in codebase (ROADMAP P0-3). New check at submission gate — additive but touches core order flow. Any regression = orders blocked for all channels incorrectly. |
| `LandingPage.jsx` | **HIGH** | ROADMAP P1-1 refactor target. Channel selector UI change. `isTakeawayDeliveryMode`, `selectedMode`, `OrderModeSelector` all affected. |
| `RestaurantConfigContext.jsx` | **HIGH** | Controls ~80+ flags. Adding 5 new channel-shift keys. `isOn()` default behaviour must not change. |
| `MenuItems.jsx` | **HIGH** | Current sole enforcement point. Replacing global check with per-channel check. New unavailability banner. |
| `server.py` | **HIGH** | Entire backend in single file. 5 new config fields in model + defaults. |
| `OrderModeSelector.jsx` | **MEDIUM** | New props (disabled state, opening time). UI-only change, low blast radius. |
| `itemAvailability.js` | **MEDIUM** | New `isChannelOpen()` helper. Additive — existing `isRestaurantOpen()` unchanged. |
| `AdminSettingsPage.jsx` | **MEDIUM** | New Channel Hours UI section. Pattern identical to existing shift UI. |
| Config schema / defaults | **HIGH** | 5 new nullable fields. Default `null` = open 24/7 (owner decision D5). Wrong default = all channels blocked globally. |
| **Overall Risk** | **HIGH → CRITICAL** | ReviewOrder.jsx is CRITICAL file. LandingPage.jsx is HIGH. Any wrong default blocks all restaurants. |

---

## 6. All Owner Decisions — D1–D7 (from investigation)

| # | Decision | Answer |
|---|----------|--------|
| D1 | Per-channel or global hours? | Per-channel — Delivery, Takeaway, Dine-in, Room, Walk-in each independent |
| D2 | What shows on menu/order when channel closed? | Banner: channel name + "unavailable now" + opening time |
| D3 | Can customer place order when channel closed? | NO — hard block, same message |
| D4 | Confirm dialog / bypass? | NO — just block and show message |
| D5 | Default when no channel hours configured? | Open 24/7 |
| D6 | Global `restaurantShifts` role going forward? | Fallback for channels with no specific hours set |
| D7 | Closed channel shown or hidden? | Shown, grayed out with opening time |

---

## 7. Evidence

### Current code reality (verified by grep)

| Component | Current state |
|-----------|--------------|
| `restaurantShifts` config | One global schedule — `[{ start, end }]` |
| `isRestaurantOpen()` | Called in `MenuItems.jsx` only |
| `ReviewOrder.jsx` | ZERO time-gate checks at submission |
| `OrderModeSelector.jsx` | No disabled/grayed state, no opening time display |
| `AdminSettingsPage.jsx` | Global shift UI only — no per-channel section |
| `server.py AppConfigUpdate` | `restaurantShifts: Optional[List[dict]]` — no per-channel fields |

### Channel architecture confirmed
- `scannedOrderType` carries the channel value: `'dinein'` `'takeaway'` `'delivery'` `'walkin'` `'room'`
- `OrderModeSelector` handles takeaway/delivery toggle on landing page
- `MenuItems.jsx` reads `scannedOrderType` — available for per-channel gate
- `ReviewOrder.jsx` reads `scannedOrderType` — available for per-channel gate

---

## 8. Blast Radius

### Files WILL change (8)

| File | Risk | Change type |
|------|------|-------------|
| `ReviewOrder.jsx` | **CRITICAL** | Add per-channel open check at submission — hard block |
| `LandingPage.jsx` | **HIGH** | Pass channel availability to OrderModeSelector; handle closed state |
| `RestaurantConfigContext.jsx` | **HIGH** | Add 5 channel shift fields + defaults to schema |
| `MenuItems.jsx` | **HIGH** | Replace global shift check with per-channel; add unavailability banner |
| `server.py` | **HIGH** | Add 5 fields to `AppConfigUpdate` model + defaults in `get_app_config` |
| `OrderModeSelector.jsx` | **MEDIUM** | Add disabled prop + opening time display per channel |
| `itemAvailability.js` | **MEDIUM** | Add `isChannelOpen(channel, config)` helper (additive) |
| `AdminSettingsPage.jsx` | **MEDIUM** | Add "Channel Hours" section with 5 per-channel time pickers |

### Files WILL NOT change

| File | Why |
|------|-----|
| `AuthContext.jsx` | No auth changes |
| `CartContext.js` | Cart persistence unchanged |
| `orderService.ts` | API payload unchanged |
| `OrderSuccess.jsx` | Post-order flow unchanged |
| `TableRoomSelector.jsx` | Table/room selection unchanged |
| `orderAccessPolicy.js` | Non-QR policy unchanged |

### Downstream consumers affected

| Consumer | How |
|----------|-----|
| Every customer at every restaurant | Config defaults (D5: null = open) must not break any existing restaurant |
| Restaurant 478 (18march) and all current restaurants | Day-1 invisible — no channel hours set = 24/7 open |
| Admin users | New Channel Hours section visible in Settings |
| Any restaurant using global `restaurantShifts` | Those shifts now become the fallback per channel |

---

## 9. Constraints and Hard Rules

1. **Day-1 invisible**: Default for all 5 new channel shift fields is `null`. Any restaurant that has no channel hours configured must behave exactly as today — open 24/7.
2. **Global `restaurantShifts` is preserved**: It becomes the fallback, not removed. Restaurants that already configured it still benefit.
3. **No Fast Lane**: `ReviewOrder.jsx` and `LandingPage.jsx` are both hotspot files (system prompt PART C). Full gate flow required.
4. **Do not change `isOn()` default behaviour** — system prompt rule #11.
5. **Do not reorder context providers** — system prompt rule #2.
6. **`restaurantOpen` master toggle takes priority**: If `restaurantOpen === false`, all channels are closed regardless of shift config.
7. **Design review required during Impact Analysis** — owner confirmed.

---

## 10. New Config Fields (proposed — for Planning to validate)

| Field | Type | Default | Channel |
|-------|------|---------|---------|
| `deliveryShifts` | `List[dict] \| null` | `null` (open 24/7) | Delivery |
| `takeawayShifts` | `List[dict] \| null` | `null` (open 24/7) | Takeaway |
| `dineInShifts` | `List[dict] \| null` | `null` (open 24/7) | Dine-in |
| `roomShifts` | `List[dict] \| null` | `null` (open 24/7) | Room orders |
| `walkinShifts` | `List[dict] \| null` | `null` (open 24/7) | Walk-in |

Fallback logic (for Planning to confirm):
```
channel open? =
  channelShifts configured  → isRestaurantOpen(channelShifts)
  channelShifts null        → isRestaurantOpen(restaurantShifts)  // global fallback
  restaurantShifts also null → true  // 24/7 open
  restaurantOpen === false  → false  // master toggle override
```

---

## 11. Intake Output

```
Intake complete: CR-2026-08-06-001
Classification: CR — Feature + Enforcement gap
Severity: P1
Risk: HIGH → CRITICAL (ReviewOrder.jsx CRITICAL, LandingPage.jsx HIGH, wrong defaults risk)
Duplicate check: DISTINCT
Evidence: INV-2026-08-06-001, code grep across 8 files, config schema inspection
Blast radius: LARGE — 8 files, 2 CRITICAL/HIGH hotspot files, all restaurants affected by defaults
Docs updated: /app/memory/change_requests/CR-2026-08-06-001-time-controlled-ordering/INTAKE_DOC.md
Next: PLANNING (design review required during Impact Analysis)
```
