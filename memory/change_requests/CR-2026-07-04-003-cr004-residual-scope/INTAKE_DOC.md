# Intake Doc — CR-2026-07-04-003

**ID:** CR-2026-07-04-003-cr004-residual-scope
**Session:** 2026-07-04
**Operator agent:** E1
**Role:** Role 1 (INTAKE) per Alpha v0.1 §8

---

## 1. Owner report / origin

Filed as follow-up during CR-2026-07-03-004 Role 3 shipping. Two items were explicitly scope-locked out to keep CR-004 focused on plumbing and to avoid touching CRITICAL hotspot files. Owner (D-02 during CR-004 planning) asserted POS idempotency handles the retry-safety concern for order-create, which lets the empty-state UI concern proceed cleanly.

Owner approval to consolidate (2026-07-04): "option A" — file the three consolidated CRs as proposed.

## 2. Summary

CR-004 shipped fetch timeouts + AbortController + Toast on config-fetch failures. Two related items were deferred:

- **Menu-load empty-state UI** — when `useMenuData` timeouts fire after 2 retries, the app currently shows a persistent skeleton (from CR-001 cache-first). Users don't know something is wrong. Design agent D-05 output (`/app/design_guidelines.json`) specifies an empty-state-with-CTA pattern.
- **5 AdminConfig CRUD/upload fetches** — `saveConfig` (PUT), `addBanner`, `updateBanner`, `deleteBanner` (POST/PUT/DELETE), `uploadImage` (POST). All admin-only, currently use raw `fetch` with browser default (~90 s). Should use `apiWriteClient` (15 s) for parity with the rest of the app.

## 3. Classification

| Field | Value |
|---|---|
| Type | CR — code (UI + service refactor) |
| Severity | **P2** — customer-facing menu UI (P1 flavour) + admin polish (P2 flavour) |
| Risk | **MEDIUM** — customer-facing pages touched (`LandingPage.jsx` / `MenuItems.jsx` / `DiningMenu.jsx`); admin path is LOW risk |
| Duplicate check | **DISTINCT** — CR-004 shipped the plumbing; this CR adds UI and admin coverage |
| Evidence | CR-004 `QA_HANDOVER.md §2` and §4 explicitly list these deferrals |
| Blast radius | **MEDIUM** — 3-5 customer-facing files + 1 admin service file |

## 4. Scope

**IN:**
- **Menu-load empty-state UI** — wire the design-agent pattern (Empty-state-with-CTA replacing the skeleton) in whichever component renders `useMenuData`'s result. Discovery step will identify the component (likely `LandingPage.jsx`, `MenuItems.jsx`, or `DiningMenu.jsx`).
- **AdminConfig CRUD** — swap 5 raw `fetch` calls in `AdminConfigContext.jsx` to use `apiWriteClient` (or `fetchWithTimeout` with 15 s cap). Preserve existing `toast.error()` fallback.
- **Code markers** — every touched file gets a `CR-2026-07-04-003` comment.

**OUT:**
- Order-create AlertDialog — DROPPED per CR-004 analysis (existing `ReviewOrder.jsx` line 1347 already shows a network-loss toast that duplicates the AlertDialog message; adding a dialog would be UX regression).
- Any change to `useMenuData` retry policy (already at 2 retries per CR-004).
- Any hotspot file NOT strictly needed for the empty-state wiring — `ReviewOrder.jsx`, `AuthContext.jsx`, `CartContext.js` untouched.
- Backend changes — none.

## 5. Prerequisites

- CR-2026-07-03-004 SHIPPED ✅ (2026-07-04)
- Design agent output `/app/design_guidelines.json` exists ✅

## 6. Success criteria (draft — refined at Planning)

| # | Criterion | Verification |
|---|---|---|
| S-01 | With `useMenuData` in error state (after 2 timeouts), an Empty-state-with-CTA renders with `data-testid="timeout-error-menu-load-retry-button"` | Playwright / owner smoke |
| S-02 | Tap "Retry" in the empty state → refetches menu, shows loading state, either succeeds or re-shows the empty state | Playwright / owner smoke |
| S-03 | AdminConfigContext: `grep -c "await fetch("` returns **zero** | grep |
| S-04 | Admin CRUD operations time out at 15 s ± 1 s during simulated upstream slowness | manual test |
| S-05 | No CRITICAL hotspot file touched (`ReviewOrder.jsx`, `CartContext.js`) | `git diff --name-only` |
| S-06 | ESLint clean on all touched files | `mcp_lint_javascript` |
| S-07 | `yarn build` succeeds | CI |
| S-08 | Bundle grep for `9579504871|Qplazm` still returns 0 | grep |

## 7. Owner decisions needed at Planning gate

| # | Decision | Options |
|---|---|---|
| D-01 | Empty-state message wording — accept design agent copy verbatim, or override? | (a) accept `"We're having trouble loading the menu. Please try again."` (b) custom |
| D-02 | Retry-button behaviour on menu empty-state — invalidate + refetch, or full page reload? | (a) invalidate query (b) full reload |
| D-03 | Upload timeout (`uploadImage`) — 15 s (write default) or longer for large files? | (a) 15 s (b) 30 s (c) 60 s |
| D-04 | Which of the 5 admin CRUD calls need special-case UI (blocking modal) vs. Toast? | Per-endpoint choice |

## 8. Estimated effort

- Discovery — 30 min (find the menu render component)
- Empty-state wiring — 1 hr
- 5 AdminConfig CRUD swaps — 45 min
- Self-test (V-01..V-08) — 30 min
- QA_HANDOVER writeup — 15 min
- **Total: 2.5–3 hrs**

## 9. Related items

- `CR-2026-07-03-004` — parent CR (plumbing shipped)
- `/app/design_guidelines.json` — design agent output for empty-state pattern

## 10. Non-goals

- Not a full admin panel refactor
- Not new features
- Not visual redesign — reuse existing shadcn/ui + Tailwind tokens

## 11. Compact Role 1 exit block

```text
Intake complete: CR-2026-07-04-003
Classification: CR (code — customer UI + admin service)
Severity: P2
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: linked (CR-004 QA_HANDOVER §2 §4)
Blast radius: MEDIUM (3-5 FE files)
Docs updated: memory/change_requests/CR-2026-07-04-003-cr004-residual-scope/{INTAKE_DOC.md, CR.md}, memory/change_requests/README.md (row added)
Blocked by: owner D-01..D-04 + real user smoke on shipped CR-004 first
Next: Planning (Role 2) — when triggered by user pain report OR whenever taken
```
