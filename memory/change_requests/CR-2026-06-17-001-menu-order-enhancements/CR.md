# CR-2026-06-17-001 — Menu Order Admin Enhancements & Default Sort Fix

**ID:** CR-2026-06-17-001  
**Classification:** Change Request (6 items — 4 active, 2 parked)  
**Origin:** INV-2026-06-17-002 (Menu Order investigation)  
**Severity:** P1 (APP-1), P2 (APP-2 through APP-6)  
**Risk:** HIGH  
**Status:** QA_PASSED (Phase 1 + Phase 2) — ready for owner sign-off / closure
**Priority Order:** APP-1 → APP-2 → APP-4 → APP-3 (owner confirmed)
**Implementation history:**
- 2026-06-17 — Phase 1 (APP-1, APP-2) implemented; see `QA_HANDOVER_PHASE1.md`.
- 2026-06-17 — Phase 2 (APP-4 full + APP-3 minus admin UI render) implemented.
- 2026-06-17 — Phase 2 gap closed: APP-3 admin UI render (category-row + item-row pills, handlers, parent prop wiring, CSS); see `QA_HANDOVER_PHASE2.md`.
- 2026-06-17 — Bug fix: `AdminMenuPage.jsx` setConfig wrapper was discarding every field except `menuOrder`; fixed to forward all changed top-level fields. Found in iter_6, fixed before iter_7.
- 2026-06-17 — QA runs: iter_5 backend 5/5 PASS (pytest), iter_6 found CRITICAL admin-wrapper bug, iter_7 confirmed bug fixed + APP-3 admin↔backend persistence + reload + empty-cleanup all PASS end-to-end. Restaurant 478 final state reset to clean.

---

## Owner Decisions — ALL RESOLVED

| # | Question | Owner Answer | Date |
|---|---|---|---|
| 1 | APP-3 scope: per-item or per-category? | **BOTH** — category toggle applies to all items, item can override category | 2026-06-17 |
| 2 | APP-1 sort: food_order ascending, 0s at end? | **YES** confirmed | 2026-06-17 |
| 3 | Priority order? | **APP-1 → APP-2 → APP-4 → APP-3** confirmed | 2026-06-17 |
| 4 | POS gap handling? | **Draft POS contract** — completed | 2026-06-17 |

---

## Items

| Item | Description | Severity | Risk | Status |
|---|---|---|---|---|
| **APP-1** | Sort items by `food_order` client-side as default | P1 | MEDIUM | IMPLEMENTED (Phase 1) |
| **APP-2** | Wire station/menu drag-drop reorder in admin | P2 | MEDIUM | IMPLEMENTED (Phase 1) |
| **APP-3** | Admin override for dinein/takeaway/delivery (category + item level) | P2 | HIGH | IMPLEMENTED (Phase 2) |
| **APP-4** | Show/override station timing in admin Menu Order page | P2 | MEDIUM | IMPLEMENTED (Phase 2) |
| **APP-5** | Category default sort from POS (prep admin override) | P2 | MEDIUM | PARKED — blocked by POS-1 |
| **APP-6** | Menu/station default sort from POS (prep admin override) | P2 | MEDIUM | PARKED — blocked by POS-2 |

---

## Related Documents

| Document | Path |
|---|---|
| Impact Analysis & Implementation Plan | `/app/memory/change_requests/CR-2026-06-17-001-menu-order-enhancements/IMPACT_ANALYSIS.md` |
| POS API Contract Request | `/app/memory/change_requests/CR-2026-06-17-001-menu-order-enhancements/POS_API_CONTRACT_REQUEST.md` |
| Investigation Report | `/app/memory/change_requests/INV-2026-06-17-002-menu-order-investigation/INVESTIGATION_REPORT.md` |
| Payload Mapping | `/app/memory/change_requests/INV-2026-06-17-002-menu-order-investigation/PAYLOAD_MAPPING.md` |
| Default Ordering Analysis | `/app/memory/change_requests/INV-2026-06-17-002-menu-order-investigation/DEFAULT_ORDERING.md` |

---

## POS Dependencies (external)

| POS Gap | What's Needed | Contract Sent? |
|---|---|---|
| POS-1 | `category_order` field in `/web/restaurant-product` | YES — see POS_API_CONTRACT_REQUEST.md |
| POS-2 | `menu_order` field in `/web/menu-master` | YES |
| POS-3 | Populate `food_order` for all restaurants | YES |
| POS-4 | Populate `web_available_time_starts/ends` | YES |

---

## Blast Radius

| Area | Impact |
|---|---|
| Customer menu display | APP-1 changes item order for restaurants with `food_order` set (478, 689 immediately; others when POS populates) |
| Admin Menu Order page | APP-2, APP-3, APP-4 add new UI capabilities to existing page |
| Backend config schema | APP-3 adds `channelOverrides`, APP-4 adds `stationTimings` |
| RestaurantConfigContext | Must expose `channelOverrides` and `stationTimings` to customer app |
| DiningMenu.jsx | APP-4 station timing override |
| channelEligibility.js | APP-3 admin override parameter |

---

*Registered: 2026-06-17 | Last updated: 2026-06-17*
