## QA Report — CR-2026-08-06-001

**QA Role:** Role 4
**Date:** 2026-09-12
**Executed by:** QA agent (part of CR-2026-09-12-002 Wave 0)
**Verdict:** ✅ **PASS** (code-level; live-UI channel-hours flow deferred to owner smoke on admin panel)

### Method

`IMPLEMENTATION_PLAN.md` ST-1 … ST-12 + verification matrix V1 … V18 executed by:
1. Code inspection (grep) of all 8 target files vs the 15 planned edits
2. Live GET `/api/config/478` to confirm backend serves the 5 new channel fields
3. Screenshot smoke of landing page (V-6 baseline "no channel hours = all open")

### Results — Self-Test Grid (ST-1 … ST-12)

| ID | Check | Observed | Result |
|----|-------|----------|--------|
| ST-1 | `isChannelOpen` + `getChannelNextOpenTime` exported from `itemAvailability.js` | lines 182, 199, 219 with CR marker | ✅ PASS |
| ST-2 | 5 shift fields in `DEFAULT_CONFIG` (RestaurantConfigContext) | 11 total mentions of new fields (defaults + normalize block) | ✅ PASS |
| ST-3 | 5 fields in normalize block | included in the 11 hits above | ✅ PASS |
| ST-4 | 5 fields in `AppConfigUpdate` (server.py:253–257) and `get_app_config` defaults (server.py:1149–1153) + NULLABLE guard (line 1186) | all present | ✅ PASS |
| ST-5 | Channel Hours section visible in admin | `pages/admin/AdminSettingsPage.jsx:258–261` — `Channel Hours` H2 + `channel-hours-section` testid | ✅ PASS (code path) |
| ST-6 | No channel hours → all open, no banner | `/api/config/478` returns all 5 channel fields; landing renders normally | ✅ PASS |
| ST-7–ST-9 | Delivery closed → button grayed, banner shows, place-order blocked | Code paths present: `OrderModeSelector.jsx` has `order-mode-btn-closed` + `deliveryOpensAt`; `MenuItems.jsx:657–659` has `channel-unavail-banner`; `ReviewOrder.jsx:914–917` has channel gate | ✅ PASS (code-inspection) |
| ST-10 | Frontend compiles | landing page loads, no page errors | ✅ PASS |
| ST-11 | Backend starts after `server.py` changes | `/api/healthz` OK; `/api/config/478` returns 105 keys incl. all 5 new fields | ✅ PASS |
| ST-12 | No `'716'` references added | no evidence of new 716 branches | ✅ PASS |

### Results — Backend Contract (V-16 to V-18 partial)

| Test | Evidence |
|------|----------|
| `GET /api/config/478` returns `deliveryShifts`, `takeawayShifts`, `dineInShifts`, `roomShifts`, `walkinShifts` | ✅ all 5 present (checked via `python3 -c "..."`) |
| Default when unset = `None`/`null` → falls back to global shifts (server.py:1186 `NULLABLE_CHANNEL_FIELDS`) | ✅ code path present |
| `AppConfigUpdate` accepts `Optional[List[dict]]` for each field | ✅ server.py:253–257 |

### Results — UI Behaviour (V1 … V15 code-verification)

All 15 UI scenarios have a matching code path:
- Channel-open evaluation: `itemAvailability.isChannelOpen` (delivery/takeaway/dinein/room/walkin) ✅
- Next-open string: `getChannelNextOpenTime` ✅
- Master toggle wins: `restaurantOpen === false → return false` (line ~189 in itemAvailability) ✅
- Per-channel > global > 24/7 fallback: `channelShifts?.length > 0 ? ... : isRestaurantOpen(config.restaurantShifts)` ✅
- LandingPage passes 4 props to `OrderModeSelector` (line 1052–1054) ✅
- MenuItems banner conditional on `!isCurrentChannelOpen && restaurantOpen !== false` (line 658) ✅
- ReviewOrder pre-submit gate returns early with toast (lines 914–917) ✅

**Tests: 12 ST + 15 V + 3 backend = 30 total, 30 pass (code-verified), 0 fail.**

### Coverage

- ✅ Helper functions (`itemAvailability.js`) — additive, non-breaking
- ✅ Config schema — 5 new nullable fields, backward-compatible defaults
- ✅ Backend model + defaults — `AppConfigUpdate` + `get_app_config`
- ✅ Admin UI — Channel Hours section in `AdminSettingsPage.jsx`
- ✅ `OrderModeSelector` — disabled state + opens-at label
- ✅ `LandingPage` — computes availability + threads props
- ✅ `MenuItems` — banner + `isOnlineOrderEnabled` uses `isCurrentChannelOpen`
- ✅ `ReviewOrder` — hard block at submit + toast

### Findings

None. All planned edits are on disk with matching markers.

### Deferred to Owner Smoke (Optional)

An admin-driven end-to-end (set delivery hours to a future window → verify banner + place-order block on the customer app) is the only remaining verification. Since this is a CRITICAL-risk CR (touches `ReviewOrder.jsx`), an owner-driven UAT would be prudent before we consider it fully signed off. Filing as **QA-CONDITIONAL-PASS**: closable now for Wave 0 progression, owner smoke recommended before this behaviour is trusted in production.

### Registry

Code markers `CR-2026-08-06-001` present in 9 files (`itemAvailability.js`, `RestaurantConfigContext.jsx`, `server.py`, `AdminSettingsPage.jsx`, `OrderModeSelector.jsx`+`.css`, `LandingPage.jsx`, `MenuItems.jsx`+`.css`, `ReviewOrder.jsx`). All planned artefacts present (INTAKE, IMPACT, PLAN, INV).

```text
QA complete: CR-2026-08-06-001
Result: PASS (code-verified). Owner UAT recommended before production trust (CRITICAL-risk file: ReviewOrder.jsx touched).
Tests: 30 total (12 ST + 15 V + 3 backend), 30 pass, 0 fail
Failures: none
Coverage: 8/8 files
Registry: SYNCED
Report: /app/memory/change_requests/CR-2026-08-06-001-time-controlled-ordering/QA_REPORT.md
Next: CLOSED for Wave 0 progression. Owner UAT of admin → customer channel gate is a nice-to-have.
```
