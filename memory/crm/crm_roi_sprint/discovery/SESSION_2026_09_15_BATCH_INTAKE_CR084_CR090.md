# SESSION 2026-09-15 — BATCH INTAKE (from INV-017 + INV-018) — CR-084 → CR-090

**Role:** INTAKE (registration only — zero code changes)
**Source:** Customer App contract request `inbox/CRM_CONTRACT_VERIFICATION_REQUEST.md` (ref INV-2026-09-15-001) → `investigations/INV_017_CUSTOMER_APP_CONTRACT_GAPS.md` + `investigations/INV_018_ORDER_LINKAGE_GAPS.md`
**Evidence basis:** code (`routers/scan.py`, `routers/pos.py:636-712`, `routers/migration.py:188-231`, `core/auth.py`, `customers.py:110-116`) + live preprod Mongo aggregates + live probe of `crm.mygenie.online`
**Owner context:** these gaps surfaced while the Customer App team prepares its next integration phase ("wave 2" — term is the Customer App team's; not defined in CRM docs).

All root causes were confirmed in INV-017/018, so each item enters the register with evidence attached. Items that are Customer-App-side or POS-side only (GAP-01/02/03/07/08/10) are **not** registered as CRM CRs — they are handed over via the INV-017 reply + contract docs.

---

## 0. Summary board

| CR | Title | Type | Sev | Risk | Effort | Gap(s) | Blocks Customer App next phase? |
|---|---|---|---|---|---|---|---|
| **CR-084** | Remove `dev_otp` from non-dev `request-otp` responses | BUG (security) | **P1** | HIGH (auth-adjacent, `scan.py`) | ~20 min | GAP-05 | **YES** — anyone can mint a customer token for any phone |
| **CR-085** | Canonical phone normalisation at every entry point | CR | **P1** | **CRITICAL** (`pos.py` customer identity — hotspot) | ~4 hrs | GAP-14 | **YES** — format mismatch = empty profile / 0 orders in app |
| **CR-086** | Migration/sync creates customers for unknown phones (parity with realtime) | BUG | P1 | HIGH (`migration.py`) | ~1.5 hrs | GAP-13 | Recommended (history completeness) |
| **CR-087** | Backfill orphaned orders + merge duplicate customers (dry-run first) | DATA CR | P1 | **CRITICAL** (production data write) | ~3 hrs + owner review | GAP-13/14 | Recommended; **conflicts with sprint rule "no historical backfill approved"** → owner decision |
| **CR-088** | `/scan/*` list hygiene: `skip` pagination, consistent `total`, `expiring_soon`, expose `/api/openapi.json` | CR | P2 | LOW–MEDIUM (`scan.py`, `server.py`) | ~2 hrs | GAP-12, P-2, P-3, P-6 | No (app can adapt) |
| **CR-089** | `skip-otp` guard rails (rate-limit + `Retry-After`, password-holder handling) | CR (security) | P2 | MEDIUM (auth) | ~1.5 hrs | GAP-06 | Owner decision |
| **CR-090** | Customer OTP delivery provider + customer forgot/reset-password | CR | P2 | HIGH (auth + new integration) | TBD (provider-dependent) | GAP-04, GAP-05 (delivery half) | No — app keeps OTP/forgot-password hidden |
| — | FastAPI version drift live vs repo (401/403), GAP-11 | Backlog / owner question | P3 | MEDIUM (dependency bump) | — | GAP-11 | No |

**Recommended order:** CR-084 → CR-085 → CR-086 → CR-087 (dry-run) → CR-088 · CR-089/090 after owner decisions.

---

## 1. CR-084 — Remove `dev_otp` from `POST /scan/auth/request-otp` outside dev

- **Classification:** BUG · **Severity: P1** · **Risk: HIGH** (auth-adjacent; `scan.py` not a listed hotspot but auth flow requires owner approval per addendum §14)
- **Symptom:** `request-otp` returns `data.dev_otp` (the 6-digit code) in every environment, including live `crm.mygenie.online`. Combined with `verify-otp`, anyone can obtain a 24h customer JWT for any phone without owning it.
- **Root cause (CONFIRMED, INV-017 GAP-05):** `routers/scan.py:224-227` — comment says "DEV MODE", but there is no env gate; no SMS/WhatsApp provider is wired (grep: zero provider calls in `scan.py`; env has only AuthKey WhatsApp keys).
- **Fix direction (for Planning):** gate on `OTP_DEV_MODE=true` (new env var, default off); when off, omit `dev_otp` and keep server-side log at DEBUG level or masked. Keep 429 cap. Do **not** wire delivery here (that's CR-090).
- **Duplicate check:** DISTINCT — CR-047/048/053/056 (audit auth hardening) do not cover the scan OTP surface.
- **Code reality:** PARTIAL — route + rate-limit exist; only the gate is missing.
- **Blast radius:** SMALL (1 file, 1 route). Customer App has OTP login quarantined, so no live consumer breaks.
- **Evidence:** live probe `POST /api/scan/auth/request-otp` (INV-017 step 8); `scan.py:227`.
- **Owner questions:** none. Approval needed only because auth-adjacent.

## 2. CR-085 — Canonical phone normalisation at every entry point

- **Classification:** CR (data integrity) · **Severity: P1** · **Risk: CRITICAL** (`routers/pos.py` `_find_or_create_customer` = customer identity/merge rules; addendum §14 do-not-change without approval)
- **Symptom:** Same person stored twice per tenant (`9876543210` vs `+919876543210`); orders split across records (31 of 38 duplicate groups). Customer App `skip-otp` with a format different from POS silently creates a new empty customer → `/scan/orders` returns 0.
- **Root cause (CONFIRMED, INV-018 GAP-14):** exact-string phone matching everywhere; zero normalisation in `pos.py:673-676`, `migration.py:217-221`, `scan.py:309/369/419/206`, `/pos/customer-lookup`, `/pos/customers`. Only `customers.py:110-116` (CSV import) normalises.
- **Canonical form (de-facto from code, INV-018 §4.1):** `phone` = exactly 10 digits, digits only; `country_code` = `"+91"` separate field.
- **Fix direction (for Planning):** one helper `normalize_phone()` in `core/helpers.py` reusing the CSV-import rule (strip spaces/`-`/`+`; drop leading `91` if 12 digits; drop leading `0` if 11 digits); apply at all write/lookup points above; store raw value in `phone_raw` for audit; lookups query canonical `phone`. Reject (422 / `success:false`) values still not 10-digit — or quarantine per Q2.
- **Duplicate check:** DISTINCT — CR-035 (import) introduced the rule for CSV only. No CR covers POS/scan/migration normalisation.
- **Code reality:** PARTIAL (rule exists in one place).
- **Blast radius:** LARGE — every customer create/lookup path (POS realtime, migration, scan auth, POS lookup/create). Regression: full POS order flow, customer create/merge, scan auth, WhatsApp send (country_code + phone concat).
- **Evidence:** INV-018 §1 histograms (customers: 238 non-10-digit; orders: 2,322 non-10-digit non-empty), 38 duplicate groups.
- **Owner questions:**
  - **Q1** Non-Indian numbers: (a) India-only — strip to 10 digits, hard-reject others · (b) support E.164 — keep national digits + real `country_code` per record
  - **Q2** Values that remain invalid after normalisation (junk like 1–3 chars): (a) reject the create/order with clear error · (b) accept order, store customer with `phone_invalid=true`, exclude from WhatsApp
  - **Q3** Should POS also be asked to normalise on their side (belt-and-braces)? (recommended yes — see INV-018 §5 Q5)

## 3. CR-086 — Migration/sync creates customers for unknown phones

- **Classification:** BUG · **Severity: P1** · **Risk: HIGH** (`routers/migration.py`; creates customer docs → downstream loyalty/analytics counts)
- **Symptom:** 3,517 migrated orders have a phone but `customer_id: null`; ~98% of those phones have no customer record at all.
- **Root cause (CONFIRMED, INV-018 GAP-13):** `migration.py:210-225, 304` — looks up by `pos_customer_id` then exact phone; if not found writes `customer_id: None`. Realtime path (`pos.py:665-712`) creates the customer.
- **Fix direction (for Planning):** call the same find-or-create helper as realtime (after CR-085 normalisation), with `first_visit_bonus` suppressed for historical imports; set `customer_id` on the order.
- **Duplicate check:** DISTINCT — CR-075 (hotel doc migration) touches the same file but different concern.
- **Code reality:** PARTIAL (lookup exists, create missing).
- **Blast radius:** MEDIUM — new customer docs per tenant; affects customer counts/analytics; no financial writes if bonus suppressed.
- **Evidence:** INV-018 §1 (3,517 all `mygenie_synced`, 0 realtime).
- **Owner questions:** **Q1** Customers created from historical orders: (a) Bronze, 0 points, no bonus, `source:"migration"` · (b) also back-compute `total_visits`/`total_spent` from their orders (overlaps CR-087)
- **Dependency:** after CR-085 (otherwise creates more format duplicates).

## 4. CR-087 — Backfill orphaned orders + merge duplicate customers

- **Classification:** DATA CR (one-off script, `backend/scripts/`) · **Severity: P1** · **Risk: CRITICAL** (production/preprod data write; irreversible without backup)
- **Scope:** (a) link 3,517 phone-present orphan orders to customers (by `pos_customer_id`, else canonical phone; create via CR-086 rule if none); (b) merge 38 duplicate customer groups (45 extra records): keep oldest/POS-linked record, re-point orders/points/wallet/coupon_usage/addresses, sum `total_visits/total_spent/total_points`, write `customer_merge_log`.
- **Out of scope:** 44,682 orders with empty `cust_mobile` — unlinkable by anyone (POS/cashier data).
- **Root cause:** consequence of GAP-13 + GAP-14.
- **Fix direction (for Planning):** Phase A dry-run report only (counts + sample, no writes) → owner sign-off → Phase B write with backup + `--tenant` scoping + idempotency.
- **Duplicate check:** DISTINCT. ⚠️ **Conflicts with sprint rule** `00_register/ROI_MEASUREMENT_CR_REGISTER.md §1: "No historical backfill / migration is approved."` → owner must explicitly lift for this CR.
- **Code reality:** NONE.
- **Blast radius:** LARGE (customers, orders, points_transactions, wallet_transactions, coupon_usage across all tenants).
- **Evidence:** INV-018 §1.
- **Owner questions:** **Q1** Lift the "no historical backfill" rule for CR-087? · **Q2** Run per-tenant (start with 689) or all tenants? · **Q3** Merge policy when both duplicates have points/wallet: sum (recommended) vs keep-max
- **Dependency:** after CR-085 + CR-086 are live (else backfill is re-polluted).

## 5. CR-088 — `/scan/*` list hygiene + OpenAPI exposure

- **Classification:** CR · **Severity: P2** · **Risk: LOW–MEDIUM** (`scan.py` read routes; `server.py` openapi url)
- **Items:** (a) `skip` query param on `/scan/orders`, `/scan/points/history`, `/scan/wallet/history` (cap 50 kept); (b) `total` = `count_documents` on all three (today ledgers return rows-returned — GAP-12); (c) `expiring_soon` in `/scan/loyalty` reusing staff `points/expiring` logic; (d) serve OpenAPI at `/api/openapi.json` (`FastAPI(openapi_url="/api/openapi.json")`) — GAP-09.
- **Root cause:** feature gaps confirmed INV-017 GAP-09/12, P-2/P-3/P-6; Customer App D4 finding.
- **Duplicate check:** DISTINCT.
- **Code reality:** PARTIAL (routes exist; params/fields missing).
- **Blast radius:** SMALL — additive, backward compatible.
- **Owner questions:** none (Customer App confirmed they can adapt meanwhile).

## 6. CR-089 — `skip-otp` guard rails

- **Classification:** CR (security) · **Severity: P2** · **Risk: MEDIUM** (auth flow → owner approval)
- **Symptom:** `POST /scan/auth/skip-otp` issues a 24h customer token for any phone + restaurant_id; no rate limit, no `Retry-After`, no 409/`success:false` for customers who already set a password.
- **Root cause (CONFIRMED, INV-017 GAP-06):** `scan.py:303-348` — by design (frictionless QR flow).
- **Fix direction (for Planning):** per-phone+tenant limiter (e.g. 5/10 min → 429 + `Retry-After`), optional `password_required` response when `password_hash` exists.
- **Duplicate check:** DISTINCT.
- **Blast radius:** SMALL–MEDIUM — Customer App's only live login; must coordinate before enabling password-holder block.
- **Owner questions:** **Q1** Accept current risk (register as ⏸ parked) vs implement? · **Q2** If implement: rate-limit only (a) or also block password-holders (b)?

## 7. CR-090 — Customer OTP delivery + forgot/reset-password

- **Classification:** CR (new integration) · **Severity: P2** · **Risk: HIGH** (auth + third-party provider)
- **Scope:** choose/wire an OTP delivery channel for `request-otp` (options: AuthKey SMS, WhatsApp OTP template via existing AuthKey tenant key, other DLT SMS provider) → then `POST /scan/auth/forgot-password {phone, restaurant_id}` + `POST /scan/auth/reset-password {phone, otp, new_password, restaurant_id}`.
- **Root cause:** GAP-04/05 — never built; OTP path was left in dev mode.
- **Duplicate check:** RELATED to CR-016 (multi-channel events, deferred) — DISTINCT scope (transactional OTP, not marketing).
- **Code reality:** NONE for delivery/reset; OTP storage + verify exist.
- **Blast radius:** MEDIUM — new provider integration; per-tenant vs platform-level credentials decision.
- **Owner questions:** **Q1** Channel: (a) WhatsApp OTP template via tenant AuthKey (no new vendor) · (b) SMS via AuthKey · (c) other · **Q2** Platform-level or per-tenant sender? · **Q3** Priority vs wave-2 — Customer App confirms it can ship without OTP/forgot-password.
- **Status:** 🔴 Blocked on Q1.

## 8. Not registered (handed over, not CRM code)

| Gap | Owner of fix | Where documented |
|---|---|---|
| GAP-01/02/03 wrong paths + field mapping | Customer App | `INV_017_CRM_CONTRACT_REPLY_TO_CUSTOMER_APP.md`, `INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` |
| GAP-07 JWT claim `restaurant_id` | Customer App | same |
| GAP-08 error convention | documented rule | same |
| GAP-10 / DATA-A 44,682 orders with no phone | POS / cashier process | `INV_018 §5` (POS brief Q1–Q3) |
| GAP-11 FastAPI drift live vs repo | owner (deployment provenance) → out-of-sprint backlog | `INV_017 GAP-11` |

---

## 9. "Must these be fixed before Customer App wave 2?" — Intake recommendation

"Wave 2" is not defined in CRM docs; read as the Customer App's next integration phase (orders/points/wallet tabs + auth polish).

| Blocking | Why |
|---|---|
| **CR-084** | Security hole reachable today on live; fixing is 20 min. Ship first regardless of wave. |
| **CR-085** | Without it, any format mismatch between POS and app = customer sees empty profile with 0 orders — that is exactly the wave-2 feature. **Blocker.** |
| CR-086 + CR-087 | Not strictly blocking for the app to *function*, but without them ~3.5k historical orders and 38 duplicate customers stay invisible/split — users will report "missing orders". **Strongly recommended before wave-2 UAT sign-off**; CR-087 needs the sprint rule lifted. |
| CR-088 | Nice-to-have; app can hide "expiring soon" and live without `skip` at cap 50. |
| CR-089 | Owner risk decision; not blocking. |
| CR-090 | Not blocking — app ships with OTP/forgot-password hidden. |

```text
Intake complete: CR-084, CR-085, CR-086, CR-087, CR-088, CR-089, CR-090
Classification: BUG ×2 (084, 086) · CR ×4 (085, 088, 089, 090) · DATA CR ×1 (087)
Severity: P1 ×4 (084, 085, 086, 087) · P2 ×3 (088, 089, 090)
Risk: CRITICAL ×2 (085, 087) · HIGH ×3 (084, 086, 090) · MEDIUM ×1 (089) · LOW–MEDIUM ×1 (088)
Duplicate check: all DISTINCT (087 conflicts with sprint no-backfill rule — owner decision)
Evidence: captured (INV-017, INV-018, live probes, DB aggregates)
Blast radius: 085/087 LARGE · 086 MEDIUM · 084/088/089 SMALL · 090 MEDIUM
Docs updated: this file · CR_STATUS_DASHBOARD.md (board rows + transitions) · 00_register/ROI_MEASUREMENT_CR_REGISTER.md · PRD.md
Open owner questions: CR-085 Q1–Q3 · CR-086 Q1 · CR-087 Q1–Q3 · CR-089 Q1–Q2 · CR-090 Q1–Q3
Next: Planning for CR-084 (no questions) and CR-085 (after Q1–Q3) — owner approval required (auth-adjacent / CRITICAL hotspot)
```
