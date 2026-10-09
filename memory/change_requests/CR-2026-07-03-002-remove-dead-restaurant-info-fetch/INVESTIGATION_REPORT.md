# Investigation Report — CR-2026-07-03-002 (companion)

**Related CR:** CR-2026-07-03-002-remove-dead-restaurant-info-fetch
**Type:** INV inline with CR
**Ran:** 2026-07-03
**Trigger:** Owner asked "GET /api/restaurant-info/509 is 404, how did this come, is it used?"

## Investigation output (per operating prompt §8 Role 6)

```text
Investigation complete: BUG-RESTAURANT-INFO-404
Root cause: Backend NEVER implemented `/api/restaurant-info/{id}`.
            Frontend calls it in exactly one place
            (AdminConfigContext.jsx:167), guarded by .catch(() => null).
            Response would populate restaurantFlags {is_loyalty, is_coupon,
            multiple_menu} for admin UI. Silent 404 → flags stay {} →
            admin toggles hidden.
Classification: MISSING_BACKEND_ROUTE (previously catalogued in
                memory_repo/current-state/STALE_OR_MISSING_ROUTE_REPORT.md §1)
Confidence: HIGH
Steps used: 4/10
Evidence:
  - curl http://localhost:8001/api/restaurant-info/509 → HTTP 404
  - Backend OpenAPI: 38 routes, none matches /api/restaurant-info/*
  - grep -rn "restaurant.info|restaurant_info" backend/ → 0 hits
  - git log --all -S "/api/restaurant-info/" -- backend/server.py → 0 commits
    (endpoint has never existed on ANY branch)
  - Frontend caller: frontend/src/context/AdminConfigContext.jsx:167
  - Working sibling on POS: POST preprod.mygenie.online/api/v1/web/restaurant-info
    (different URL, verb, base — same data)
Blast radius:
  ❌ NOT broken for customers (they read is_loyalty from POS)
  ⚠️ Broken for admin UI:
      - VisibilityTab loyalty/coupon toggle rows hidden
      - AdminDietaryPage multipleMenu prop = undefined
Confusable sibling ruled out: POS restaurant-info is a POST to a different
    base URL. Different endpoint entirely.
Report: (this file)
```

## Recommendation → led to CR-2026-07-03-002

**P2 (frontend-drop)** was chosen over **P1 (backend-implement)** because:
- The same data already exists via `useRestaurantDetails(id)` React Query
  hook on the POS side.
- Deleting the dead call removes 404 noise AND fixes the admin UI toggles.
- No backend surface to maintain.

CR-2026-07-03-002 shipped the fix. Admin QA pending.

## Files inspected (read-only during investigation)

- `/app/backend/server.py` (OpenAPI + grep)
- `/app/frontend/src/context/AdminConfigContext.jsx:165-186`
- `/app/frontend/src/components/AdminSettings/VisibilityTab.jsx`
- `/app/frontend/src/pages/admin/AdminDietaryPage.jsx`
- `/app/frontend/src/api/services/restaurantService.js`
- `git log --all` for endpoint existence

## Related CRs

- **CR-2026-07-03-002** — implemented the P2 (drop the dead call).
- **CR-2026-07-03-005** (F-02) — potential follow-up to also dedup the copy in `AdminSettings.jsx:213`.
