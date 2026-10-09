# Investigation Report — INV-2026-07-03-003

**ID:** INV-2026-07-03-003-restaurant-698-provisioning-and-theme
**Type:** INV (read-only investigation)
**Ran:** 2026-07-03
**Trigger:** Owner said "I can login to 698 but theme is not coming at /698"

## Investigation output — provisioning check

```text
Investigation complete: RID-698-LOGIN-STATE-CHECK
Root cause: N/A — 698 is FULLY PROVISIONED.
Classification: DATA=OK
Confidence: HIGH
Steps used: 3/10
Evidence:
  db.users : 1 admin, restaurant_name "Cafe Flora",
             email ow***@cafeflora.com, valid bcrypt(60)
  db.customer_app_config : 1 doc, restaurantOpen=true,
                           allowNonQrOrders=false
  db.customers : 3 customers linked
  db.non_qr_blocks : 6 telemetry rows (customers blocked because
                     allowNonQrOrders=false)
  db.pos_request_logs : 0 rows for 698 admin → no failed-login trace
```

## Investigation output — theme rendering (UAT)

```text
Investigation complete: RID-698-THEME-RENDER (UAT DB)
Root cause: DATA — colors correctly applied; logo/banners/background
            are EMPTY STRINGS in UAT customer_app_config for 698.
            "Theme not coming" perception = missing brand assets, not
            missing colors.
Classification: DATA (config incomplete in UAT)
Confidence: HIGH
Evidence:
  primaryColor      = '#E8531E'  (present, applied)
  secondaryColor    = '#2E7D32'  (present)
  logoUrl           = ''         ← empty in UAT
  backgroundImageUrl= ''         ← empty
  banners           = []         ← empty
Runtime DOM verified:
  --color-primary       = '#E8531E'    (applied)
  --font-heading/body   = 'Montserrat' (applied)
Screenshot confirmed orange BROWSE MENU button + hamburger visible;
NO logo image rendered because logoUrl empty.
```

## Investigation output — theme rendering (after DB switch to prod)

```text
Investigation complete: RID-698-THEME-RENDER (prod DB)
Root cause: N/A — theme renders correctly in prod.
Evidence:
  primaryColor      = '#1F3D34'  (dark green, different from UAT orange!)
  secondaryColor    = '#A7B8AE'
  logoUrl           = 'https://socket.mygenie.online//api/uploads/9156…png'
                                                    ↑↑ double-slash smell
Runtime DOM (post prod-DB switch):
  --color-primary       = '#1F3D34'  ✅
  --font-heading        = 'Montserrat' ✅
  <img> logo            = loaded, 150×150, visible ✅
Users still seeing UAT theme in browser = stale localStorage cache
→ addressed by CR-2026-07-03-001 (?bustCache=1 escape hatch, SHIPPED).
```

## Related CRs

- **CR-2026-07-03-001** — theme cache busting (SHIPPED, addresses the stale-cache user experience)
- **CR-2026-07-03-005** — F-01 permanent `themeVersion` (PLANNED)
- **CR-2026-07-03-008** — F-10 double-slash logo URL cleanup

## Files inspected

- `/app/frontend/src/context/RestaurantConfigContext.jsx`
- `/app/frontend/src/pages/LandingPage.jsx` (logoUrl rendering path)
- Prod + UAT MongoDB (`customer_app_config`)

## Non-actions taken

- No code change here (fixes tracked in CR-001 + CR-005).
- No DB write.
