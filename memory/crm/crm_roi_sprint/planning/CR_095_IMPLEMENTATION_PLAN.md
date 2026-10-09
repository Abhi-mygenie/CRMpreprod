# CR-095 — Implementation Plan: remove PUT half (`update_app_config` + `update_dietary_tags`)
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/CR_095_IMPACT_ANALYSIS.md` (Q1 yes · Q2 A/404 — CLOSED) · **Risk**: LOW (pure deletions; zero callers; no consumers) · **Status**: ✅ OWNER APPROVED — implementation gate open · **No code changed.**

---

## 0. Decisions locked

| Q | Decision |
|---|---|
| **Q1** | **YES** — two-step: delete both PUTs now (this CR); GETs only after CA-2 arrives |
| **Q2** | **A — 404** — hard delete, no stub. Zero callers, no deprecation window needed |

---

## 1. Edits — 4 deletion blocks in `routers/scan.py`

**E1 — Delete `AppConfigUpdate` model (lines 135–203, 69 lines)**

Delete the entire class from the blank line before `class AppConfigUpdate` through the last field.

**E2 — Delete `DietaryTagsUpdate` model (lines 206–207, 2 lines)**

Delete the entire class.

> E1 and E2 are adjacent. Delete both models together in one edit.

**E3 — Delete `update_app_config` route (lines 680–705, 26 lines)**

Delete the `@router.put("/config/{restaurant_id}")` decorator + `update_app_config` function.

**E4 — Delete `update_dietary_tags` route (lines 725–748, 24 lines)**

Delete the `@router.put("/menu/dietary-tags/{restaurant_id}")` decorator + `update_dietary_tags` function.

---

## 2. Exact blocks to remove

### E1 + E2 (models, adjacent — one edit)

**Remove this entire block** (between `class TableAction` and `# Standard response`):

```
class AppConfigUpdate(BaseModel):
    primaryColor: Optional[str] = None
    ...  (all 68 fields)
    customPages: Optional[List[dict]] = None


class DietaryTagsUpdate(BaseModel):
    mappings: dict
```

Nothing before `# Standard response` / `def _resp(...)` is touched.

### E3 (update_app_config route)

**Remove this entire block** (between `return _resp(True, "Config loaded", config)` GET route ending and `# C5 - Dietary Tags` section comment):

```
@router.put("/config/{restaurant_id}")
async def update_app_config(restaurant_id: str, updates: AppConfigUpdate, user: dict = Depends(get_current_user)):
    ...
    return _resp(True, "Config updated")
```

The `GET /config` route above and the `# C5 - Dietary Tags` comment below are **untouched**.

### E4 (update_dietary_tags route)

**Remove this entire block** (between `return _resp(True, "Dietary tags loaded", doc)` GET route ending and `# C6 - Customer Actions` section comment):

```
@router.put("/menu/dietary-tags/{restaurant_id}")
async def update_dietary_tags(restaurant_id: str, data: DietaryTagsUpdate, user: dict = Depends(get_current_user)):
    ...
    return _resp(True, "Dietary tags updated")
```

The `GET /menu/dietary-tags` route above and `# C6 - Customer Actions` below are **untouched**.

---

## 3. Edit order

```
E1+E2 (models) → E3 (update_app_config) → E4 (update_dietary_tags)
→ backend hot-reload → V1–V6 self-test
```

No test file needed — verifications are curl checks (V1–V4) and DB count (V5).

---

## 4. Verification (self-test after edits)

| V | Check | Expected |
|---|---|---|
| V1 | `PUT /api/scan/config/689` (valid staff JWT) | **404** |
| V2 | `PUT /api/scan/menu/dietary-tags/689` (valid staff JWT) | **404** |
| V3 | `GET /api/scan/config/689` | **200** or "Config not found" (GET untouched) |
| V4 | `GET /api/scan/menu/dietary-tags/689` | **200** "No dietary tags configured" (GET untouched) |
| V5 | `customer_app_config` count | **13** (unchanged — no writes) |
| V6 | Backend reload clean — `Application startup complete`, no ImportError or NameError | **PASS** |

---

## 5. Files

**WILL change**: `backend/routers/scan.py` — delete ~121 lines across 4 blocks

**WILL NOT touch**:
- `GET /scan/config/{restaurant_id}` route (lines 657–677 current) — stays live until CA-2
- `GET /scan/menu/dietary-tags/{restaurant_id}` route (lines 712–722 current) — stays live until CA-2
- All other `/scan/*` routes
- `routers/pos.py`, `routers/customers.py`, `models/schemas.py`, `server.py`
- Any frontend file
- `customer_app_config` and `dietary_tags_mapping` stored data

---

## 6. Rollback

`git revert` — no data written; GET routes unchanged throughout.

---

## 7. Consumer note

None required. The two PUT routes have zero callers (confirmed: zero frontend references, zero test references, no CRM-written DB docs). No note to Scan & Order for the PUT removal. The GET removal note goes in the wave change-log at the time of GET half removal (after CA-2).

---

```
Planning complete: CR-095 (PUT half)
Stage: Implementation Plan
Code reality: DEAD (zero callers, zero CRM-written docs, zero tests)
Risk: LOW
Files WILL change: routers/scan.py (delete ~121 lines, 4 blocks)
Files WILL NOT touch: GET routes · all other scan.py · pos.py · customers.py · frontend · stored data
Owner decisions: Q1 YES · Q2 A/404 — both locked
Docs: planning/CR_095_IMPLEMENTATION_PLAN.md
Next: "choose implementation role for CR-095" → implement
```
