# INTAKE DOC — CR-2026-09-12-017

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-017 |
| **Title** | Finalize CRM SMS integration for OTP delivery (customer login path) — prereq for CR-003 |
| **Classification** | CR — Integration / Prerequisite |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner directive during CR-003 Planning (2026-09-12): *"E — Reorder Wave 1: finish CRM as its own CR first, then CR-003"* — surfaced because owner stated CRM is "half-baked" but production is live and CR-003 cannot remove the OTP echo without a working SMS path |
| **Severity** | **P0** — unblocks P0 CR-003 security fix; production login currently relies on the OTP echo (security bug) |
| **Risk** | **HIGH** (new production integration; touches customer-login user experience via preparation for CR-003; SMS deliverability depends on carrier + template compliance; DLT regulatory risk in India) |
| **Status** | 🔒 **DEFERRED TO WAVE 2** (2026-09-13) — was Wave 1b; owner-side blockers not cleared. See §7 for full prereq list. No Planning activity until owner supplies all §7 items. |
| **Parent** | CR-2026-09-12-001 (Wave 1) |
| **Blocks** | CR-2026-09-12-003 (OTP echo removal) — CR-003 cannot ship until this CR closes |
| **Blast radius** | MEDIUM (single backend HTTP integration + potential CRM-side changes owned by another team) |

---

## 1. Problem

Impact Analysis of CR-2026-09-12-003 surfaced 3 facts on 2026-09-12:

1. **Backend `send_otp()` at `server.py:437–466` does NOT send SMS.** Code truth (grep): the only "delivery" is `logging.info(f"OTP for {phone}: {otp}")` and echoing `otp_for_testing` in the response. No integration with any SMS provider (CRM, MSG91, Twilio). Line 463 has a comment *"In production, send OTP via SMS provider (Twilio/MSG91)"* — a **TODO left unimplemented**.
2. **Frontend has a separate CRM-SMS integration** at `frontend/src/api/services/crmService.js:287–314` — `crmSendOtp()` posts to CRM `/customer/send-otp`. But it is called **only from the password-setup flow** (`PasswordSetup.jsx:126,250`), NOT from customer-login (`AuthContext.jsx:221` still hits our backend's `/api/auth/send-otp`).
3. **Owner statement 2026-09-12:** *"CRM flow is not live we might need to build its half baked"*. Interpretation: the CRM SMS path exists as a frontend function but the end-to-end delivery pipeline is incomplete somewhere in the chain (CRM-side, backend-side, DLT compliance, or all three).

**Business impact today:** Customer login on the production customer app depends on the security bug (`otp_for_testing` echo) being present. Any user opening the network tab sees their own OTP — but no user of ours actually receives an SMS. Any attacker with a valid restaurant subdomain URL can enumerate registered phones and read their OTPs.

**Blocking chain:**
- CR-003 removes the echo → login stops working
- Login can't work without SMS delivery
- SMS delivery requires this CR

---

## 2. Scope

### IN
- **Discover** the exact state of "half-baked" — what works, what doesn't, in the chain: backend caller → CRM API → SMS provider (CRM's underlying gateway) → carrier → user device.
- **Design** the full backend-driven flow: `send_otp()` in `server.py` calls CRM's SMS endpoint (or a re-worked CRM SMS endpoint if owner + CRM team decide to redesign that too).
- **Coordinate** with the CRM team for whatever CRM-side changes are needed (DLT template registration, sender ID configuration, rate-limit config, response contract).
- **Implement** backend-to-CRM HTTP call with retry/timeout/idempotency. Add `CRM_SMS_URL` (and optional `CRM_API_KEY`) as backend env keys.
- **End-to-end test** SMS delivery to real Indian mobile numbers (UAT phones list to be provided at Planning).
- **Document** the contract for CR-003 to consume — endpoint URL, request payload shape, response shape, error codes, retry policy.
- **Hand off** a stable contract that CR-003's `send_otp()` calls.

### OUT (explicitly, deferred to other CRs)
- Any change to `frontend/src/api/services/crmService.js` — that path is used by password-setup and stays as-is unless the CRM contract itself changes shape
- CR-003's actual OTP echo removal, Mongo store, attempt cap, hash — that is CR-003's job; this CR only builds the delivery pipeline it will call
- CORS / rate-limit on `/api/auth/*` — that is CR-004
- Any refactor of CRM authentication token handling (already handled by `crmFetch` in `crmService.js`)
- Non-India carriers (Twilio, international) — only relevant if the CRM SMS path fails discovery and we pivot to MSG91 as an alternative

### GREY ZONE (Planning decides)
- Whether this CR touches CRM's own codebase (MyGenie CRM) or only our backend. That depends on where the "half-baked" pieces are — Planning discovers this during Impact Analysis.
- Fallback strategy if CRM cannot be completed on our timeline (does this CR pivot to MSG91?)

---

## 3. Classification

Integration · **Final: CR — Prerequisite Integration**

Not a bug (nothing broken — feature simply doesn't exist). Not a pure feature (unblocks a P0 security fix). Best classification: prerequisite integration CR that unblocks CR-003.

---

## 4. Duplicate Check

| Related item | Relationship | Verdict |
|---|---|---|
| CR-2026-09-12-003 (OTP echo removal) | Consumer of this CR's output — this CR must CLOSE first | **RELATED — this is CR-003's prereq** |
| CR-2026-07-03-004 (FE fetch timeouts) | Built the `crmFetch` helper this CR's backend caller pattern will mirror | **REUSE pattern — not duplicate** |
| `frontend/src/api/services/crmService.js:287–314` | Existing frontend `crmSendOtp` used for password-setup only | **REUSE the endpoint shape if CRM contract is unchanged** |
| GAP-003 (OTP leak) | Root cause CR-003 fixes; this CR is a prereq to enable that fix | **RELATED — supports GAP-003 closure** |
| CR-2026-09-12-004 (CORS + rate-limit) | Sibling Wave-1 security CR; runs after CR-003 | **DISTINCT** |
| Any pre-existing CRM SMS work | **Owner-input needed** — is there a work-in-progress branch / doc / half-implementation on the CRM side that this CR should complete rather than restart? | **RESOLVE at Planning** |

**Verdict: DISTINCT as a CR** — no existing MyGenie Customer App CR covers "finalize CRM SMS" today. If MyGenie CRM has its own internal ticket for this, this CR coordinates with that ticket rather than duplicating it.

---

## 5. Blast Radius

**MEDIUM.** Direct code touch is small (~30–50 lines in `server.py` + 2 env keys + Planning-decided CRM-side changes). But three amplifiers make the risk HIGH:

1. **Live customer login flow.** Any breakage during rollout = login outage. Requires phased deploy + feature flag + rollback plan.
2. **India DLT regulatory compliance.** SMS templates must be registered with the local telecom operator. Un-registered = SMS blocked at carrier = no delivery = login outage.
3. **Cross-team coordination.** Success depends on the CRM team completing whatever "half-baked" means on their side. Not fully in Customer App team's control.

---

## 6. Evidence (code truth — 2026-09-12)

| Fact | Source |
|------|--------|
| Backend has NO SMS integration today | `grep -rn "sms\|SMS\|msg91\|twilio\|crm" /app/backend/` → 0 match (only the TODO comment) |
| Backend `send_otp()` currently returns `otp_for_testing` in response + logs OTP server-side | `server.py:462–466` |
| Frontend has `crmSendOtp()` calling `POST /customer/send-otp` on CRM | `crmService.js:287, 291, 314` |
| `crmSendOtp()` is only imported by `PasswordSetup.jsx` (not `AuthContext.jsx`) | `grep -rn crmSendOtp frontend/src` |
| CRM base URL configured via `REACT_APP_CRM_URL` on FE — `https://crm.mygenie.online/api` | `frontend/.env` |
| Same CRM base is NOT set on backend today | `backend/.env` — no `CRM_URL` / `CRM_SMS_URL` key |
| Existing pattern for backend → CRM would follow `crmFetch` (retry + timeout + token handling) — but implemented on FE only | `crmService.js` |
| DLT registration status: **UNKNOWN** — owner input needed | — |
| SMS template registration status: **UNKNOWN** — owner input needed | — |
| Sender-ID configuration: **UNKNOWN** — owner input needed | — |

---

## 7. Prerequisites (owner-side, before Planning)

| # | Prerequisite | Purpose |
|---|---|---|
| 1 | Owner (or CRM team liaison) documents the current state of "half-baked" | Planning needs to know what to build vs what already exists |
| 2 | Access to CRM API contract for `/customer/send-otp` — endpoint URL, auth mechanism, request payload, response shape, error codes | Backend caller design |
| 3 | DLT registration status (registered / in-progress / not-started) | Regulatory pre-work |
| 4 | Approved OTP SMS template text (registered with telecom operator) | Message content |
| 5 | Sender ID (6-character DLT-registered) | SMS "from" |
| 6 | List of UAT phone numbers for end-to-end delivery testing (Indian mobiles) | QA |
| 7 | Fallback decision — if CRM cannot be completed within timeline, do we pivot to MSG91 in this CR or open a new CR? | Contingency |

Until items 1–5 are green, Planning is BLOCKED at the "discovery" step.

---

## 8. Owner decisions to be asked at Planning gate

Not asked here (Role 1 = Intake only). Recorded for the next Planning session:

- Which parts of the "half-baked" CRM stack does this CR own vs the CRM team?
- If DLT registration is not done, does this CR wait for it (delay) or pivot to MSG91 (change scope)?
- Feature flag / phased rollout design?
- Rollback contract if SMS deliverability collapses post-deploy?
- Approved SMS template + sender ID?

---

## 9. Blast Radius (repeat, per intake template)

**MEDIUM code, HIGH operational.** Small code surface amplified by production-live + regulatory + cross-team dependencies. Rollout will need a feature flag or a staged approach.

---

## 10. Exit criteria

CR closed when:
1. Backend `send_otp()` calls the CRM SMS endpoint (or the chosen equivalent) end-to-end.
2. Every UAT phone in the test list receives a real SMS within 30 seconds.
3. Failure modes handled: CRM 5xx → retry; CRM 4xx → clean error to user; timeout → clean error to user.
4. CRM API contract is documented in a stable form CR-003 can consume without further clarification.
5. Feature flag or staged rollout mechanism proven — a switch exists to disable the CRM call and fall back gracefully (Planning designs the exact fallback).
6. QA (Role 4) verifies at least 10 end-to-end deliveries with 0 failures on UAT phones.
7. `test_credentials.md` updated with any new CRM credentials used for testing.

---

## 11. Compact Role 1 output

```text
Intake complete: CR-2026-09-12-017
Classification: CR — Prerequisite Integration
Severity: P0 (unblocks P0 CR-003)
Risk: HIGH (production login flow indirectly + regulatory + cross-team)
Duplicate check: DISTINCT (no existing CR; may coordinate with CRM-team ticket)
Evidence: captured (§6 — 6 code-truth facts + 3 unknowns to resolve)
Blast radius: MEDIUM code / HIGH operational
Docs updated: this file + change_requests/README.md + PRD.md
Next: Owner must (1) supply CRM contract + DLT status (§7 items 1–5) THEN (2) assign Role 2 (Planning) for Impact Analysis.
GATE DISCIPLINE: no plan, no code.
```

**NEVER CODE DURING INTAKE.** Nothing implemented in this session. CR-003 remains BLOCKED on this CR closing.
