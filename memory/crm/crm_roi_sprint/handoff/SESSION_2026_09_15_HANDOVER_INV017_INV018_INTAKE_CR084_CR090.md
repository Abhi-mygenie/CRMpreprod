# SESSION HANDOVER — 2026-09-15 — Customer App Contract Verification → Order Linkage → Intake CR-084…090

**Project:** MyGenie CRM · **Sprint:** `crm_roi_sprint` · **Operating prompt:** `/app/memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`
**Roles used this session:** INVESTIGATION (INV-017, INV-018) → INTAKE (CR-084 → CR-090) → DEPLOYMENT (pod restart, trivial)
**Code changed:** **NONE.** Every artifact is under `/app/memory/`. `git status` shows no source diffs.
**Owner language:** English. Owner prefers plain-English explanations, challenges findings, and decides gate-by-gate.

---

## 1. What triggered the session

The MyGenie **Customer App team** sent `CRM_CONTRACT_VERIFICATION_REQUEST.md` (ref INV-2026-09-15-001, saved at `crm/inbox/`). Their `/profile` page calls `GET /customer/me/orders|points|wallet` → all 404. They asked CRM to confirm the v2 contract, OTP/auth behaviour, and provide a Swagger export. They are preparing their next integration phase, which they call **"wave 2"** (term not defined in CRM docs).

---

## 2. What was found (all verified against code + live DB + live `crm.mygenie.online` probes)

### INV-017 — Contract gaps (`investigations/INV_017_CUSTOMER_APP_CONTRACT_GAPS.md`)
- `/customer/me/*` **never existed**. All customer data is under `/api/scan/*`: `/scan/auth/me`, `/scan/loyalty`, `/scan/orders[/{id}]`, `/scan/points/history`, `/scan/wallet/history`, `/scan/addresses*`, `/scan/coupons`, `/scan/config/{rid}`.
- Envelope `{success, message, data}`. Business errors = HTTP 200 `success:false`; transport = 4xx `{detail}`.
- Field mismatches: items `item_name/item_qty/item_price`; points `transaction_type ∈ earn|redeem|bonus|expired`, `points` always positive; `order_type` raw POS text; `limit` cap 50, **no `skip`**; ledger `total` = rows returned (orders `total` = full count) — inconsistent (Customer App finding **D4**, confirmed).
- **OTP is dev-only**: `request-otp` sends nothing and returns the code as `dev_otp` in the body — on live too. Security hole.
- No customer forgot/reset-password. `skip-otp` has no rate-limit/409. JWT: 24 h, HS256, claims `customer_id, restaurant_id (pos_0001_restaurant_{rid}), phone, type`; **no `user_id` claim**, no refresh.
- Missing `Authorization` header → **401 on live, 403 on this pod** (Customer App finding **D1**, confirmed): live runs FastAPI ≥ 0.122, repo pins `0.110.1` → deployment provenance question.
- OpenAPI only served at host root → unreachable through `/api` ingress.

### INV-018 — Order linkage (`investigations/INV_018_ORDER_LINKAGE_GAPS.md`) — owner asked "all the orders are not coming"
- 66,977 orders; **28% linked** to a customer. Of 48,199 unlinked: **44,682 have empty `cust_mobile`** (anonymous counter sales — POS/cashier, not CRM) and **3,517 have a phone**.
- Those 3,517 all came via **historical order sync**, all carry `pos_customer_id`, and **0 have a matching CRM customer**. Tenants 541/665/474; latest `customer_sync` **failed** for all three (CRM 313/200/52 customers vs ≥322/≥921/≥490 POS customers seen on orders). ₹21.9 lakh of history invisible. Order sync writes `customer_id:null` instead of creating the customer (realtime `pos.py:665-712` does create).
- **Zero phone normalisation** anywhere (exact-string match). 38 duplicate customer groups (same tenant, same last-10 digits, different format); 31 have orders split across records. Format chaos is 98% in historical POS data; realtime webhook ~95% clean 10-digit.
- Restaurant **689 (Kunafa Mahal, UAT)**: 9,327 orders, 31% linked; all 6,357 unlinked have empty phone (`order_type: pos` 6,292). Clean formats. **Good UAT tenant, no CRM defect there.**
- **Canonical phone (de-facto from code):** `phone` = exactly 10 digits, digits only; `country_code` = `"+91"` separate. Only `customers.py:110-116` (CSV import) enforces it; WhatsApp send concatenates `country_code + phone`, so `+91…` stored in `phone` breaks delivery.
- Owner clarified: realtime orders need **not** be gated on migration — realtime creates the customer on the fly and customer_sync later merges by `pos_customer_id` (phone fallback is the CR-085 risk).

---

## 3. Artifacts produced (all under `/app/memory/crm/crm_roi_sprint/`)

| File | Purpose | Status |
|---|---|---|
| `investigations/INV_017_CUSTOMER_APP_CONTRACT_GAPS.md` | Internal gap report, GAP-01…12 | final |
| `investigations/INV_017_CRM_CONTRACT_REPLY_TO_CUSTOMER_APP.md` | Their questionnaire with "CRM answer" filled + corrections table (D1/D4) | **ready to send** |
| `investigations/INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` | Formal as-built `/scan/*` contract v2.0.1 + §6 PROPOSED P-1…P-7 | **ready to send** |
| `investigations/INV_017_openapi_scan_v2.json` | OpenAPI 3 export, 21 `/api/scan/*` paths, 14 schemas | **ready to send** |
| `investigations/INV_018_ORDER_LINKAGE_GAPS.md` | Linkage numbers, code trace, §1.1 re-verification, §4.1 canonical phone, **§5 POS agent brief (Q1–Q9)**, §6 Customer App addendum | **§5/§6 ready to send** |
| `discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` | Intake for 7 CRs (§3 CR-086 revised after owner challenge) | registered |
| `/app/memory/CR_STATUS_DASHBOARD.md` | 7 board rows, 2 transitions, backlog (FastAPI drift), header updated | synced |
| `00_register/ROI_MEASUREMENT_CR_REGISTER.md` | rows 34–40 | synced |
| `/app/memory/PRD.md` | session log entries | synced |
| `crm/inbox/CRM_CONTRACT_VERIFICATION_REQUEST.md` | original artifact | archived |

Not yet written (owner asked "can u give pointers … from POS agent" → answered in chat and saved as INV-018 §5). A standalone `INV_017_BRIEF_FOR_CUSTOMER_APP_AGENT.md` was offered but not requested — the content lives in INV-017 reply + INV-018 §6.

---

## 4. Registered items (INTAKE 2026-09-15)

| CR | Title | Sev / Risk | Status | Open owner Qs |
|---|---|---|---|---|
| **084** | Remove `dev_otp` from non-dev `request-otp` (SECURITY) | P1 / HIGH | 📋 registered — **no questions**, needs approval to plan | — |
| **085** | Phone format at every entry point | P1 / CRITICAL (`pos.py` hotspot) | 📋 registered — **direction undecided** | Owner leaning "**no normalisation** — ask POS/Customer App to send 10 digits". Options: (a) CRM validates/rejects · (b) CRM normalises · (c) park, CRM unchanged. Q1 non-Indian numbers · Q2 junk phones reject/quarantine · Q3 ask POS too |
| **086** | POS customers missing: customer_sync fails on 541/665/474 + order sync doesn't create missing customer (REVISED) | P1 / HIGH | 📋 registered | Q1 defaults for created customers (rec: Bronze/0 pts/no bonus) · Q2 re-run sync for the 3 tenants (rec: yes) |
| **087** | Backfill 3,517 orphan orders + merge 38 duplicate customers, dry-run first | P1 / CRITICAL (data write) | 📋 registered — **conflicts with sprint rule "no historical backfill approved"** | Q1 lift rule (dry-run only first) · Q2 tenant 689 first or all · Q3 merge policy sum vs keep-max |
| **088** | `/scan/*` hygiene: `skip`, consistent `total`, `expiring_soon`, `/api/openapi.json` | P2 / LOW–MED | 📋 registered — no questions | — |
| **089** | `skip-otp` guard rails | P2 / MEDIUM | 📋 registered | Q1 accept risk vs implement · Q2 rate-limit only vs also block password-holders |
| **090** | OTP delivery provider + customer forgot/reset-password | P2 / HIGH | 🔴 blocked | Q1 channel (WhatsApp OTP template via AuthKey / AuthKey SMS / other) · Q2 platform vs per-tenant · Q3 priority |
| — | FastAPI drift live vs repo (GAP-11) | P3 | out-of-sprint backlog | owner: confirm live deployment provenance |

**Wave-2 blockers (agent recommendation, owner not yet ruled):** CR-084 + CR-085. Strongly recommended before UAT sign-off: CR-086 + CR-087. Not blocking: 088/089/090.

---

## 5. Owner decisions already taken this session
- Approved the 10-step read-only investigation (INV-017). ✅
- Confirmed the four re-verification points (GAP-13, phone shapes nuance, 689 explanation, P-8/9/10). ✅
- Accepted the answer that realtime orders need not be gated on migration ("its fine"). ✅
- Challenged CR-086 framing → accepted revised framing (sync completeness, not migrated-customer data). ✅
- Leaning **no CRM normalisation** for CR-085 (ask POS/Customer App for 10-digit format) — **not yet locked**.
- **Will provide 5 restaurant IDs** for an August-2026 data discrepancy check — **pending, not yet received**.

---

## 6. NEXT AGENT — present these steps to the owner in this order, then let the owner decide

Start with the mandatory session-start block (Project / Role / Reason / Risk / Docs read / Blocked / Next action). Role will be **INVESTIGATION** if the 5 IDs arrive, else **PLANNING** for CR-084 on approval.

| Order | Step | Role | What to ask the owner |
|---|---|---|---|
| **1** | **August-2026 reconciliation for the owner's 5 restaurant IDs** (read-only). Per tenant: orders by source (sync vs realtime), linked vs orphan (with/without phone), phone-format histogram, duplicate customers by last-10, `customer_sync`/`order_sync` log status, duplicate `pos_order_id`, points earned vs orders, junk phones. Save as `investigations/INV_019_AUG_2026_RECON.md`. | INVESTIGATION | "Please share the 5 restaurant IDs." If already given, run it first — its result informs step 3. |
| **2** | **CR-084** remove `dev_otp` from live — Planning then Implementation (gate `OTP_DEV_MODE`, default off; ~20 min; `scan.py:224-227` only). | PLANNING → IMPLEMENTATION | "Approve CR-084 to plan/implement?" (auth-adjacent → explicit approval needed). Recommend first regardless of wave. |
| **3** | **CR-085 direction** — close intake with one of: (a) validate/reject non-10-digit at all entry points · (b) normalise · (c) park (POS + Customer App commit to 10 digits). Use step-1 data: clean realtime data → (a) suffices; dirty → (b). | INTAKE close | "Which option, and Q1 (foreign numbers) / Q2 (junk) / Q3 (ask POS)?" |
| **4** | **CR-086** — Planning: (A) why `customer_sync` fails on large tenants (suspect 60 s timeout, see CR-075 QA note) → resumable/paginated; (B) order sync creates missing customer (parity with realtime, bonus suppressed). | PLANNING | "Q1 defaults for created customers? Q2 re-run sync on 541/665/474 after fix?" |
| **5** | **CR-087 dry-run only** — report of linkable orphan orders + duplicate groups, zero writes. | PLANNING → dry-run script | "Lift the sprint's no-backfill rule for the dry-run? Tenant 689 first or all?" Writes only after owner reads the report. |
| **6** | **Hand-offs to other teams** (owner action, no CRM code): send Customer App the INV-017 reply + contract v2.0.1 + openapi.json + INV-018 §6; send POS agent INV-018 §5 (Q1–Q9, canonical phone). | — | "Have these been sent?" |
| **7** | CR-088 (no questions, LOW) · CR-089 (risk decision) · CR-090 (channel decision) · GAP-11 provenance. | later | Only when owner raises them. |

**Do not** start Planning/Implementation on 085/086/087 without the owner's explicit answers above — all three touch do-not-change-without-approval areas (addendum §14: customer identity/merge, migration, production data).

---

## 7. Test credentials / tenants referenced
- UAT tenant: restaurant **689** (Kunafa Mahal, `pos_0001_restaurant_689`) — clean data, good for Customer App UAT. Any phone + `restaurant_id=689` via `POST /api/scan/auth/skip-otp` yields a customer token (no secrets needed).
- Staff test logins: see `/app/memory/test_credentials.md` (not printed here).
- DB: remote Mongo per `backend/.env` (`DB_NAME=mygenie`) — **live preprod data; read-only unless a CR is approved.**

## 8. Environment notes
- Pod restarted once mid-session (all services showed 14 s uptime); `supervisorctl restart backend frontend` → `/api/health` 200, login page renders. No code cause.
- Scratch DB scripts must live under `/app/memory/` (files in `/tmp` are lost on pod restart); delete after use.
- Long Mongo aggregations over `orders` (67k docs, remote DB) time out near 120 s — keep samples ≤ 300 docs or use `$group` pipelines.

## 9. DO NOT
- Do not write code for any CR until the owner approves the specific step above.
- Do not normalise/merge/backfill any customer or order data — CR-085/086/087 are unapproved and CRITICAL.
- Do not send live WhatsApp/SMS, do not toggle `CAMPAIGN_SCHEDULER_ENABLED`.
- Do not re-probe `crm.mygenie.online` with real customer phones; use empty bodies / bad tokens only.
- Do not treat the 44,682 empty-phone orders as a CRM bug — they are POS/cashier data.

## 10. Copy-paste for next agent
```text
READ (in order): /app/memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md → this handover → CR_STATUS_DASHBOARD.md (rows 084-090, transitions 2026-09-15) → discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md → investigations/INV_018_ORDER_LINKAGE_GAPS.md → investigations/INV_017_CUSTOMER_APP_CONTRACT_GAPS.md
FIRST MESSAGE TO OWNER: session-start block, then the 7-step table in §6 verbatim, then ask for the 5 restaurant IDs and CR-084 approval. Owner decides from there.
```
