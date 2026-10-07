# Running change log for Scan & Order (Customer App) and POS agents
**Purpose** (owner ruling 2026-10-08): every CRM change that touches a route, payload, collection or behaviour the Customer App or POS can see is recorded here **at the end of each implementation**. After all waves close, this log is consolidated into **new contracts** for both teams (supersedes `CONTRACT_CUSTOMER_APP_CRM_v1.0` for Customer App; `CR_079_CR_081_CR_080_POS_API_CONTRACT_v1_FINAL.md` lineage for POS).

**Rules**
- A row is **DRAFT** when written at planning; flipped to **CONFIRMED** by the Implementation Agent at exit gate with date + evidence.
- Owner approves the outbound send; agents never send on their own.
- Columns: *Audience* = Customer App / POS / Both.

---

## Wave 1 — Security cleanup

### CR-084 — Customer OTP flow removed
| Field | Value |
|---|---|
| Status | **DRAFT** (planning 2026-10-08) → CONFIRMED on: _____ |
| Audience | Customer App |
| Removed | `POST /api/scan/auth/request-otp` · `POST /api/scan/auth/verify-otp` → **404** |
| Unchanged | `POST /api/scan/auth/skip-otp` (today's login) · `POST /api/scan/auth/register` · `POST /api/scan/auth/login` (password) · all token-gated `/scan/*` |
| Coming | `POST /api/scan/auth/lookup` (CR-093) — exists-check without token/creation |
| Collections | `customer_otps` no longer written (5 legacy docs remain; drop deferred) |
| Why | OTP code was returned in the response body (`dev_otp`) → anyone could mint a customer JWT. Owner: Customer App has no OTP step. |
| Action for Customer App | Remove any residual call to the two routes. No payload changes elsewhere. |
| Evidence at CONFIRM | curl 404 ×2 · skip-otp 200 · commit hash |

### CR-097 — Staff password management removed
| Field | Value |
|---|---|
| Status | **DRAFT** (planning 2026-10-08) → CONFIRMED on: _____ |
| Audience | POS (informational) |
| Removed | `POST /api/auth/register` · `PUT /api/auth/reset-password` · `POST /api/auth/forgot-password/{request-otp,verify-otp,reset}` → **404** |
| Unchanged | `POST /api/auth/login` → `mygenie-login` → POS `MYGENIE_LOGIN_ENDPOINT` + profile. Token push `register_crm_token_with_pos` unchanged. |
| Collections | `otp_tokens` no longer written (0 docs). `users.password_hash` still cached at login, never read. |
| WhatsApp | `reset_password` CRM automation event removed from `CRM_EVENTS` (no tenant had mapped a template). |
| Why | CRM has no local credential store in practice — 40/40 users provisioned via POS. Staff OTP was also returned in response body. |
| Action for POS | None. POS remains the single owner of staff passwords; "forgot password" is a POS-side flow. |
| Evidence at CONFIRM | curl 404 ×5 · login 200 · commit hash |

### CR-090 — Closed OBSOLETE (no code)
| Audience | Customer App (informational) |
| Note | CRM will not build an OTP delivery channel or customer password reset. Customer identity: POS auth (C1-a) + CRM `skip-otp`/`lookup`. |

---

## Wave 2 — Customer App unblockers *(rows added when each CR is planned)*
_CR-093 lookup · CR-094 loyalty-rules_

## Wave 3 — Customer identity foundation
_CR-085 · CR-086 · CR-087 · CR-096_

## Wave 4 — Cleanup + hardening
_CR-095 · CR-089 · CR-088_

---

## Consolidation checklist (run after last wave closes)
- [ ] Every row CONFIRMED with date + evidence
- [ ] Customer App contract v2 drafted from Customer-App rows (supersedes v1.0 §4a/§4b/§4c)
- [ ] POS contract addendum drafted from POS rows
- [ ] Owner sign-off → send
