# Per-Restaurant Breakdown — Owner Q&A 2026-10-10 (PRODUCTION DATA, read-only)
**Source**: prod `mygenie_db` read-only probes (`/tmp/probe4.py`, `/tmp/probe5.py`) · **No writes.** Companion to `PROD_DB_INVESTIGATION_2026_10_09.md` (totals) and `BATCH_FIX_RECURRENCE_VALIDATION_2026_10_10.md` (code behaviour).

---

## Q1 — The ₹2.15 cr "recoverable" orphan orders: which restaurants

Recoverable = `customer_id:null` **and** `pos_customer_id` present (9,924 orders). 27 restaurants; **top 8 hold 97% of the value**.

| Restaurant | uid | Orders | Value | Distinct POS customers on those orders | …already in CRM today | CRM customers total | Last customer_sync | Order dates |
|---|---|---|---|---|---|---|---|---|
| **Bamboo Yoga** | r196 | 975 | **₹1.64 cr** | 871 | 0 | 7 | **never** (last login 2026-03-15) | 2024-11 → 2026-02 |
| The Palm | r666 | 951 | ₹10.5 L | 595 | 0 | 125 | 2026-06-08 ✓ | 2025-11 → 2026-06 |
| The Palm House | r541 | 1,528 | ₹10.3 L | 374 | 0 | 540 | 2026-07-29 ✓ | 2025-08 → 2026-07 |
| Palm Aryan | r628 | 1,512 | ₹9.2 L | 1,271 | 0 | 59 | 2026-06-05 ✓ | 2025-10 → 2026-06 |
| Palm Aryan Mussoorie01 | r665 | 1,332 | ₹9.0 L | 921 | 0 | 373 | 2026-06-08 ✓ | 2025-11 → 2026-06 |
| Welcome Resort | r474 | 1,495 | ₹5.6 L | 1,004 | 0 | 64 | 2026-08-24 **failed 401 @ page 147** | 2025-03 → 2025-10 |
| G SQUARE | r661 | 520 | ₹1.8 L | 425 | 0 | 168 | 2026-06-06 ✓ | 2025-10 → 2026-06 |
| **Brew** | r699 | 1,128 | ₹1.6 L | 391 | **391 (100%)** | 995 | 2026-08-12 ✓ | 2026-03 → 2026-04 |
| 18march | r478 | 63 | ₹46 k | 36 | 0 | 91 | never | |
| Pav & Pages Cafe | r509 | 132 | ₹45 k | 92 | 0 | 552 | never | |
| CAFE 103 | r644 | 21 | ₹23 k | 7 | 0 | 488 | 2026-10-10 ✓ | 2026-06 → 07 |
| 16 more (Five star, mantri, LSD, Mayur's, Pav&Pages Book, Nirwanderers, Food Mohalla, 11 The Cafe, Palm Aryan Gangtok, ONE BITE, Craft, Hogwarts, Humsafar, Sattvik, Hungry Keya, Jeh's Nest) | | 282 | ₹1.4 L | | | | | |

**Three different situations hide in this table:**

| Situation | Restaurants | Fix |
|---|---|---|
| **A. Customer exists in CRM, order never re-linked** | Brew (391/391 — orders came Mar–Apr, customers synced Aug; order ids stored as int vs str) | One-time backfill (CR-087) — zero POS involvement |
| **B. Customer master never pulled** | Bamboo Yoga (₹1.64 cr, never synced, dormant since Mar-2026), 18march, Pav & Pages Cafe, mantri, LSD, Mayur's, Humsafar | Restaurant logs into CRM → run customer sync → backfill. Bamboo Yoga alone is **76% of the recoverable value** (avg bill ₹16,850 — retreat/folio bills) |
| **C. Customer sync *completed* but these POS customers are NOT in it** ⚠️ NEW | The Palm, Palm House, Palm Aryan ×2, Welcome Resort, G SQUARE (0 matches despite completed sync; only 3/125 Palm House phones match, and with *different* POS ids) | **POS question P-15**: `order.user_id` and `/customer/list.id` appear to be two different ID spaces (or `/customer/list` omits guest/walk-in users). Until POS answers, these ~₹46 L cannot be linked by id — only by phone, and the phones are mostly not in CRM either |

---

## Q2 — Which restaurants / customers need segregation for restaurant validation (CR-085-B report-first)

Applying the **full CRM phone rule** (`normalize_phone`: 10 digits, starts 6–9, not all-same) to prod gives **630 invalid-phone customers**, not 71 — because the rule also catches foreign numbers stored without `+cc`, 9/11/12-digit typos and short garbage. These need **different treatment**, so the per-restaurant sheet must carry a *category*:

| Category | Example | Proposed action | Needs restaurant eyes? |
|---|---|---|---|
| J — junk pattern | `0000000000`, `1000000000`, `1234567890` | flag `phone_invalid` | No |
| F — foreign number without cc | `447821620445` (UK), `4915128755537` (DE), `971558220798` (UAE) | **re-parse**: prefix `+`, split cc → valid foreign customer (Palm House 54, Cafe Flora 3, Brew, G Square, Palm Aryan) | Yes — confirm country |
| T — typo / 9- or 11-digit Indian | `882651924`, `93171936211`, `91941807758` (`91`+9 digits) | flag; restaurant may correct | Yes |
| S — short garbage / room numbers | `502`, `105`, `280`, `4062`, `123` | flag; probably "room"/"table" typed in phone field (Craft, Cold Rock, Prasadam) | Yes — tell cashier |
| B — blank phone (78, one per tenant) | legacy `Customer ` `phone:""` auto-created by old realtime code | keep as system guest bucket or delete after CR-085-A2 deploy | No |

Per-restaurant counts (top 20 by total; full 79-tenant table in `/tmp/probe4.out` §Q2 — to be regenerated as the CR-085-B deliverable):

| Restaurant | uid | Invalid phone (from POS / with activity) | Dup groups (true / with pts-visits) | Null cc | Blank |
|---|---|---|---|---|---|
| **Jeh's Nest** | r635 | 6 (4 / 2) | **97 (94 / 77)** | **184** | 1 |
| **Kunafa Mahal** | r689 | 47 (43 / 30) | 47 (0 true — all cc-twins / 46) | 135 | 1 |
| **The Palm House** | r541 | **174 (120 / 151)** — mostly category F/T (tourists) | 0 | 0 | 1 |
| MyGenie Sales | r792 | 0 | 0 | 143 | 0 |
| Fun Food Frenzy | r687 | 1 | 0 | 77 | 1 |
| CAFE 103 | r644 | 22 (21 / 17) | 16 (0 true — cc-twins / 16) | 31 | 1 |
| LSD Fried Chicken | r475 | 61 (61 / 59) | 0 | 0 | 1 |
| Cafe Flora | r698 | 39 (36 / 34) | 12 (12 / 2) | 0 | 1 |
| The Craft Restaurant | r595 | 38 (35 / 33) | 0 | 0 | 1 |
| Aura | r788 | 37 (18 / 37) — 19 are 9-digit typos | 0 | 0 | 1 |
| Brew | r699 | 17 (16 / 0) | 9 (9 / 1) | 0 | 1 |
| Pav & Pages Book Cafe | r383 | 24 (24 / 23) | 0 | 0 | 1 |
| The Mill Bakery(2) | r640 | 18 (18 / 2) | 0 | 0 | 1 |
| Hungry Keya?? | r634 | 10 (9 / 7) | 0 | 6 | 1 |
| Pav & Pages Cafe | r509 | 15 (14 / 14) | 0 | 0 | 1 |
| 18march | r478 | 13 (9 / 12) | 1 | 0 | 1 |
| The Five Ridge | r851 | 0 | 0 | 11 | 1 |
| mantri | r675 | 10 (10 / 6) | 0 | 0 | 1 |
| Picolo dreams / Food Mohalla / G SQUARE | | 7 each | 0 | 0 | 1 |
| **Totals (79 tenants)** | | **630** (≈540 from POS master) | **187** (118 true + 69 cc-twins) | **609** | **78** |

**Who must validate what:**
- **Jeh's Nest** (r635): 94 true duplicates with points/visits on both sides → the only restaurant where a wrong merge loses real loyalty data → **restaurant sign-off per group**. Cause: 6 CSV uploads on 2026-07-14 / 08-09 (see Q4).
- **Kunafa Mahal** (r689) + **CAFE 103** (r644): dups are all cc-twins (`""` vs `+91`) → safe system merge after cc fix, **no restaurant time needed**; 47 + 22 invalid phones from POS master → send list to cashier.
- **The Palm House / Cafe Flora / Palm Aryan / Brew / G Square**: category F foreign numbers → CRM can auto-fix by re-parsing; restaurant only confirms country for ambiguous ones.
- **LSD, Craft, Aura, Pav & Pages ×2, Mill Bakery, mantri**: junk/typo/room-number phones that came **from the POS master** → restaurant corrects in POS, else they re-import on every sync.
- **Null cc (609)**: Jeh's Nest 184 + MyGenie Sales 143 (both CSV importer), Kunafa 135, Fun Food Frenzy 77, CAFE 103 31 → **system fix to `+91`, no restaurant time** (owner India-only ruling pending).

---

## Q3 — Solution proposed (short form; details in recurrence doc §2)

| Step | What | Who | When |
|---|---|---|---|
| 1 | Deploy the batch (CR-085-A/A2, 100, 109…) to prod — stops new null-cc, new junk, new blank-phone customers today | CRM | after owner smoke + closure |
| 2 | **CR-111** importer uses `normalize_phone` + `phone_match` (owner: "we should validate at our side" ✅) | CRM | next batch |
| 3 | **CR-085-B report-first**: generate per-restaurant customer-level sheets with the J/F/T/S/B category above + dup groups + null-cc; restaurants validate only J/T/S and Jeh's Nest dup groups | CRM → owner → restaurants | end of batch |
| 4 | **CR-085-B / CR-087 writes**: cc → `+91`; F re-parse; flag J/T/S; merge twins (system) and Jeh's dups (signed-off); backfill Brew-type orphans by `pos_customer_id` | CRM | after 3 |
| 5 | **Order-sync orphans**: owner ruled anonymous bills are *fine* (not everyone gives details) ✅. Remaining choice: (a) do nothing beyond backfill; (b) CR-086 Part C stub-create when `pos_customer_id` present. Blocked on **P-15** (ID-space question) for the Palm-group ₹46 L | owner + POS | owner decision |
| 6 | **Concurrent duplicates** → owner: handle in POS contract + prove with logs. CRM adds a **daily data-quality job** (`cron_job_logs`) that counts new dup groups / flagged phones / guest orders / unlinked sync orders per tenant and stores the row → "did it leak today?" becomes a query, not an investigation. Unique index (G-2) stays as the eventual hard stop after cleanup | CRM (CR-113) + POS contract | next batch |
| 7 | Token / dormant tenants (Q5) → re-scope CR-110; ask POS for server-to-server sync credential (P-8) | CRM + POS | next batch |

---

## Q4 — CSV importer: who used it, what it caused

Only **2 restaurants** have ever used the CRM CSV importer (`import_logs`, 7 uploads):

| Restaurant | Uploads | Files | Rows | Consequence visible on prod |
|---|---|---|---|---|
| **Jeh's Nest** (r635) | 5 | `Jehs_Customer_uat.xlsx`, `customers_export_2026_07_14.xlsx` ×3, `customers_export_2026_08_09.xlsx` | 346 / 374 / 339 / 339 / 114 | **94 true duplicate groups created 2026-07-14** (same file uploaded twice at 11:31 and 11:34), **184 null-cc** docs, 1 junk `9999999999 Noname` |
| **MyGenie Sales** (r792) | 2 | `import_template (1).csv`, `import_template (2).csv` | 94 / 50 | **143 null-cc** docs (internal/test tenant) |

So the importer is the sole cause of Jeh's Nest's duplicate problem and of 327 of the 609 null-cc docs. The duplicate hole (re-upload of the same file) was closed by BUG-013 (in-file dups rejected) + existing-phone → update, and cc by CR-085 W11; the **junk-phone hole (G-1) is still open** → CR-111.

CRM-originated invalid phones (no `pos_customer_id`, i.e. importer / CRM UI / old realtime auto-create) — ~90 docs, by restaurant: The Palm House 54 (all foreign numbers, category F), Aura 19 (9-digit typos), 18march 4, Kunafa 4, Cold Rock 4 (`4062`, `1878` — short), NI HAO 4, Curry's Lounge 4, Craft 3 (`502`, `105`, `209` room numbers), Sattva 3 (`1000000000`…), Cafe Flora 3 (F), Jeh's Nest 2, Palm Aryan 2, Dream of Goa 2, and 1 each for 11 others. Everything else invalid (~540) came from the **POS master via sync**.

---

## Q5 — "If they never log into CRM they never get customer data": which restaurants

Precise statement: **realtime orders still flow without any login** (webhook uses `api_key`), and the old realtime code auto-creates a customer for every phone it sees. What a dormant restaurant **misses** is the **POS customer master** (names, emails, DOB, history from before CRM go-live) — that only comes through `customer_sync`, which needs a fresh `mygenie_token` = a CRM login.

**Never ran customer sync + have POS order history (data they are not getting):**

| Restaurant | uid | Last CRM login | CRM customers | Orders in CRM | Realtime orders since Sep |
|---|---|---|---|---|---|
| **LSD Fried Chicken** | r475 | 2026-04-22 | 3,383 | 11,976 | 0 (stopped sending) |
| **Bake & Bite** | r631 | 2026-03-15 | 46 | 9,391 | 0 |
| **Pav & Pages Cafe** | r509 | 2026-07-31 | 552 | 8,880 | 990 |
| Humsafar | r610 | 2026-03-17 | 236 | 3,655 | 0 |
| LV FOODS | r690 | 2026-04-03 | 26 | 3,065 | 0 |
| The SRT Bengal Bites | r623 | 2026-06-05 | 50 | 2,110 | 0 |
| **Chai Chabutra** | r825 | 2026-10-03 | 2 | 1,777 | 1,777 (all walk-in) |
| Militia Eatery Fauji Dhaba | r468 | 2026-08-12 | 3 | 1,557 | 1,058 |
| Mayur's Kitchen | r523 | 2026-10-02 | 36 | 1,199 | 47 |
| Bamboo Yoga | r196 | 2026-03-15 | 7 | 1,064 | 0 |
| mantri | r675 | 2026-10-03 | 56 | 761 | 6 |
| Tropical Taste | r772 | 2026-08-06 | 2 | 600 | 457 |
| Young Monk Cafe | r709 | 2026-04-26 | 33 | 462 | 0 |
| Hyatt | r716 | 2026-08-30 | 1 | 211 | 205 |
| Priti, Cafe 360 AGONDA, The Green Pouch, Burger Bliss, Sutraa, Urban Pizzeria, Ondu plate, Hotel RBS Inn, sunildev, Sattvik Delight | | various | <30 each | <700 each | |

Two sub-groups: **(i) dormant** (last login Mar–Jun 2026, no realtime traffic since Sep: LSD, Bake & Bite, Humsafar, LV Foods, SRT, Bamboo Yoga, Young Monk) — likely churned or POS integration stopped; **(ii) active but never clicked sync** (Chai Chabutra, Militia, Tropical Taste, Hyatt, Mayur's, mantri, Pav & Pages Cafe) — they log in, orders flow, but they have 2–50 customers because everything is walk-in or they never pulled the master. Group (ii) is a **one-click fix** (run sync while logged in); group (i) needs outreach.

**Synced once, then token died (401) — partial data:** Welcome Resort (page 147), The Mill Bakery(2) (page 499), Cutletopia (page 9), Cafe Flora (page 1), Swastik (page 1), Fish n Chips (page 1). Shree Annapoorna: POS 500.

Zero-order tenants (test/demo): The cook, AROMA & U, Jungle Trail, Krunch N Grill (r769), Kashi Sweets, Rolvo, Hyatt Candolim, Pool Cafe, Demo Restaurant & Cafe.

---

## Q6 — Where can I *see* a `phone_invalid` quarantine today?

| Where | Preprod | Prod |
|---|---|---|
| DB: `db.customers.find({phone_invalid: true})` | yes (CR-085-A live) | **0 docs** — code not deployed |
| CRM UI Customers page filter | **no** — the frontend has no `phone_invalid` filter/badge (`grep` → 0 hits in `frontend/src`) | — |
| `GET /api/customers` filter param | **no** | — |
| POS `customer-lookup` | hidden (returns not-found) | — |
| Log file `/var/log/supervisor/backend.err.log` | only the per-record `customer_sync … phone=%r` INFO line (no "flagged" marker) | — |
| `migration_sync_logs` | no flagged counter | — |

→ Today the quarantine is **invisible to staff**. Proposed (fold into CR-113): `flagged_phone_count` on the sync log row, a `phone_invalid` filter + badge on the Customers page, and a WARNING log line per flagged record.

---

## Owner rulings captured 2026-10-10 (for DECISIONS_LOG)
1. CSV importer **must validate at CRM side** → CR-111 approved in principle.
2. Order-sync orphans with no customer details are **acceptable** ("not everyone takes customer details") → anonymous segment closed as not-a-defect; only Brew-type (customer exists) backfill + P-15 answer remain.
3. Concurrent duplicate inserts → **POS contract item** (payload format / idempotency) **+ CRM logs that prove whether leakage still happens** → daily data-quality job (CR-113).
4. Keep all three docs updated as the running record.
