# CR-2026-07-03-008 — Production DB Data Quality Remediation

**Status:** REGISTERED — Planning stage (DATA fix only, no code change)
**Raised:** 2026-07-03
**Author:** E1 (discovered during 709 / 698 / 716 investigations)
**Priority:** P2 for partially-provisioned restaurants (immediate user impact), P3 for the rest
**Severity:** MEDIUM (customer app degrades for the 15 affected restaurants)
**Risk of the change itself:** MEDIUM (direct DB writes to production — always risky)
**Type:** DATA CR — not a code change

---

## 1. Scope — five DB-quality items in the prod cluster

| Sub-ID | Item | Blast radius |
|---|---|---|
| F-07 | 15 restaurants have `db.users` admin rows but NO `db.customer_app_config` doc | Customer app for those 15 falls back to defaults; admin login works but branding broken |
| F-08 | 9 orphaned `customer_app_config` docs with no matching admin user (including malformed IDs `pos_0001_restaurant_478`, `demo-user-restaurant`, `''`) | Silent — no one can log in to fix them |
| F-09 | Restaurant 709 (Young Monk Cafe) is FULLY provisioned in prod but MISSING from UAT DB | UAT QA regression risk |
| F-10 | Double-slash in stored logo URLs (`socket.mygenie.online//api/uploads/…`) | Works today, code smell in whichever service writes those paths |
| F-11 | Booleans stored as strings (`"True"` / `"False"`) in `customer_app_config` (e.g. `restaurantOpen`, `allowNonQrOrders`) | Handled by `isOn()` helper today, but fragile |

Common theme: **the production `mygenie_db` has ~24 restaurants in inconsistent states and 2 systemic write-path bugs.**

## 2. Evidence

Collected during 2026-07-03 investigation session (queries against prod Atlas `mygenie.xdqqdpi.mongodb.net/mygenie_db`):

```
db.users            → 47 distinct restaurant_id values, all with bcrypt password_hash
db.customer_app_config → 41 distinct restaurant_id values

Users WITHOUT config (15): 196, 510, 519, 601, 610, 644, 672, 694, 702, 745, 769,
                           780, 788, 792, None
Config WITHOUT users (9):  pos_0001_restaurant_478, demo-user-restaurant, '', +6 more
```

## 3. F-07 — Partially provisioned restaurants

### Options for each restaurant
1. **Seed a default `customer_app_config`** (empty branding, default booleans) — restaurant becomes usable with a bland UI until admin fills in branding.
2. **Delete the `db.users` admin row** — restaurant is fully removed from the system.
3. **Do nothing and treat them as "in-progress"** — accept the degraded UI until admin manually completes setup.

### Proposed change (recommended: Option 1)
- Bulk-insert a minimal `customer_app_config` doc for each of the 15 restaurant_ids.
- Fields: `restaurant_id`, `restaurantOpen: true`, `allowNonQrOrders: true`, `primaryColor` = brand default, `fontHeading` = 'Inter', empty `banners: []`, empty `logoUrl: ""`.
- Alert the operator team so they can complete branding for those restaurants.

### Risks
| # | Risk | Mitigation |
|---|---|---|
| R1 | The 15 restaurants might already be intentionally paused | Cross-check with operator team before insert |
| R2 | The `None` user row is malformed data — inserting a config for `None` makes it worse | Skip `None`; handle as F-08 case |

## 4. F-08 — Orphaned configs

### Proposed change
- Cross-check each orphan's `restaurant_id` field against POS `restaurant-info` to confirm they're stale references.
- Delete or archive-move the 9 orphans:
  - Malformed IDs (`pos_0001_restaurant_478`, `demo-user-restaurant`, `''`, etc.) → delete.
  - Valid but user-less IDs → move to a `customer_app_config_archived` collection for audit.

### Risks
| # | Risk | Mitigation |
|---|---|---|
| R1 | The orphan is actually a legit config waiting for admin onboarding | Cross-check with the operator/product team |
| R2 | Deleting the empty-string `''` config could break a query that reads it as fallback | `grep -rn "restaurant_id.*''\|restaurant_id\\s*==\\s*['\"][\\s]*['\"]" backend frontend` — audit first |

## 5. F-09 — 709 missing from UAT

### Proposed change
- Determine if UAT is still used. If yes: dump the 709 doc from prod and re-insert into UAT for `db.users` + `db.customer_app_config`.
- If UAT is deprecated: no action needed; document that 709 tests must run against prod.

### Risks
- UAT drift — data in UAT and prod already diverge (28 vs 47 restaurants). This is a persistent pain point, not a one-time fix.

### Adjacent recommendation (out of scope for this CR)
- Set up a scheduled UAT-from-prod refresh (nightly / weekly). Separate P3 CR — infra work.

## 6. F-10 — Double-slash in logo URLs

### Evidence
```
d698.logoUrl = 'https://socket.mygenie.online//api/uploads/9156e61f…png'
```

### Root cause (not fully investigated)
Likely a backend service concatenating `base` + `'/'` + `'/api/…'`. Not in this repo — the URL is written by whoever runs the upload endpoint on `socket.mygenie.online`.

### Proposed change (data-side only, since code is not ours)
- Bulk normalization:
  ```js
  db.customer_app_config.find({logoUrl: {$regex: '//api/'}}).forEach(d => {
    db.customer_app_config.update({_id: d._id},
      {$set: {logoUrl: d.logoUrl.replace(/\/\/api\//, '/api/')}});
  });
  ```
- Also fix the same pattern in `banners[].imageUrl` and `backgroundImageUrl` if applicable.

### Risks
| # | Risk | Mitigation |
|---|---|---|
| R1 | Some URLs might legitimately need `//` (e.g., protocol-relative) | Only touch `//api/` patterns, not the schema `://` |
| R2 | The upstream service will re-introduce the double-slash on the next upload | Report to `socket.mygenie.online` maintainer. This CR is a mop-up, not a source fix. |

## 7. F-11 — Booleans as strings

### Evidence
```
d698.restaurantOpen      = 'True'  (string, not bool)
d698.allowNonQrOrders    = 'False' (string, not bool)
```

Frontend `isOn()` helper accepts both `true`/`"true"`/`"True"`/`"yes"`/`1` as truthy. So it works today, but is fragile.

### Proposed change (data + write-path fix)
1. Data migration:
   ```js
   db.customer_app_config.find({restaurantOpen: {$type: 'string'}}).forEach(d => {
     db.customer_app_config.update({_id: d._id},
       {$set: {restaurantOpen: d.restaurantOpen === 'True'}});
   });
   // Same for allowNonQrOrders and any similar fields.
   ```
2. Write-path fix in `backend/server.py` config-save endpoint: coerce string bools to real bools on save. **This IS a code change** — flag as sub-item for later; not part of the DATA-only phase of this CR.

## 8. Files WILL change

### Data phase (this CR)
- **PROD `mygenie_db` collections** — direct writes:
  - `customer_app_config` (F-07, F-08, F-10, F-11 data-side)
  - `users` (F-08 delete branch, if used)
  - `customer_app_config_archived` (new, F-08 archive branch)
- **UAT DB** (F-09) — direct write from prod snapshot.

### Code phase (deferred, separate CR)
- `backend/server.py` (F-11 write-path fix, F-10 sanitizer on upload response) — out of scope for THIS CR.

## 9. Files WILL NOT touch (in this CR)
- Any source code
- Any `.env`
- MyGenie POS admin (not our repo)

## 10. Verification matrix

| Test | Before | After |
|---|---|---|
| `db.users.aggregate` join `customer_app_config` count | 15 users w/o config | 0 (F-07 seed) |
| `db.customer_app_config.aggregate` join `users` count | 9 orphans | 0 (F-08 archive/delete) |
| `db.customer_app_config.find({logoUrl: /\/\/api\//})` | 40+ hits | 0 (F-10) |
| `db.customer_app_config.find({restaurantOpen: {$type:'string'}})` | 30+ hits | 0 (F-11 data phase) |
| UAT `db.users.find({restaurant_id:'709'})` | 0 | 1 (F-09) |
| Customer app for any of the 15 restaurants after F-07 seed | broken theme | default theme loads |
| Existing customer flows for 698 / 716 | working | unchanged |
| Existing admin flows for 698 / 716 | working | unchanged |

## 11. Owner decisions

1. **Approve seeding default `customer_app_config` for the 15 partial restaurants?** Or should they be paused/deleted instead?
2. **Approve archive/delete of the 9 orphans?** Confirm with operator team which are legit-in-progress vs stale.
3. **UAT strategy** — refresh from prod (F-09 done via snapshot), or accept drift?
4. **Coordinate F-10 upstream fix** with whoever owns `socket.mygenie.online` upload path.
5. **Approve F-11 data migration**, and file the write-path code fix as a follow-up CR.

## 12. Effort
- F-07 seed: 30 min (bulk insert script)
- F-08 audit + archive/delete: 1-2 hours (needs owner cross-check per orphan)
- F-09 seed from prod: 30 min
- F-10 bulk normalize: 15 min
- F-11 data migration: 15 min
- Total: half-day + owner coordination time

## 13. Non-goals

- Write-path code fixes (F-10 upstream service, F-11 backend save-endpoint coercion) — deferred to separate CR.
- Introducing a schema-validation layer (`bsonschema` / `pydantic` on read) — separate initiative.
- Introducing a scheduled UAT refresh job — separate infra CR.

## 14. Safety protocol for the data phase

1. **Snapshot first.** Take an Atlas snapshot of `mygenie_db` immediately before any bulk write.
2. **Dry-run every query in a Mongo shell with `.explain()` or `.count()` first** to validate the filter matches the expected count.
3. **Run each sub-task in its own change window** (F-07 → verify → F-08 → verify → ...). Do not batch.
4. **Rollback:** restore from the pre-change snapshot.
