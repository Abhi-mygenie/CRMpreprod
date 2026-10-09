# IMPACT ANALYSIS — CR-2026-10-09-001
## Customer App side of CRM CR-095 (4 orphan config/dietary routes)

**Written by:** Role 2 — Planning Agent · **Date:** 2026-10-09 · **Risk:** LOW (ours) / HIGH (CRM) · **Priority:** P2
**Owner ruling received:** D1 = **(i) release CRM from the 4-step gate — ship CR-095 now**

---

## 1. What changes, and where

| Side | Change | Impact on Customer App |
|---|---|---|
| CRM | Delete `GET`+`PUT /scan/config/{rid}` (`scan.py:717,740`) and `GET`+`PUT /scan/menu/dietary-tags/{rid}` (`scan.py:772,785`) | **None at runtime.** No Customer App code, test, or fixture references these paths (grep 0 in `frontend/src`, `backend/`, `backend/tests`) |
| Customer App | **No code change.** Confirmation note to CRM, post-removal verification, §4d countersign | Documentation + one verification run |

## 2. Data-flow trace

```
Diner / admin browser
  └─ GET /api/config/<rid>            → server.py:936 get_app_config      → db.customer_app_config   (ours)
  └─ PUT /api/config                  → server.py:1083+ (admin JWT)        → db.customer_app_config   (ours)
  └─ GET /api/dietary-tags/<rid>      → server.py:1440 get_dietary_tags    → db.dietary_tags_mapping  (ours)
  └─ GET /api/dietary-tags/available  → server.py:1436 (static list)

CRM scan.py:717/740/772/785  → same two collections   ← nothing calls these; deleted by CR-095
```
After CR-095 the second block disappears. The first block is untouched.

## 3. Data reality (UAT, read-only, 2026-10-09)

| Collection | Docs | Shape | Risk after removal |
|---|---|---|---|
| `customer_app_config` | 13 | all `restaurant_id` short-form (`'364'`…`'69'`) | none — no CRM-written stray docs to migrate or purge |
| `dietary_tags_mapping` | 0 | — | none |

CRM's PUT could in theory have written docs keyed differently (their B3 concern). It never did. Nothing to clean.

## 4. Conflicts with active items

| Item | Relationship | Conflict? |
|---|---|---|
| CR-2026-10-03-004 (lookup / loyalty-rules) | Step 2 of the old sequence | **No** — D1=(i) decouples CR-095 from it |
| CR-2026-10-03-001 (13 dead routes) | Step 2 | No — different routes, our side |
| CR-2026-09-15-004 (admin login → POS) | Step 3 | No — decoupled by D1=(i) |
| CA-1 contract countersign (owner) | §4d is one row of the same contract | No — §4d row can be marked independently; CA-1 is the whole Part 1 |
| OWNERSHIP_MAP freeze | Blocked on POS reply + owner F3 | No — we mark §4d only; map stays DRAFT |

## 5. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | CRM deletes a *different* route by mistake (e.g. `/scan/config` vs something we do call) | Low | Acceptance item 2: probe exactly the 4 paths → 404, **and** run our contract tests — anything else we call would surface |
| R2 | An unknown third party (POS? old admin tool?) was using the 4 routes | Low — CRM scanned their consumers; our audit found none | CRM's risk; note it in the reply so it's on record |
| R3 | Ownership-map confusion: someone treats §4d countersign as the full map freeze | Medium | Plan marks the §4d row only, with an explicit "map remains DRAFT" line |

## 6. Files

**WILL change:** none in `frontend/` or `backend/`.
Memory only: `OWNERSHIP_MAP.md` (§4d row), this CR folder (CONFIRMATION_NOTE, VERIFICATION_REPORT), `index.yml`, `PRD.md`.

**WILL NOT touch:** `server.py` · `RestaurantConfigContext.jsx` · `useMenuData.js` · `backend/tests/contracts/*` · any `.env`.

## 7. Owner decisions

| ID | Decision | Status |
|---|---|---|
| D1 | Sequencing gate | **RULED (i)** — release CRM; CR-095 ships independent of our steps 2–3 |
| D2 | Verification depth | open — rec **(a)** contract tests + 404 probe + doc counts |
| D3 | §4d signing authority | open — rec owner authorises E1 to mark the row (mirrors CRM's owner-authorised signature) |

If D2/D3 are not answered before Gate 3, the plan proceeds with the recommendations.

```text
Planning complete: CR-2026-10-09-001
Stage: Impact Analysis
Code reality: NONE (no app code change required)
Risk: LOW
Files WILL change: none (memory only)
Files WILL NOT touch: server.py · RestaurantConfigContext.jsx · useMenuData.js · backend/tests/contracts/*
Owner decisions: D1 ruled (i) · D2, D3 open (recs stated)
Docs: memory/change_requests/CR-2026-10-09-001-crm-cr-095-readiness-and-ownership-signoff/IMPACT_ANALYSIS.md
Next: Implementation Plan (same session)
```
