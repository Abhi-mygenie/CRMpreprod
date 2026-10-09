# Investigation Report — INV-2026-07-03-002

**ID:** INV-2026-07-03-002-restaurant-709-provisioning
**Type:** INV (read-only investigation)
**Ran:** 2026-07-03
**Trigger:** Owner reported "restaurant 709 login fails, 716 works"

## Investigation output (per operating prompt §8 Role 6)

```text
Investigation complete: RID-709-LOGIN-FAILURE
Root cause: Restaurant 709 is not provisioned in the UAT MongoDB.
            db.users has no admin document with restaurant_id="709", so
            /api/auth/login (server.py:548-592) reaches Step 3 and
            raises HTTP 404 "Account not found. Please contact restaurant."
Classification: DATA (missing seed) — NOT a code bug
Confidence: HIGH
Steps used: 6/10
Evidence:
  - MongoDB query on 52.66.232.149:27017/mygenie (UAT)
      • db.users.find({restaurant_id: '709'|709}) → 0 docs
      • db.customer_app_config.find({restaurant_id: 709|'709'}) → 0 docs
      • Every one of 29 collections → 0 docs matching 709
  - 28 restaurants seeded in UAT with password_hash present:
      364, 383, 391, 474, 478, 510, 523, 541, 558, 601, 618, 623,
      634, 635, 644, 645, 661, 665, 675, 689, 698, 702, 716, 719,
      739, 759, 762, 836
      → 709 NOT in list
  - db.users.restaurant_id field type is str — no type-mismatch red herring
  - Same DB switched to prod (mygenie_db on Atlas): 709 IS provisioned
    (Young Monk Cafe, email ow***@youngmonk.com, valid bcrypt hash).
Owner decision surfaced:
  Should 709 exist in UAT?
    (a) Yes → seed it from prod
    (b) No  → treat 709 as prod-only
Report: (this file)
Follow-up: none — this is an OPS/DATA decision, no code fix warranted
```

## Files inspected (read-only)

- `/app/backend/server.py` (unified_login, lines 477-592)
- Live MongoDB (`52.66.232.149:27017/mygenie`) via pymongo direct query
- Live MongoDB (`mygenie.xdqqdpi.mongodb.net/mygenie_db`) via same

## Related CRs

- **CR-2026-07-03-008** (Prod DB data quality) F-09 captures the "seed 709 into UAT" data task.

## Non-actions taken

- No code change.
- No DB write.
- No admin credential creation.
