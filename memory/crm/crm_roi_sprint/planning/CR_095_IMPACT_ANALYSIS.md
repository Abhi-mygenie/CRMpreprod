# CR-095 — Impact Analysis: remove 4 orphan `/scan/config` + `/scan/menu/dietary-tags` routes
**Date**: 2026-10-09 · **Role**: Planning Agent · **Source**: INV-022 §3.5 · `discovery/SESSION_2026_09_28_BATCH_INTAKE_CR093_CR095.md` §3 · **Status**: 🟡 IA in progress — owner decisions Q1/Q2 pending · **No code changed.**

---

## 1. What these routes are

Four routes in `routers/scan.py` built in April 2026 under an assumption that was never agreed:

| Route | Function | Lines | Writes to |
|---|---|---|---|
| `GET /scan/config/{rid}` | Read Customer App branding/feature-flag config | :657–677 | — |
| `PUT /scan/config/{rid}` | Write Customer App branding/feature-flag config | :680–705 | `customer_app_config` |
| `GET /scan/menu/dietary-tags/{rid}` | Read menu item dietary tags | :712–722 | — |
| `PUT /scan/menu/dietary-tags/{rid}` | Write menu item dietary tags | :725–748 | `dietary_tags_mapping` |

Two Pydantic models support the PUTs:

| Model | Lines | Used by |
|---|---|---|
| `AppConfigUpdate` | :135–203 (69 lines, ~70 fields) | `PUT /scan/config` only |
| `DietaryTagsUpdate` | :206–207 (2 lines) | `PUT /scan/menu/dietary-tags` only |

---

## 2. Code reality (read-only probe 2026-10-09)

### Internal CRM callers — ZERO

| Location | Hits |
|---|---|
| `/app/frontend/src` — any reference to `scan/config`, `scan/menu/dietary-tags`, `AppConfigUpdate`, `DietaryTagsUpdate` | **0** |
| `/app/backend` (other files) — any import or call to these functions or models | **0** — only `scan.py` itself |
| Any test file | **0** |

### DB state

| Collection | Docs | CRM ever wrote one? |
|---|---|---|
| `customer_app_config` | **13** | **No** — none carry `created_by`/`updated_by` from a CRM user; all docs created by Customer App team |
| `dietary_tags_mapping` | **0** | Never written by anyone |

### Security defect — confirmed

`PUT /scan/config/{restaurant_id}` at `:680–705`:
```python
async def update_app_config(restaurant_id: str, updates: AppConfigUpdate,
                             user: dict = Depends(get_current_user)):
```
The `restaurant_id` comes from the URL path. The function never checks `restaurant_id == user["id"]`. Any valid CRM staff JWT from any tenant can overwrite any other restaurant's branding and feature flags. **Confirmed: cross-tenant write hole.**

`PUT /scan/menu/dietary-tags/{restaurant_id}` at `:725–748` — same pattern, same defect.

---

## 3. Ownership ruling (owner-locked)

| Decision | Source |
|---|---|
| **D1 = YES**: `customer_app_config` is Customer-App-owned; CRM must exit | Owner 2026-09-28 (INV-022 D1 ruling) |
| **D2 = YES**: `dietary_tags_mapping` same; CRM must exit | Owner 2026-09-28 (INV-022 D2 ruling) |
| **Symmetric rule**: CRM never reads Customer App collections | Owner 2026-10-03 (contract sign-off) |

---

## 4. Why it is split into two halves

**PUT half — ready now:**
- Zero callers inside or outside CRM (no frontend, no backend, no tests)
- `dietary_tags_mapping` has 0 docs; `customer_app_config` has 13 docs none written by CRM
- Removes the cross-tenant write security hole immediately
- No consumer action required — nobody calls these

**GET half — gated on CA-2:**
- Customer App currently reads `GET /scan/config/{rid}` to get branding/feature flags
- Their CA-2 commitment: "we will stop reading it and read our own collection directly — target date TBD"
- CRM removes the two GET routes only after they confirm the cutover
- Until then the GETs stay live and harmless (read-only, no cross-tenant issue)

---

## 5. Blast radius

| Scope | Impact |
|---|---|
| `scan.py` PUT routes + models | Deleted (~100 lines total) |
| `scan.py` GET routes | **Untouched** (PUT half) |
| All other `/scan/*` routes | **Zero** — completely separate functions |
| `customer_app_config` data | **Untouched** — no write; 13 docs stay |
| `dietary_tags_mapping` data | **Untouched** — 0 docs |
| Frontend | **Zero** — no references found |
| POS routes | **Zero** — unrelated |
| `server.py` | No change (no indexes for these collections) |

Risk (PUT half): **LOW** — pure deletions, zero callers, zero data, zero downstream consumers. No §14 hotspot.

---

## 6. Owner questions

| Q | Question | Recommendation |
|---|---|---|
| **Q1** | Confirm two-step sequencing: delete PUTs now (this CR, PUT half), GETs only after CA-2 arrives? | **Yes** — closes security hole immediately without breaking Customer App (they don't call the PUTs) |
| **Q2** | For the PUTs: hard `404 Not Found` or `405 Method Not Allowed`? | **404** — simpler, matches the pattern of removed routes in CR-084/097/098. No deprecation stub needed (zero callers) |

---

## 7. Verification matrix (PUT half)

| V | Check | Expected |
|---|---|---|
| V1 | `PUT /api/scan/config/689` with valid staff JWT | **404** |
| V2 | `PUT /api/scan/menu/dietary-tags/689` with valid staff JWT | **404** |
| V3 | `GET /api/scan/config/689` | still **200** (or "Config not found" — GET untouched) |
| V4 | `GET /api/scan/menu/dietary-tags/689` | still **200** "No dietary tags configured" (GET untouched) |
| V5 | `customer_app_config` count before/after | **unchanged** (13) |
| V6 | All other `/scan/*` routes (skip-otp, lookup, loyalty-rules, feedback, profile) | **unaffected** |

---

## 8. Files

**PUT half WILL delete:**
- `routers/scan.py:135–203` — `AppConfigUpdate` model (69 lines)
- `routers/scan.py:206–207` — `DietaryTagsUpdate` model (2 lines)
- `routers/scan.py:680–705` — `update_app_config` route (26 lines)
- `routers/scan.py:725–748` — `update_dietary_tags` route (24 lines)
- **Total removed: ~121 lines**

**WILL NOT touch:**
- `routers/scan.py:657–677` — `GET /scan/config` (stays)
- `routers/scan.py:712–722` — `GET /scan/menu/dietary-tags` (stays)
- All other files

---

**Q1 = YES (owner 2026-10-09)** — two-step confirmed: PUTs deleted now (PUT half); GETs removed after CA-2 cutover.
**Q2 = A / 404 (owner 2026-10-09)** — hard 404 on deleted PUT routes. No 410 stub (zero callers).
**IA CLOSED.** Implementation Plan gate open.
