# INVESTIGATION REPORT — INV-2026-09-15-002
## Shared-MongoDB Collection Ownership Map

**Date:** 2026-09-15  
**Agent Role:** ROLE 6 — INVESTIGATION (read-only, no code)  
**Steps used:** 8 / 10  
**Status:** COMPLETE (local half) — 3 questions PENDING CRM (Q2-active, Q4-active, Q5)

---

## 1. Evidence Sources

| Source | What it provided |
|---|---|
| `server.py` grep (lines 365–1716) | Every `db.<collection>.<op>` call — collection × operation map |
| MongoDB UAT probe (live) | 33 collections confirmed in `mygenie` DB; document counts |
| `INV_017_CUSTOMER_APP_CONTRACT_GAPS.md` | CRM-side route-to-collection mapping; GAP analysis |
| `INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` | Full `/scan/*` surface with confirmed paths |
| `INV_017_openapi_scan_v2.json` | 21 paths / 26 ops — CRM write paths confirmed |
| `customer_app_config` live doc | 106-key schema; `restaurant_id` stored as **string** |
| `users` live doc | Restaurant admin/POS user record fields |
| `customer_otps` live doc | CRM's OTP collection fields confirmed |
| `OWNER_DECISIONS_2026-09-15.md` | OD-7 (config write ownership), D-A (Option A) |

---

## 2. Full Collection List (33 in `mygenie` DB)

### 2A — Collections our `server.py` touches

| Collection | Our Operations | Docs | Notes |
|---|---|---|---|
| `customer_app_config` | find_one (READ), update_one ×7 (WRITE) | 13 | `restaurant_id` stored as **string** (e.g. `'364'`). CRM also has PUT — **see CONTESTED §3** |
| `customers` | find_one (READ), insert_one + update_one (WRITE) | 7,528 | We write during OTP auth (find-or-create). CRM also writes (register, skip-otp). **CONTESTED §3** |
| `dietary_tags_mapping` | find_one (READ), update_one (WRITE) | unknown | CRM has `GET`+`PUT /api/scan/menu/dietary-tags/{rid}`. **CONTESTED §3** |
| `feedback` | find (READ), insert_one (WRITE) | 1 | CRM has `POST /api/scan/feedback`. Likely same collection. **CONTESTED §3** |
| `non_qr_blocks` | count + insert + delete (READ+WRITE) | 70 | No CRM path found. **OURS EXCLUSIVE** |
| `status_checks` | find + insert_one (READ+WRITE) | 1 | Diagnostics telemetry. No CRM path. **OURS EXCLUSIVE** |
| `coupons` | find (READ-only) | 144 | CRM owns write path. **CRM PRIMARY, we read** |
| `loyalty_settings` | find_one (READ-only) | 39 | CRM owns write path. **CRM PRIMARY, we read** |
| `orders` | find (READ-only) | 66,978 | POS ingest → CRM. 28% linked to customers. **CRM PRIMARY, we read** |
| `points_transactions` | find (READ-only) | 13,987 | CRM owns. All values positive; direction from `transaction_type`. **CRM PRIMARY, we read** |
| `wallet_transactions` | find (READ-only) | 12 | CRM owns. Module effectively inactive (only 12 docs). **CRM PRIMARY, we read** |
| `users` | find_one (READ-only) | 40 | Restaurant admin/POS users. CRM primary table. We read for admin JWT auth only. **CRM PRIMARY, we read** |

### 2B — Collections CRM owns exclusively (we never touch)

| Collection | Doc count | CRM purpose |
|---|---|---|
| `campaigns` | 44 | WhatsApp/CRM marketing campaigns |
| `campaign_runs` | 57 | Campaign execution runs |
| `campaign_test_sends` | 20 | Campaign test sends |
| `coupon_distributions` | 2 | Coupon distribution records |
| `coupon_transactions` | 0 | Coupon transaction ledger |
| `coupon_usage` | 186 | Coupon usage tracking |
| `cron_job_logs` | 117 | Scheduled job logs |
| `custom_templates` | 121 | Message templates |
| `customer_documents` | 114 | Customer KYC/docs |
| `customer_otps` | 5 | CRM OTP store (our backend uses in-memory dict; **separate**) |
| `import_logs` | 44 | Data import records |
| `invoices` | 50 | Invoice records |
| `loyalty_mismatch_logs` | 0 | Loyalty sync mismatches |
| `migration_sync_logs` | 257 | DB migration records |
| `order_items` | 188,900 | POS order line items |
| `pos_request_logs` | 0 | POS API request log |
| `segments` | 21 | Customer segments |
| `webhook_logs` | 10 | Webhook delivery logs |
| `whatsapp_callback_logs` | 3,765 | WhatsApp delivery callbacks |
| `whatsapp_event_template_map` | 19 | WhatsApp event→template map |
| `whatsapp_message_logs` | 1,031 | WhatsApp message history |
| `whatsapp_template_variable_map` | 43 | Template variable config |

---

## 3. Contested Collections — Dual-Write Risk

These collections are written by **both** our backend and CRM. Each is a potential conflict risk.

### 3A — `customer_app_config` ⚠️ HIGH RISK

| Question | Finding |
|---|---|
| Our writes | `PUT /api/config/` — admin UI. 7 update_one calls in server.py |
| CRM writes (capability) | `PUT /api/scan/config/{restaurant_id}` confirmed in OpenAPI |
| CRM writes (active today?) | **PENDING Q2** — CRM to confirm if their UI calls this today |
| Decision (OD-7) | We own writes. CRM's PUT should be made read-only / locked by CRM |
| Schema note | `restaurant_id` stored as **string** in DB. CRM must match format. 106 keys per doc. |
| Risk | If CRM UI writes today → silent overwrite of admin config. CRITICAL |

### 3B — `customers` ⚠️ HIGH RISK (Option A transition)

| Question | Finding |
|---|---|
| Our writes | `insert_one` (new customer, OTP register flow), `update_one` (profile fields) |
| CRM writes | `POST /api/scan/auth/register` (inserts), `POST /api/scan/auth/skip-otp` (find-or-create), `PUT /api/scan/profile` (update) |
| Decision (D-A) | Under Option A, CRM is canonical owner of customer data |
| Our path status | Our customer insert/update is the OTP auth flow. **Retirement candidate** under CR-2026-09-12-006 — but only after CRM OTP delivery is live (currently `dev_otp` only) |
| Risk | Dual-write today is accepted (same phone-based find-or-create). No silent conflict confirmed. |

### 3C — `dietary_tags_mapping` ⚠️ MEDIUM RISK

| Question | Finding |
|---|---|
| Our writes | `PUT /api/dietary-tags/available` → `update_one` |
| CRM writes (capability) | `PUT /api/scan/menu/dietary-tags/{rid}` confirmed in OpenAPI |
| CRM writes (active today?) | **PENDING Q4** — CRM to confirm if their admin uses this |
| Risk | If CRM writes → potential overwrite of dietary tag config set by our admin |

### 3D — `feedback` LOW RISK (confirm)

| Question | Finding |
|---|---|
| Our writes | `POST /api/feedback` → `insert_one` |
| CRM writes (capability) | `POST /api/scan/feedback` in OpenAPI |
| Same collection? | Likely yes (same DB, same schema context) — **PENDING Q4 addendum** |
| Risk | LOW — append-only inserts. No overwrite risk. |

---

## 4. Route Retirement Candidates (Option A)

Under Option A (CRM owns customer surface), the following our-backend routes become candidates for retirement under CR-2026-09-12-006 **after ownership map is signed**:

| Route | Why retirement candidate | Blocker before removal |
|---|---|---|
| `GET /api/customer/profile` | CRM serves via `GET /api/scan/auth/me` | INV-001 already confirmed. Needs CR-006 plan |
| `GET /api/customer/orders` | CRM serves via `GET /api/scan/orders` | Same |
| `GET /api/customer/points` | CRM serves via `GET /api/scan/loyalty` + `points/history` | Same |
| `GET /api/customer/wallet` | CRM serves via `GET /api/scan/loyalty` + `wallet/history` | Same |
| `POST /api/auth/send-otp` (customer path) | CRM serves OTP. But `dev_otp` security issue blocks | Must wait for CRM OTP delivery fix |
| `customers insert_one` in auth | CRM `skip-otp` does find-or-create. Duplicate write today | Keep until CRM OTP delivery live |

**Routes to KEEP permanently under Option A:**

| Route | Reason |
|---|---|
| `POST /api/auth/login` (admin role) | Admin JWT auth. Reads `users` collection. Not replaceable by CRM. |
| `GET /api/auth/me` (admin role) | Admin session validation |
| `GET/PUT /api/config/*` | We own config writes (OD-7) |
| `POST /api/upload/*` | We own uploads |
| `GET/PUT /api/dietary-tags/*` | We own dietary tag writes (pending Q4 resolution) |
| `POST /api/diagnostics/*` | Telemetry — `non_qr_blocks`, `status_checks` |
| POS proxy routes | We proxy POS API |

---

## 5. Auth / JWT Overlap Analysis

| Item | Finding |
|---|---|
| Our JWT | HS256, signed with `JWT_SECRET` from `backend/.env`. Claims: `id`, `role`, `restaurant_id` (admin). Used for admin routes only. |
| CRM JWT | HS256 (`core/auth.py:13`). Claims: `customer_id`, `restaurant_id`, `phone`, `type:"customer"`, `exp` 24h. |
| Same secret? | **PENDING Q5** — must ask CRM directly. If same, cross-validation is possible (security risk). |
| Our interceptors | `AuthContext.jsx` attaches CRM token for customer calls, admin JWT for admin calls. No cross-validation today. |
| Risk if overlap | LOW operational risk today (different route sets). HIGH security risk: CRM customer token could theoretically authenticate to our admin routes if secret matches and role claim is absent from validation. |
| Recommendation | CRM to confirm secret is different. If same → rotate one. |

---

## 6. `users` Collection — Shared Admin Table

| Finding | Detail |
|---|---|
| Contents | Restaurant admin / POS users (40 docs). Fields include `password_hash`, `pos_id`, `restaurant_id`, `api_key`, `authkey_api_key`, `mygenie_token` |
| Our use | `server.py` reads `users` for admin JWT login only (`find_one` by `id` or `phone`) |
| CRM use | Primary — CRM owns this table (restaurant onboarding, token management, WhatsApp keys) |
| Risk | We must NOT write to `users`. Any admin password or field change must go through CRM. |

---

## 7. Config Defaults Divergence (Partial — Step 4)

| Context | Default behaviour |
|---|---|
| Our `RestaurantConfigContext.jsx` `isOn()` | Returns `true` unless config value is explicitly `false`. ~40 `show*` flags default ON. `showWallet: false` is the only explicit default-OFF flag. |
| Our backend `server.py` | Returns hardcoded `true` for all `show*` keys when config doc is missing (lines 1060–) |
| CRM `AppConfigUpdate` defaults | **PENDING** — CRM to provide their default map for `PUT /scan/config`. If different from ours, a missing key read by CRM could render differently than on our side. |

---

## 8. Pending CRM Questions (send as-is)

**Q2:** Does your admin UI (or any CRM workflow) actively call `PUT /api/scan/config/{restaurant_id}` today? If yes: (a) what keys does it write? (b) can this path be made read-only or disabled, given that OD-7 assigns config writes to the Customer App admin UI?

**Q4:** Does `PUT /api/scan/menu/dietary-tags/{restaurant_id}` write to the `dietary_tags_mapping` collection in the shared `mygenie` DB? Does your admin UI use this endpoint today? Can write-lock be applied if Customer App owns dietary tag writes?

**Q4b:** Does `POST /api/scan/feedback` write to the same `feedback` collection our backend writes to?

**Q5:** Is your CRM HS256 JWT signing secret different from the `JWT_SECRET` used by the Customer App backend? (Confirm yes/no — do not share the value.) If they are the same, both teams must rotate to different secrets immediately.

---

## 9. Summary — Ownership Map Verdicts

| Collection | Verdict | Action required |
|---|---|---|
| `customer_app_config` | **CONTESTED — we own by OD-7** | CRM to lock/remove their PUT. Confirm Q2. |
| `customers` | **CONTESTED — CRM canonical (D-A)** | Our writes are auth-only. Retire after CRM OTP delivery live. |
| `dietary_tags_mapping` | **CONTESTED — pending Q4** | Ask CRM Q4. |
| `feedback` | **CONTESTED — likely shared, LOW risk** | Ask CRM Q4b. Append-only, no conflict today. |
| `non_qr_blocks` | **OURS EXCLUSIVE** | No action. |
| `status_checks` | **OURS EXCLUSIVE** | No action. |
| `coupons` | **CRM PRIMARY, we read** | No action. Keep READ-only. |
| `loyalty_settings` | **CRM PRIMARY, we read** | No action. Keep READ-only. |
| `orders` | **CRM PRIMARY, we read** | Retire our read route after CR-2026-09-15-001 lands. |
| `points_transactions` | **CRM PRIMARY, we read** | Retire after CR-2026-09-15-001 lands. |
| `wallet_transactions` | **CRM PRIMARY, we read** | Retire after CR-2026-09-15-001 lands. |
| `users` | **CRM PRIMARY, we read-only** | No writes ever. Admin auth reads only. |
| 21 CRM-exclusive | **CRM EXCLUSIVE** | Never touch. |

---

## 10. Recommendation

1. **Share Q2/Q4/Q4b/Q5 with CRM counterpart.** Block CR-2026-09-12-006 deletion scope until answered.
2. **OD-7 enforcement:** Request CRM formally lock `PUT /api/scan/config/{rid}` (disable or return 405). This is the highest-conflict risk.
3. **Proceed with CR-2026-09-15-001** (Profile CRM v2 adapter) — does not touch any contested collection. Safe to plan now.
4. **Dietary tags:** Do not change write path until Q4 is answered. Current state (we write, CRM has capability) is a latent risk only.
5. **JWT secret:** Treat as P1 security — get Q5 answer before next release.

```
Investigation complete: INV-2026-09-15-002
Root cause: STRUCTURAL — shared DB with 4 contested collections, 3 CRM questions pending
Classification: DATA/CONFIG
Confidence: HIGH (local half); PENDING on Q2/Q4/Q5
Steps used: 8/10
Evidence: INVESTIGATION_REPORT.md, OWNERSHIP_MAP.md (this folder)
Recommendation: Share Q2/Q4/Q4b/Q5 with CRM → finalise map → unblock CR-006/010/014
Report: memory/change_requests/INV-2026-09-15-002-shared-db-collection-ownership-map/INVESTIGATION_REPORT.md
```
