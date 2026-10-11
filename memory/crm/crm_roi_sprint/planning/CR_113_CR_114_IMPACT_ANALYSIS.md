# CR-113 + CR-114 — Impact Analysis: Data-quality logging & visibility · Data-quality snapshot script (+ BUG-028)
**Date**: 2026-10-10 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_10_BATCH_INTAKE_DQ1_CR111_CR117_BUG035_BUG037.md` §1 · **Group**: Wave A / Group 2 (CR-113 + CR-114 + BUG-028) · **Status**: 🟡 IA complete — owner rulings 2026-10-10: Q1 TTL 90 d (default accepted) · Q2 **BUG-038 registered, folded into (b)** · Q3 list only (default) · Q4 file on prod · **scope adds approved: (a) + BUG-039 placeholder-id classification; (a) + persist `pos_customer_id` on realtime order docs** · **No code changed.**

**Owner rulings applied (2026-10-10):** Q1 → CR-113(e) = **100 % sampling, 7-day TTL** on prod. Q2 → CR-114 is a **manually run script, no cron, no API route** this batch. Q10 → 113 + 114 planned together (shared fields).

---

## 1. Code reality (confirmed 2026-10-10)

### 1.1 CR-113(a) — `order_sync` link status · `routers/migration.py:185-317`
```python
209|  customer = None
211|  if pos_customer_id:  customer = find_one({user_id, pos_customer_id ∈ variants})
218|  if not customer and cust_mobile:
219|      _ph, _cc, _ = normalize_phone(cust_mobile)        # status discarded → cannot tell invalid from no-match
220|      customer = find_one(phone_match(user_id, _ph, _cc))
224|  "customer_id": customer["id"] if customer else None,  # no reason recorded (L-1 confirmed)
```
- `migration_sync_logs` row (`:57-73`) has `synced_count / updated_count / failed_count` only. No `unlinked_*` counters. Persisted per page via `_log_sync_progress` (`:523-530`) and at completion (`:544-550`).
- Realtime W1 already writes `guest_order / guest_reason` (`pos.py:1746-1747`) — the pattern to mirror.
- `GET /migration/status` (`:570-645`) exposes `order_sync_breakdown {synced, duplicates_merged, failed}` from the latest log → natural place to surface the new counters to the Migration page.

### 1.2 CR-113(b) — `customer_sync` counters · `routers/customers.py:371-379, 457-473`
```python
371|  _sync_ph, _sync_cc, _sync_pst = normalize_phone(...)                 # status available
379|  **({"phone_invalid": True} if _sync_pst == "invalid" else {}),       # flag written, never counted
461|  phone_match_doc = await db.customers.find_one(phone_match(...))      # F11 dedup
464|  if phone_match_doc:
465|      logger.info("customer_sync F11 ... existing_pos_customer_id=%r", ..., phone_match.get("pos_customer_id"), ...)   # ⚠️
473|      existing = phone_match                                           # ⚠️
```
- ⚠️ **NEW FINDING — candidate BUG-038.** Lines 470 and 473 reference **`phone_match` (the imported function)** instead of **`phone_match_doc`** (the found document). `phone_match.get(...)` raises `AttributeError: 'function' object has no attribute 'get'`, which is caught by the per-record `try/except` (`:555-569`) → the record is counted as **failed** and pushed to `failed_records`, the existing customer is **not updated**, and no insert happens. Net effect: F11 dedup *does* prevent the duplicate insert (by accident — the exception aborts the record) but every dedup hit is reported as a *failure*, and the POS-side demographic/`pos_customer_id` update is lost. `GET /migration/status` labels `updated_count` as `duplicates_merged`, which is therefore **wrong**: real F11 hits are in `failed`. Only one commit in this repo (fresh clone) — cannot date the regression; likely introduced when CR-100 renamed the local variable. **Must be fixed before (b) `dedup_hits` can count anything.** 2-line fix. Needs Intake registration (Planning cannot register) — see Q2.
- `WARNING` per flagged record: today a generic `INFO` line prints every record (`:364-370`, "DIAGNOSTIC"); no distinct line for `phone_invalid`.

### 1.3 CR-113(c) — W2 guest trace · `routers/pos.py:1798-1819`
- Guest branch returns `POSResponse` only; **no DB write, no log line** (L-2 confirmed). Coupon discount is still applied via `_apply_coupon_discount` and recorded with `customer_id:null`.
- No `pos_guest_events` collection exists anywhere (grep 0 hits).

### 1.4 CR-113(d) — `phone_invalid` filter + badge
- `GET /api/customers` (`customers.py:1087-1126`) has 25 query params; **no `phone_invalid`**.
- **`Customer` response model (`models/schemas.py:447`) has `extra="ignore"` and no `phone_invalid` field → the flag is stripped from every list/detail response today.** The badge cannot be rendered until the schema gains `phone_invalid: Optional[bool] = None` (and ideally `phone_raw: Optional[str] = None`). This is an **additive optional field on a HIGH-risk file** (addendum §7) — no serialisation change for existing docs.
- `CustomersPage.jsx`: filters built at `:234-264`; table row phone cell `:1591`; card phone `:1811+`; `Badge` already imported (`:20`). Quick-filter chips exist (`inactive_30d`, `most_loyal`) — pattern to reuse for an "Invalid phone" chip.
- `CustomerDetailPage.jsx` not in scope (badge on list only) — owner may want it; see Q3.

### 1.5 CR-113(e) — prod request-log sampling · `core/pos_request_logger.py`, `server.py:19,91-96`
- Fully implemented (CR-002). Config read **once at import** (`POS_LOG_CONFIG = _load_pos_log_config()`); `sample_rate < 1.0 → random.random() > rate → skip` (`:189`); TTL index created at startup only when enabled (`:141-166`).
- **All 8 `POS_REQUEST_LOGGING_*` keys are read with `os.environ[...]` (no default) except `ENABLED` and `CAPTURE_RESPONSE_BODY`** → if prod `.env` lacks `PATH_PREFIX / BODY_MAX_BYTES / TTL_DAYS / SAMPLE_RATE`, **backend fails at import**. Preprod `.env` has all 8. Deployment note, not a code change.
- Per owner: `ENABLED=true · SAMPLE_RATE=1.0 · TTL_DAYS=7`. Phones and bill lines stored in clear; credentials masked. Restart required (config is import-time).

### 1.6 BUG-028 — `/customers` overflow @390 px · `CustomersPage.jsx`
- Header button cluster `:785` `div.flex gap-2 items-center` (no wrap) · tier-stat chips `:916` `div.flex gap-2 items-center` (no wrap). The outer toolbar `:887` is already `flex-wrap`. Two containers → add `flex-wrap` + `min-w-0`.

### 1.7 CR-114 — nothing exists
- No `data_quality_daily` collection, no `core/data_quality.py`, no DQ metric anywhere. `cron_job_logs` holds loyalty jobs only. `/app/.emergent/cron/` exists but will **not** be used (owner Q2).
- Indexes relevant to the aggregations: `customers {user_id,phone}`, `{user_id}`; `orders {user_id,customer_id}`, `{user_id,created_at}` — sufficient for per-tenant scans.

**Code reality: CR-113 NONE (a,b,c,d) / FULL (e — env only) · CR-114 NONE · BUG-028 confirmed.**

---

## 2. Proposed design (what the Implementation Plan will detail)

### 2.1 Shared vocabulary (113 writes it, 114 reads it)

| Field | Where | Values | Written by |
|---|---|---|---|
| `orders.link_status` | sync-written orders only | `linked` · `linked_late` (CR-115 d) · `unlinked_no_customer` (pid or valid phone present, no match) · `unlinked_invalid_phone` (phone `invalid`, no pid match) · `anonymous` (no pid, blank phone) | `order_sync` insert **and** update (`$set` on re-sync so re-processing can upgrade `unlinked_* → linked`) |
| `migration_sync_logs.{unlinked_count, anonymous_count, invalid_phone_count}` | `order_sync` rows | int | per page + completion |
| `migration_sync_logs.{flagged_phone_count, dedup_hits}` | `customer_sync` rows | int | per page + completion |
| `pos_guest_events` (new collection) | W2 guest branch | `{id, user_id, source:"payment_webhook", phone_raw, phone_digits, bill_amount, coupon_code, coupon_discount, ts}` | `pos.py` guest branch; TTL index 90 d (Q1) |
| `customers.phone_invalid` / `phone_raw` | exists | bool / str | **exposed** via `Customer` schema |

Realtime orders keep `guest_order/guest_reason` (not renamed — "Legacy fields, do not casually fix").

**Scope adds (owner 2026-10-10):**
- **(a) + BUG-039**: `pos_customer_id ∈ {"0", "9223372036854775807"}` is treated as *absent* for `link_status` classification (→ `anonymous` when phone blank) and for the CR-114 orphan KPI; raw value still stored.
- **(a) + realtime `pos_customer_id`**: `POST /pos/orders` order document gains `"pos_customer_id": order_data.user_id` (str via `_coerce_pos_id`, or None). **Single additive key** in the order dict at `pos.py:~1740`; lookup logic (`_find_or_create_customer`) unchanged. Owner approved touching the CRITICAL realtime path for this one field. Sept-2026 probe: realtime orders currently cannot be classified by id because the field is not stored.
- **(b) + BUG-038**: `customers.py:470/473` `phone_match` → `phone_match_doc`; `dedup_hits` counter replaces the broken log line.

### 2.2 CR-114 script shape (owner Q2 = script, no cron)

`scripts/data_quality_snapshot.py --restaurant <user_id>|--all [--date YYYY-MM-DD] [--dry-run]` → `core/data_quality.py::compute_tenant_snapshot(db, user_id, as_of)` → one row per tenant per run into `data_quality_daily`:

| Metric | Definition (per tenant) |
|---|---|
| `customers_total`, `orders_total` | counts |
| `dup_groups` | `$group {phone, country_code∈{+91,null,""}→"+91"}` having `count>1`, `phone` non-empty, `phone_invalid≠true` |
| `invalid_unflagged` | `phone` fails `normalize_phone` rule **and** `phone_invalid≠true` (leak detector — should be 0 after deploy) |
| `invalid_flagged` | `phone_invalid:true` |
| `null_cc` | `country_code ∈ {null, ""}` |
| `blank_phone` | `phone ∈ {null, ""}` |
| `guest_orders` | realtime `guest_order:true` |
| `orphan_orders` (**G-6 KPI**) | `customer_id:null AND guest_order≠true AND (pos_customer_id present OR cust_mobile non-blank)` |
| `anonymous_orders` | `customer_id:null AND no pos_customer_id AND cust_mobile blank` |
| `unlinked_by_status` | `$group link_status` (populated only after CR-113 deploy) |
| `guest_events` | `pos_guest_events` count since previous snapshot |
| `delta_*` | each count minus the previous snapshot row for the tenant (first run → null) |

Row key `{user_id, date}` (unique index) so a re-run on the same day **overwrites** rather than duplicates. Script is read-only on all collections except `data_quality_daily`. Runs against whichever `MONGO_URL` is in `backend/.env` → **prod read-only user cannot write `data_quality_daily`** → for prod runs, either (i) a prod user with write on that single collection, or (ii) `--out <file.json>` fallback that writes the snapshot to disk/`memory/` instead. Recommend (ii) as default on prod until CR-117's write credential exists (Q4).

"Daily" is therefore procedural: owner/agent runs it; the "3-day baseline" exit criterion = 3 runs on 3 calendar days.

---

## 3. Owner questions

| # | Item | Question | Recommendation |
|---|---|---|---|
| **Q1** | CR-113(c) | `pos_guest_events` retention: TTL 90 d, or keep forever? It stores raw phones. | 90-day TTL |
| **Q2** | BUG-038 candidate | Register `customers.py:470/473` `phone_match` → `phone_match_doc` as **BUG-038** and fix it inside CR-113(b) (same hunk), or as a stand-alone Fast-Lane bug fix first? | Register now (Intake, 5 min) and **fold into CR-113(b)** — the `dedup_hits` counter line replaces the broken log line. Separate QA case. |
| **Q3** | CR-113(d) | Badge on list rows only, or also on `CustomerDetailPage` header? | List + filter chip this CR; detail page badge is +3 lines — include if owner wants it in one go |
| **Q4** | CR-114 | On prod (read-only user) write snapshot to **file** (`--out`) instead of `data_quality_daily`? | Yes — file on prod until a scoped write user exists; collection on preprod |

---

## 4. Risk

| Item | Label | Why |
|---|---|---|
| CR-113 (a)(b)(c) | **LOW** | Additive fields and counters inside existing try/except loops; no change to matching or write decisions. (b) includes the BUG-038 fix which *changes* behaviour from "record fails" to "record updates existing" — this is the originally intended F11 behaviour (CR-001B-fix), but QA must cover it. |
| CR-113 (d) | **LOW→MEDIUM** | Touches `models/schemas.py` (`Customer` +2 optional fields). Additive; `extra="ignore"` means no existing payload breaks. Upgraded one notch only because the file is on the hotspot list. |
| CR-113 (e) | **LOW** (env) | Prod `.env` must have all 8 keys; restart required; PII in a 7-day TTL collection. |
| CR-114 | **LOW** | Read-only aggregations; one new collection written on preprod only. |
| BUG-028 | **LOW** | CSS only. |

---

## 5. Blast radius

- **Files WILL change**
  - `routers/pos.py` — **realtime** order doc +1 key `pos_customer_id` (additive, owner-approved) in addition to the W2 guest branch
  - `routers/migration.py` — `order_sync` loop: compute `link_status` + 3 counters, persist per page/completion (~25 lines); `get_migration_status` breakdown +3 keys (~5 lines)
  - `routers/customers.py` — `customer_sync` loop: `flagged_phone_count`, `dedup_hits`, WARNING line, **BUG-038 fix** (~12 lines); `list_customers` `phone_invalid: Optional[bool]` param + query (~4 lines); `_cust_log_progress` payloads (+2 keys)
  - `routers/pos.py` — W2 guest branch: `pos_guest_events.insert_one` + `logger.warning` (~12 lines, inside existing try)
  - `models/schemas.py` — `Customer` +`phone_invalid`, `phone_raw` optional (2 lines)
  - `server.py` — `pos_guest_events` TTL index + `data_quality_daily` unique index at startup (~6 lines)
  - `core/data_quality.py` (new, ~120 lines) · `scripts/data_quality_snapshot.py` (new, ~60 lines)
  - `frontend/src/pages/CustomersPage.jsx` — "Invalid phone" chip, badge in table row + card, BUG-028 `flex-wrap` on 2 containers (~20 lines)
  - `frontend/src/pages/MigrationPage.jsx` — show `unlinked / anonymous / invalid-phone` in order-sync breakdown (~8 lines)
  - tests: `tests/test_cr113_dq_logging.py` (+6), `tests/test_cr114_data_quality.py` (+4)
  - prod `.env` (infra, not in repo): `POS_REQUEST_LOGGING_ENABLED=true`, `SAMPLE_RATE=1.0`, `TTL_DAYS=7`
- **Files WILL NOT touch**: `core/phone.py` · `core/pos_request_logger.py` · `core/loyalty.py` · `core/coupon.py` · realtime order **logic** (`_find_or_create_customer`, loyalty, coupons, invoice — only the one additive key above) · `routers/cron.py` · `core/scheduler.py` · `.emergent/cron/` · `CustomerDetailPage.jsx` (unless Q3 = yes) · any matching/dedup decision logic.

---

## 6. Conflict check

| With | Overlap | Resolution |
|---|---|---|
| **CR-115 (Group 3)** | **Same loops.** 115(a) edits `migration.py:154-166` and `customers.py:308-320` (401 branch); 115(b) edits the page loop head; 115(d) adds a post-insert step at `customers.py:528-530` and writes `link_status:"linked_late"` — a value **defined by CR-113**. | **113 must land first** (defines the vocabulary and the counters 115 increments). Same agent/session for both, or 115 rebases on 113. Declared in `WAVE_A_SEQUENCE_AND_CONFLICTS_2026_10_10.md`. |
| CR-111 (Group 1) | `customers.py` importer region only | none |
| CR-110 amend (Group 4) | reads `migration_sync_logs.error` for `401` — unchanged by 113 | none |
| CR-087 O-A backfill (Wave C) | will set `link_status:"linked_backfill"` on historical orders — value to reserve now | add to vocabulary table (reserved, not written in Wave A) |
| CR-112 (Wave D) | unique index excludes `phone_invalid:true` — relies on the flag being reliable; 114's `invalid_unflagged` metric is the pre-check | none now |
| CR-116 report generator (Wave B) | will reuse `core/data_quality.py` aggregations for the per-restaurant sheets | design 114 helpers as pure functions `(db, user_id) → dict` so 116 can import them |

---

## 7. Downstream consumers

| Consumer | Impact |
|---|---|
| `GET /api/customers` response | +2 optional keys (`phone_invalid`, `phone_raw`); existing clients ignore. Customer App does not use this endpoint. ✅ |
| `Customer` Pydantic model users (`get_customer`, segments, export) | Export CSV columns come from an explicit list — unchanged unless added. ✅ |
| `GET /migration/status` | +3 keys in `order_sync_breakdown`, +2 in `customer_sync_breakdown`; `duplicates_merged` semantics become correct after BUG-038 fix. MigrationPage reads these. ✅ |
| Analytics / dashboard totals | untouched (`analytics_service.py` not in scope). ✅ |
| PROC-001 V-queries | gain `link_status` and the G-6 KPI as canonical queries. ✅ |
| Realtime POS order path | untouched. ✅ |

---

## 8. Verification matrix

| # | Case | Expected |
|---|---|---|
| V1 | `order_sync` with fixture pages: pid-match · phone-match · pid-no-match · invalid phone · blank+no pid | `link_status` = linked · linked · unlinked_no_customer · unlinked_invalid_phone · anonymous; log counters 1/1/1 |
| V2 | re-sync same orders after customer appears | existing order `$set` upgrades `unlinked_no_customer → linked` |
| V3 | `customer_sync` record with junk phone | `phone_invalid:true`, `flagged_phone_count+1`, one WARNING line |
| V4 | `customer_sync` record whose phone matches an existing customer with different `pos_customer_id` (**BUG-038**) | existing doc updated (`pos_customer_id` set), `dedup_hits+1`, `failed_count` unchanged, **no AttributeError** |
| V5 | W2 `payment-received` with `0000000000` | response unchanged (`guest_order:true`); 1 row in `pos_guest_events`; WARNING line |
| V6 | `GET /customers?phone_invalid=true` | only flagged docs; each has `phone_invalid:true` in JSON |
| V7 | CustomersPage chip + badge; 390×844 `scrollWidth ≤ 390` (BUG-028) | PASS |
| V8 | `data_quality_snapshot.py --restaurant r689` twice same day | 1 row (upsert); `delta_*` null on first, 0 on second; counts match manual `count_documents` |
| V9 | snapshot `orphan_orders` on fixture tenant | excludes `guest_order:true` and anonymous |
| V10 | backend boot with `POS_REQUEST_LOGGING_ENABLED=true SAMPLE_RATE=1.0 TTL_DAYS=7` on preprod | TTL index `expireAfterSeconds=604800`; 1 POS call → 1 log row |

---

```text
Planning complete: CR-113 + CR-114 (+BUG-028, +BUG-038 candidate)
Stage: Impact Analysis
Code reality: CR-113 NONE (a–d) / FULL (e, env only) · CR-114 NONE · BUG-028 confirmed · NEW: customers.py:470/473 F11 dedup references function instead of doc → every dedup hit counted as failure (BUG-038 candidate)
Risk: LOW (113 a/b/c/e, 114, 028) · LOW→MEDIUM (113 d — additive fields on models/schemas.py)
Files WILL change: routers/migration.py · routers/customers.py · routers/pos.py (W2 guest branch only) · models/schemas.py (Customer +2 optional) · server.py (2 indexes) · core/data_quality.py (new) · scripts/data_quality_snapshot.py (new) · CustomersPage.jsx · MigrationPage.jsx · tests ×2 (new) · prod .env (infra)
Files WILL NOT touch: core/phone.py · core/pos_request_logger.py · core/loyalty.py · core/coupon.py · realtime order path · routers/cron.py · core/scheduler.py · .emergent/cron · analytics
Owner decisions: ALL RULED — TTL 90 d · BUG-038 folded into (b) · badge list only · prod snapshot → file · scope adds approved (BUG-039 classification, realtime pos_customer_id)
Docs: planning/CR_113_CR_114_IMPACT_ANALYSIS.md
Next: Implementation Plan gate for Group 2 — opens on "choose planning role for implementation planning of Group 2"
```
