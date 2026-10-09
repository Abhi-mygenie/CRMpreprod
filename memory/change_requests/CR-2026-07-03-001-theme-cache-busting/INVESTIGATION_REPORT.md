# Investigation Report — CR-2026-07-03-001 (companion)

**Related CR:** CR-2026-07-03-001-theme-cache-busting
**Type:** INV inline with CR
**Ran:** 2026-07-03
**Trigger:** Owner said "for 698 theme is not coming" — screenshot showed orange theme with no logo instead of expected Cafe Flora green + logo.

## Investigation output (per operating prompt §8 Role 6)

```text
Investigation complete: CACHE-STALE-698-THEME
Root cause: RestaurantConfigContext.jsx uses cache-first hydration
            (localStorage.restaurant_config_<rid>). When the backend
            was switched from UAT (primaryColor #E8531E orange, empty
            logo) to prod (primaryColor #1F3D34 green, valid CF logo),
            browsers still hydrated first-paint from the stale UAT blob.
            The background refetch either short-circuits (due to state
            already matching URL restaurantId) or fires but doesn't
            surface visibly to the user.
Classification: FRONTEND CACHE
Confidence: HIGH
Steps used: 5/10
Evidence:
  - DB state comparison (UAT vs prod) for restaurant 698:
      UAT   primaryColor='#E8531E', logoUrl='',    backgroundImageUrl=''
      PROD  primaryColor='#1F3D34', logoUrl='socket.mygenie.online//api/uploads/9156…png'
  - Deployed API returns prod data correctly (200 OK, verified by curl).
  - Headless-browser test (no cache) rendered PROD theme correctly.
  - Same page in the user's browser (with UAT cache in localStorage)
    rendered the STALE UAT theme.
  - RestaurantConfigContext.jsx:200 loads cache into state instantly,
    then fires background /api/config/{rid} fetch.
  - The stale-cache class of bug has no built-in invalidation path;
    only 30 s soft-refresh + visibility events flip it, which don't
    fire while a tab is left open indefinitely.

Two-part fix chosen:
  2.1 IMMEDIATE — ?bustCache=1 URL escape hatch
        Skip cache-first paint; refetch always overwrites cache.
        (shipped as CR-2026-07-03-001)
  2.2 LATER — server-driven themeVersion int on customer_app_config;
        client refetches when server.themeVersion > cached.
        (deferred to CR-2026-07-03-005 F-01)

Report: (this file)
```

## Files inspected

- `/app/frontend/src/context/RestaurantConfigContext.jsx` (cache/hydrate flow)
- `/app/frontend/src/pages/LandingPage.jsx` (logo rendering gate)
- `/app/frontend/src/index.css` (CSS default `--color-primary: #E8531E` — the source of the "stale flash even when cache empty" trap)
- Prod + UAT Mongo `customer_app_config` for 698 and 716
- Live headless browser + real user browser comparison

## Related

- **CR-2026-07-03-001** — implemented the immediate `?bustCache=1` fix.
- **CR-2026-07-03-005 F-01** — planned permanent fix via server-driven `themeVersion`.
- **INV-2026-07-03-003** — companion investigation of 698's actual provisioning state.
