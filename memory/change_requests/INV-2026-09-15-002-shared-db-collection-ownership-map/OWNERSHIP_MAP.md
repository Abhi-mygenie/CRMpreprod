# OWNERSHIP MAP — Shared MongoDB `mygenie` DB
## INV-2026-09-15-002 · 2026-09-15

**Status:** DRAFT — **NOT signed, deliberately not updated.** Local half complete.
**CRM half received 2026-10-03** (`crm_reply/INV_022_CRM_OWNERSHIP_BOARD_REPLY.md`, all 39
collections, code-scanned) and reconciled in `RECONCILIATION_CRM_BOARD_2026-10-03.md` — 36/39
agreed, 3 ruled by the owner. **CRM is no longer the blocker: POS is** (P1-refined, P5, P6, P7).
The rows below are therefore still the pre-CRM-reply draft; do **not** treat them as current.

> **The authoritative, current ownership statement is
> `/app/memory/control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` §2** (v1.0-RC3, all 39 rows with owners).
> Where that contract and this file disagree, **the contract wins** (clause C6). This map gets
> rewritten and signed only once POS replies — per the standing rule, not before.

**Sign-off required:** Owner + CRM counterpart + POS before this map is FINAL.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ OURS | Customer App backend is the sole writer |
| ✅ CRM | CRM is the sole writer |
| ⚠️ CONTESTED | Both systems can write — conflict risk |
| 👁️ READ | System reads only, does not write |
| ❌ NEVER | System must never touch this collection |
| ❓ PENDING | CRM answer required to confirm |

---

## Full Map (33 collections)

| Collection | Customer App writes? | CRM writes? | Ownership verdict | Risk | Notes |
|---|---|---|---|---|---|
| `customer_app_config` | ✅ YES (7 update paths) | ⚠️ HAS PUT endpoint | ⚠️ CONTESTED → **OURS by OD-7** | HIGH | CRM must lock/remove `PUT /scan/config/{rid}`. Q2 pending. |
| `customers` | ⚠️ YES (auth/OTP flow only) | ✅ YES (canonical owner) | ⚠️ CONTESTED → **CRM canonical (D-A)** | HIGH | Our writes = auth side-effect. Retire after CRM OTP delivery live. |
| `dietary_tags_mapping` | ✅ YES (admin PUT) | ❓ HAS PUT endpoint | ⚠️ CONTESTED → **PENDING Q4** | MEDIUM | Must ask CRM if their UI writes today. |
| `feedback` | ✅ YES (insert) | ❓ HAS POST endpoint | ⚠️ CONTESTED → **PENDING Q4b** | LOW | Append-only, no overwrite risk today. |
| `non_qr_blocks` | ✅ YES (exclusive) | ❌ No endpoint | ✅ OURS EXCLUSIVE | LOW | Safe. |
| `status_checks` | ✅ YES (exclusive) | ❌ No endpoint | ✅ OURS EXCLUSIVE | LOW | Diagnostics telemetry. |
| `coupons` | 👁️ READ-only | ✅ YES (owner) | ✅ CRM PRIMARY | LOW | Keep read-only. Never write. |
| `loyalty_settings` | 👁️ READ-only | ✅ YES (owner) | ✅ CRM PRIMARY | LOW | Keep read-only. |
| `orders` | 👁️ READ-only | ✅ YES (POS ingest) | ✅ CRM PRIMARY | LOW | Retire our read route after CR-2026-09-15-001. |
| `points_transactions` | 👁️ READ-only | ✅ YES (owner) | ✅ CRM PRIMARY | LOW | Retire after CR-2026-09-15-001. |
| `wallet_transactions` | 👁️ READ-only | ✅ YES (owner) | ✅ CRM PRIMARY | LOW | Only 12 docs — module inactive. |
| `users` | ❌ READ-only only | ✅ YES (owner) | ✅ CRM PRIMARY | HIGH | Admin auth reads only. Never write. Contains password_hash, API keys, WhatsApp tokens. |
| `campaign_runs` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `campaign_test_sends` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `campaigns` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `coupon_distributions` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `coupon_transactions` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `coupon_usage` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `cron_job_logs` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `custom_templates` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `customer_documents` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `customer_otps` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | Our backend uses in-memory OTP dict (separate) |
| `import_logs` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `invoices` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `loyalty_mismatch_logs` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `migration_sync_logs` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `order_items` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | 188,900 docs |
| `pos_request_logs` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `segments` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `webhook_logs` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `whatsapp_callback_logs` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `whatsapp_event_template_map` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `whatsapp_message_logs` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |
| `whatsapp_template_variable_map` | ❌ NEVER | ✅ CRM exclusive | ✅ CRM EXCLUSIVE | — | |

---

## Critical Standing Rules (derived from this map)

1. **`users` — NEVER write.** Any admin credential or field change goes through CRM only.
2. **`customer_app_config` — ONLY our admin UI writes.** CRM must lock `PUT /scan/config/{rid}`.
3. **Any collection not in our 12-collection list above is CRM-exclusive. Never add code that writes to them.**
4. **New collections** in our backend require owner + CRM approval before creation (shared DB).
5. **Schema/index changes** to any shared collection require owner + CRM approval (standing rule from OD-7 + shared-DB fact).

---

## CRM Questions (send verbatim)

```
Q2: Does your admin UI (or any CRM workflow) actively call PUT /api/scan/config/{restaurant_id} today?
    If yes: (a) what keys does it write? (b) can this path be made read-only or disabled?
    (OD-7 assigns config writes to Customer App admin UI.)

Q4: Does PUT /api/scan/menu/dietary-tags/{restaurant_id} write to the dietary_tags_mapping collection
    in the shared mygenie DB? Does your admin UI use this endpoint today?

Q4b: Does POST /api/scan/feedback write to the same feedback collection our backend writes to?

Q5: Is your CRM HS256 JWT signing secret different from the JWT_SECRET used by the
    Customer App backend? (Confirm yes/no only — do not share the value.)
    If same → both teams must rotate to different secrets before next release.
```

---

## Sign-off

| Party | Name / Role | Date | Status |
|---|---|---|---|
| Owner | — | — | PENDING |
| CRM counterpart | — | — | PENDING (Q2/Q4/Q5 answers required) |

*This map becomes FINAL when both parties sign off and Q2/Q4/Q5 are answered.*
