# IMPACT ANALYSIS — CR-2026-08-03-001

## Planning Gate Status

| Step | Status |
|------|--------|
| 1. Verify registered | DONE — CR-2026-08-03-001 |
| 2. Code reality | FULL — 18 hardcodings verified |
| 3. Conflicts | NONE — no active CRs on affected files |
| 4. Data flow traced | DONE — 4 combos mapped |
| 5. Risk verified | HIGH → CRITICAL |
| 6. Affected files | 5 WILL change, 8 WILL NOT |
| 7. Owner decisions | 13 decisions captured (D1–D13) |
| 8. Impact Analysis | THIS DOCUMENT — **COMPLETE — GATE CLOSED 2026-08-05** |
| 9. Implementation Plan | NOT YET — awaiting Owner Approval |
| 10. Verification matrix | 18 test cases written |
| 11. WILL/WILL NOT | Declared |

**Gate status: IMPACT ANALYSIS GATE CLOSED — 2026-08-05 — all decisions recorded — next gate: Owner Approval**

---

## Decision Log

| # | Decision | Owner Answer |
|---|----------|-------------|
| D1 | Flag design: 6 flags vs simpler? | 2 flags only |
| D2 | Core distinction | Scanner vs Runtime (not hotel vs restaurant) |
| D3 | Config source | POS API |
| D4 | Runtime + URL params? | Lock — behave like scanner |
| D5 | Edit order in runtime? | No — orders are autopaid, settled |
| D6 | Room/Table radio flag? | No flag — derived from POS data |
| D7 | Autopaid = prepaid? | No — separate concept, customer doesn't pay at all |
| D8 | Runtime without autopaid possible? | Yes — flags are independent |
| D9 | OQ-1: Does POS autopaid endpoint accept non-716 restaurant IDs? | **YES — it is configuration-driven, not 716-specific. Any restaurant can use it.** |
| D10 | OQ-2: Should `ordersAutoPaid` work for non-multi-menu restaurants? | **YES — it is configuration. Any restaurant type can have autopaid enabled.** |
| D11 | OQ-3: Does autopaid change the order status flow? | **NO — backend already handles this. Works as-is for 716. No frontend change needed for status flow.** |
| D12 | How do the 2 flags reach the frontend? (delivery path) | **POS Profile API endpoint — POS backend team will add `locationSelection` and `ordersAutoPaid` as keys to the existing Profile API response. No change needed to our backend (server.py) or RestaurantConfigContext.jsx. WILL NOT change list stands.** |
| D13 | Implementation approach: start now or wait for backend? | **Start now (Option A — assume backend will send). Frontend reads flags with safe defaults. All existing restaurants unaffected. See transition note below.** |

**All decisions recorded. Impact Analysis gate closed. 2026-08-05.**

---

## Final 2-Flag Design

### `locationSelection: 'scanner' | 'runtime'`
- Source: POS API
- Default: `'scanner'`
- Replaces: Items 1, 2, 4, 5, 6 (16 hardcodings)

### `ordersAutoPaid: boolean`
- Source: POS API
- Default: `false`
- Replaces: Items 3, 7 (2 hardcodings)

---

## 4 Combos

| Combo | Edit Order? | Table Check? | Payment UI? | Example |
|-------|------------|-------------|------------|---------|
| scanner + normal | Yes | Yes | Yes | Every restaurant today |
| scanner + autopaid | No | Skip | Hidden | Pre-paid event |
| runtime + normal | No | Skip | Yes | Food court |
| runtime + autopaid | No | Skip | Hidden | 716 (Hyatt) |

---

## Files WILL change (5)

1. ReviewOrder.jsx (CRITICAL) — 12 checks
2. orderService.ts (CRITICAL) — 1 check
3. OrderSuccess.jsx (HIGH) — 2 checks
4. TableRoomSelector.jsx (HIGH) — 3 checks
5. orderAccessPolicy.js (MEDIUM) — 1 check

## Files WILL NOT change (8)

LandingPage.jsx, RestaurantConfigContext.jsx, AdminSettings.jsx, server.py, AuthContext.jsx, CartContext.js, otpPolicy.js, crmService.js

---

## Verification Matrix

18 test cases: V1–V18 (see HTML report for details)

---

## Implementation Approach (D13)

Start now. Do not wait for POS Profile API to be live before writing the Implementation Plan or coding.

**Safe defaults protect all existing restaurants:**
- `locationSelection` absent → reads as `'scanner'` → every non-716 restaurant behaves exactly as today
- `ordersAutoPaid` absent → reads as `false` → every non-716 restaurant behaves exactly as today

**716 transition note:**
716 hardcodings are REMOVED and replaced with config reads. Until POS sets
`locationSelection: 'runtime'` and `ordersAutoPaid: true` in 716's Profile API,
716 will briefly behave like a scanner/normal restaurant.
**Coordination required:** POS backend must set 716's flags in the Profile API
before or simultaneously with the frontend deployment. This is a deploy-coordination
dependency, not a code dependency.

---

## Next Gate

**GATE CLOSED — 2026-08-05**

```
Planning complete: CR-2026-08-03-001
Stage: Impact Analysis — GATE CLOSED
Code reality: FULL — 18 hardcodings verified
Risk: HIGH → CRITICAL
Files WILL change: ReviewOrder.jsx, orderService.ts, OrderSuccess.jsx,
                   TableRoomSelector.jsx, orderAccessPolicy.js
Files WILL NOT touch: LandingPage.jsx, RestaurantConfigContext.jsx, AdminSettings.jsx,
                       server.py, AuthContext.jsx, CartContext.js, otpPolicy.js, crmService.js
Owner decisions: D1–D13 all captured
Docs: /app/memory/change_requests/CR-2026-08-03-001-remove-716-hardcoding/IMPACT_ANALYSIS.md
      /app/memory/change_requests/CR-2026-08-03-001-remove-716-hardcoding/CR.md
Next: OWNER APPROVAL → Implementation Plan
```
