# INTAKE DOC — CR-2026-08-03-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-08-03-001 |
| **Title** | Remove all Restaurant 716 hardcodings — make config-driven for any restaurant |
| **Classification** | CR (Change Request) — Architectural refactor |
| **Date Registered** | 2026-08-03 |
| **Reported By** | Owner (Abhi-mygenie) |
| **Severity** | P1 (High) |
| **Risk** | HIGH → CRITICAL (touches order placement, payment routing, session management) |
| **Status** | INTAKE COMPLETE — awaiting Planning |

---

## 1. Owner Request (Verbatim)

> "investigate in deep for Hyatt (716) what all hardcodings are there then we will brainstorm how we can remove whose hardcoding for multi menu restaurants"
> "if i need to create one restaurant exactly like 716 what should i do — no code edit — i mean we need to hardcode that?"
> "autopaid-place-prepaid-order this configuration means orders are treated as paid — add this to report so this can also be configured for rest in which orders to be treated as paid"
> "register CR to remove 716 hard coding — we will brainstorm each point during impact"

---

## 2. Classification

| Check | Result |
|-------|--------|
| Bug? | No — current code works correctly for 716. |
| Feature? | Partially — enables onboarding new 716-like restaurants without code changes. |
| Refactor? | Yes — moves hardcoded business logic to config flags. |
| Investigation needed? | Complete — INV-2026-08-03-001 (v2) filed. |
| **Final classification** | **CR — Architectural refactor with feature enablement** |

---

## 3. Duplicate Check

| Related Item | Relationship | Status |
|-------------|-------------|--------|
| BUG-006 (Architectural Audit) | "Restaurant 716 behavior remains hardcoded" — narrow observation, no implementation plan | Open, P1 |
| ROADMAP P1-4 | "Replace hardcoded restaurant exception logic with configuration" — one-liner, no detail | Backlog |
| INV-2026-08-03-001 | Full investigation of all 716 hardcodings — feeds this CR | Complete |

**Verdict: DISTINCT.** BUG-006 and P1-4 identified the problem. INV-2026-08-03-001 mapped it fully. This CR is the first formal work item to execute the removal. Supersedes BUG-006 and P1-4.

---

## 4. Severity Assessment

| Factor | Assessment |
|--------|-----------|
| Customer impact today | None — 716 works correctly. No customer is broken. |
| Operational impact | **HIGH** — onboarding a new 716-like restaurant requires 18 code edits across 8 files, rebuild, redeploy. Blocks business scaling. |
| Revenue impact | **MEDIUM** — every new hotel/corporate client is blocked until code is changed. Lost deals if onboarding is too slow. |
| Technical debt | **HIGH** — every future CR touching order flow must carefully preserve 716 exceptions. Fragile. |
| **Final Severity** | **P1** — not a production outage (not P0), but blocks business capability and increases risk of future regressions. |

---

## 5. Risk Assessment

| Risk Factor | Level | Reason |
|-------------|-------|--------|
| ReviewOrder.jsx changes | **CRITICAL** | 12 of 18 hardcodings are in the highest-risk file in the codebase (ROADMAP P0-3). Order placement, payment, table validation, retry logic all touched. |
| OrderSuccess.jsx changes | **HIGH** | 2 hardcodings in post-order status handling. Incorrect change → order stuck in polling or wrong redirect. |
| orderService.ts endpoint switch | **CRITICAL** | Changing which POS API endpoint is called for order creation. Wrong endpoint → orders fail or wrong payment status. |
| orderAccessPolicy.js carve-out | **MEDIUM** | Removing a bypass. If config isn't set correctly for 716, could block 716 customers. |
| TableRoomSelector.jsx UI | **HIGH** | Changing room/table display logic. Wrong change → room picker missing or wrong mode shown. |
| Config migration (backfill) | **HIGH** | New flags must be backfilled for 716. Defaults must NOT change behaviour for any existing restaurant. Day-1 must be invisible. |
| POS backend compatibility | **UNKNOWN** | Does autopaid endpoint accept non-716 restaurant IDs? If not, POS team must also change. |
| **Overall Risk** | **HIGH → CRITICAL** | Multiple CRITICAL files touched. Order flow is the core business transaction. |

---

## 6. Evidence

All evidence from completed investigation INV-2026-08-03-001 (v2):

### 6.1 Three Dimensions of 716 Difference

| Dimension | Status | Hardcodings | Files |
|-----------|--------|-------------|-------|
| **DIM 1: Multi-menu (Stations page)** | Already config-driven via `multiple_menu: 'Yes'` | 0 | N/A |
| **DIM 2: Runtime room/table selection** | Hardcoded to `=== '716'` | 17 | ReviewOrder.jsx (12), OrderSuccess.jsx (2), TableRoomSelector.jsx (3) |
| **DIM 3: Orders treated as paid (autopaid)** | Hardcoded to `=== '716'` | 1 | orderService.ts (1) |

**Total: 18 code-level hardcodings + 9 comment-only references + 1 non-QR carve-out**

### 6.2 Scope Items for Planning

Each item below needs its own impact analysis during the Planning phase. Owner has requested brainstorming per item.

| Item # | Scope Item | Hardcoding Count | Proposed Config Flag | Risk |
|--------|-----------|------------------|---------------------|------|
| **ITEM-1** | Force room-only mode, hide table radio | 5 | `orderLocationType: 'room_only' \| 'table_only' \| 'room_and_table'` | CRITICAL |
| **ITEM-2** | Fresh room/table selection per order (clear after each order) | 8 | `requireFreshLocationPerOrder: boolean` | CRITICAL |
| **ITEM-3** | Allow multiple orders per room/table | 1 | `allowMultipleOrdersPerLocation: boolean` | HIGH |
| **ITEM-4** | Don't persist manual selection to sessionStorage | 1 | (same flag as ITEM-2) | MEDIUM |
| **ITEM-5** | Exclude from QR-context-lost safety guard | 1 | (derived from ITEM-1: room_only → no QR needed) | MEDIUM |
| **ITEM-6** | Non-QR order carve-out removal | 1 | Use existing `allowNonQrOrders: true` in 716 config | MEDIUM |
| **ITEM-7** | Orders treated as paid (autopaid endpoint) | 1 | `ordersAutoPaid: boolean` | CRITICAL |

### 6.3 Non-716 Hardcodings (Out of scope — noted for reference)

| Item | Count | Not in this CR because |
|------|-------|----------------------|
| `pos_id: '0001'` | 13+ | Separate concern — POS provider config |
| Default restaurant `'478'` | 3 | Separate concern — dev/preview fallback |
| Country code `'91'` | 3 | Separate concern — internationalization |

---

## 7. Blast Radius

### Files WILL change

| File | Risk | Changes |
|------|------|---------|
| `ReviewOrder.jsx` | **CRITICAL** | 12 checks replaced with config reads |
| `OrderSuccess.jsx` | **HIGH** | 2 checks replaced |
| `TableRoomSelector.jsx` | **HIGH** | 3 checks replaced |
| `orderAccessPolicy.js` | **MEDIUM** | 716 carve-out removed |
| `orderService.ts` | **CRITICAL** | Endpoint routing changed to config-driven |
| `RestaurantConfigContext.jsx` | **HIGH** | New flags added to schema/defaults |
| `AdminSettings.jsx` | **MEDIUM** | Admin UI for new flags (if owner wants) |
| `server.py` | **HIGH** | New config fields in DB/API |

### Files WILL NOT change

| File | Why |
|------|-----|
| `LandingPage.jsx` | 716 handling is "natural" via `isMultipleMenu()` — no hardcoding |
| `AuthContext.jsx` | pos_id is separate scope |
| `CartContext.js` | No 716 references |
| `otpPolicy.js` | 716 is IN-scope for OTP like everyone (comment only) |
| `crmService.js` | Country code is separate scope |

### Downstream Consumers Affected

| Consumer | How |
|----------|-----|
| Every customer ordering at restaurant 716 | Any regression breaks Hyatt operations |
| Every customer at any other restaurant | Defaults must NOT change behaviour |
| Admin panel users | May see new config toggles |
| POS backend | Autopaid endpoint may need to accept new restaurant IDs |

---

## 8. Constraints & Hard Rules

1. **Day-1 invisible**: Default values of all new flags must preserve EXACT current behaviour for all existing restaurants. No restaurant should see any change on deployment.
2. **716 must keep working**: Backfilled config for 716 must reproduce all current 716 behaviour identically.
3. **No Fast Lane**: All files are in the high-risk / hotspot list (PART C of system prompt).
4. **Owner approval required**: Per system prompt, touching ReviewOrder.jsx (CRITICAL), orderService.ts (payment), and config schema all require owner approval before implementation.
5. **Gate flow enforced**: INTAKE → PLANNING (with owner brainstorm per item) → OWNER APPROVAL → IMPLEMENTATION → QA → SMOKE.
6. **Do not remove `payment_method: 'cash_on_delivery'` hardcoding**: BUG-007 is a separate item. Don't fix it here.
7. **Do not change `isOn()` default behaviour**: System prompt rule #11.
8. **Do not reorder context providers**: System prompt rule #2.

---

## 9. Open Questions (Carried from Investigation)

| # | Question | Blocks | Who answers |
|---|----------|--------|------------|
| OQ-1 | Does POS autopaid endpoint accept restaurant IDs other than 716? | ITEM-7 implementation | POS/Backend team |
| OQ-2 | Should `ordersAutoPaid` work for non-multi-menu restaurants too? | ITEM-7 scope | Owner decision |
| OQ-3 | Does autopaid affect order status flow (start at status 6 directly)? | ITEM-7 testing | POS/Backend team |

---

## 10. Intake Output

```
Intake complete: CR-2026-08-03-001
Classification: CR — Architectural refactor with feature enablement
Severity: P1
Risk: HIGH → CRITICAL
Duplicate check: DISTINCT (supersedes BUG-006, ROADMAP P1-4)
Evidence: INV-2026-08-03-001 (v2) — 18 hardcodings mapped across 8 files
Blast radius: LARGE — 8 files changed, core order flow touched, all restaurants affected by defaults
Docs updated: /app/memory/change_requests/CR-2026-08-03-001-remove-716-hardcoding/INTAKE_DOC.md
Next: PLANNING — brainstorm each of the 7 scope items with owner during impact analysis
```

---

*Intake Agent — CR-2026-08-03-001 — 2026-08-03*
