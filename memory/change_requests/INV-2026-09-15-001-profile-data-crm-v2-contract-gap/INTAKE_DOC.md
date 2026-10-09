# INTAKE DOC — INV-2026-09-15-001

## Item Identity

| Field | Value |
|-------|-------|
| **INV ID** | INV-2026-09-15-001 |
| **Title** | Customer Profile page (`/profile`) — Orders / Points / Wallet tabs fail to load on CRM v2; CRM API contract verification request (Profile data + OTP routes) |
| **Classification** | INVESTIGATION (read-only, no code — Alpha v0.1 §8 Role 6) |
| **Date Registered** | 2026-09-15 |
| **Reported By** | Owner, 2026-09-15: *"when user goes to profile he shd be able to all this data — let CRM verify API contract and give it to us — also include for OTP let CRM verify if OTP routes works — no code edit"* |
| **Severity** | **P1** — core customer feature (order history / points / wallet) broken, no workaround for customer |
| **Risk** | — (read-only investigation) |
| **Status** | ✅ INVESTIGATION COMPLETE — root cause confirmed, awaiting CRM team contract confirmation |
| **Parent** | CR-2026-09-12-001 (Wave 2) |
| **Related** | INV-2026-09-12-001 (legacy backend `customer/*` route trace — narrow scope, still valid), CR-2026-09-14-001 (OTP quarantine), CR-2026-09-12-017 (CRM SMS finalisation, deferred) |
| **Blast radius** | MEDIUM — 1 FE service file (`crmService.js`) + 1 page (`Profile.jsx`) on our side; CRM-side endpoint availability owned by CRM team |

## 1. Owner report (verbatim intent)

Owner disputes the conclusion from INV-2026-09-12-001 that "customer routes are dead" — because the Profile page visibly exists and customers must see their profile, orders, points and wallet there. Owner wants:

1. A clear answer: **where does Profile data come from, and is it working?**
2. A **CRM API contract** the CRM team can verify and hand back to us.
3. The **OTP routes** included in that same CRM verification.
4. **No code edits.**

## 2. Question for this investigation

Why do the Orders / Points / Wallet tabs on `/profile` fail, and which CRM endpoints must the CRM team confirm so the Customer App can be corrected in a follow-up CR?

## 3. Output feeds

- `CRM_CONTRACT_VERIFICATION_REQUEST.md` (this folder) → to be sent to the CRM team.
- Future CR (Planning role, after CRM reply): `crmService.js` v2 branches for `crmGetOrders` / `crmGetPoints` / `crmGetWallet`.
- CR-2026-09-12-017 / CR-2026-09-12-003 (OTP) — CRM's OTP answers unblock or re-defer those.

```text
Intake complete: INV-2026-09-15-001
Classification: INVESTIGATION
Severity: P1
Risk: — (read-only)
Duplicate check: RELATED (INV-2026-09-12-001 is the backend-route trace; this item is the CRM-side data path) — DISTINCT
Evidence: captured (live CRM probes, code refs) — see INVESTIGATION_REPORT.md
Blast radius: MEDIUM
Docs updated: INTAKE_DOC.md, INVESTIGATION_REPORT.md, CRM_CONTRACT_VERIFICATION_REQUEST.md, ../README.md
Next: Send CRM_CONTRACT_VERIFICATION_REQUEST.md to CRM team → Planning (Role 2) on reply
```
