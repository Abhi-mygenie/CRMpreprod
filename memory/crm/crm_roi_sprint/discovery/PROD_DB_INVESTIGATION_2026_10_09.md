# Production DB Investigation Report
**Date**: 2026-10-09 · **Role**: Investigation Agent · **DB**: Production (`mygenie_db` via read-only user) · **No code changes. No data writes.**

---

## Connection confirmed
- `MONGO_URL`: `mongodb+srv://mygenie_mongo_readonly@mygenie.xdqqdpi.mongodb.net/mygenie_db`
- Backend: `Application startup complete` (index creation skipped — read-only user, expected)

---

## Baseline

| Collection | Count |
|---|---|
| customers | 24,068 |
| orders | 325,806 |
| coupons | 17 |
| loyalty_settings | 89 |
| users | 89 |
| points_transactions | 11,623 |
| feedback | 19 |
| invoices | 49,994 |

---

## Finding 1 — Junk phones: **71 records**

- **First**: 2023-07-12 · phone `5555555555`
- **Last**: 2026-09-30 · phone `0000000000`
- **Top tenants**: r541 (13) · r383 (5) · r595 (4) · r523/478/509/661/788/408 (3 each) · 15 more tenants

**Action (CR-085-B):** Set `phone_invalid: true` on 71 docs. No deletion. Orders preserved.

---

## Finding 2 — Duplicate customer groups: **44 groups**

Original 44 estimate was correct for production (preprod had only 2 because it was a partial dump).

Key groups with real data:
- `+91 7505242126` @ **Brew** — "abhi" (1 visit, 2023) vs blank (2026)
- `+91 9876500001` @ **18march** — "Customer 2" (243 pts, 10 visits) vs "Test User" (100 pts)
- `+91 8369699265` @ **Jeh's Nest** — "jayshree" (22 visits) vs "jayshree" (0 visits)

Most duplicates: 0 points, 0 visits — safe to merge/delete.

**Restaurants most affected**: Jeh's Nest (6 groups) · Brew (5 groups) · Cafe Flora (2 groups)

**Action (CR-087):** Dry-run report per tenant → owner sign-off → keep-oldest, transfer data, delete extras.

---

## Finding 3 — Null/empty country_code: **609 total**

| Type | Count |
|---|---|
| `country_code: null` | 327 |
| `country_code: ""` | 282 |
| **Total** | **609** |

CR-100 code fix handles lookup correctly. Data itself needs cleaning in CR-085-B.

**Action (CR-085-B):** Set `country_code: "+91"` where null/empty (India-only confirmation needed per owner).

---

## Finding 4 — Orphan orders: **218,507 / 325,806 (67.1%)** ⚠️ LARGEST FINDING

| Metric | Value |
|---|---|
| Total orders | 325,806 |
| `customer_id: null` | **218,507** (67%) |
| All have phone (linkable) | ✅ 218,507 |
| **Invisible revenue** | **₹9,77,81,979 (~₹9.78 crore)** |

Top 5 tenants by orphan order count:

| Restaurant | Orphan orders | Invisible revenue |
|---|---|---|
| Pav & Pages Book Cafe | 67,688 | ₹96,78,136 |
| Cold Rock Cafe | 19,301 | ₹64,25,916 |
| **CAFE 103** | **15,865** | **₹1,62,83,928** |
| The Palm House | 14,871 | ₹96,93,888 |
| The Craft Restaurant | 12,976 | ₹45,90,803 |

**Action (CR-086 + CR-087):** Run customer sync for affected tenants → link orphan orders after customers imported.

---

## Finding 5 — Coupon trailing spaces: **0** ✅

Production coupons are already clean. CR-108 fix not yet deployed to prod but prod data is clean.

---

## Finding 6 — Batch CRs not yet deployed to prod (expected)

| CR | What | Status |
|---|---|---|
| CR-082 | `requires_customer` field on coupons | ❌ Not deployed — defaults to `True` (backward compat ✅) |
| CR-104 | Feedback bonus txns | ❌ Not deployed — 0 bonus txns in prod |
| CR-109 | `.strip().upper()` at coupon write | ❌ Not deployed — but prod data already clean |
| All other batch CRs | Code changes | Not deployed — preprod only |

---

## Finding 7 — Mygenie tokens: **ALL 89 stale** ⚠️

All 89 production restaurants have stale/non-`dp_live_` tokens. Customer sync will fail for any tenant. CR-110 refresh script must be run against production before any customer sync attempt.

**Action**: Run `/app/scripts/push_and_refresh_tokens.py` against prod with owner password confirmation.

---

## Summary for data cleanup (CR-085-B → CR-087 → CR-101)

| Item | Prod count | Action |
|---|---|---|
| Junk phones | 71 | Flag `phone_invalid:true` |
| Duplicate groups | 44 | Merge — dry-run first |
| Null/empty cc | 609 | Set `country_code:"+91"` |
| Orphan orders | 218,507 (₹9.78 cr) | Link after customer sync |
| Coupon spaces | 0 | Already clean |
| Stale tokens | 89/89 | Run CR-110 on prod |

---
*Investigation complete — read-only. Zero writes performed.*
