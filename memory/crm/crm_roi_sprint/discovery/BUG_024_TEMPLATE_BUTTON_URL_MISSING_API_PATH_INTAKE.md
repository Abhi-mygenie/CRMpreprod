# BUG-024 — Template Button URL Missing `/api/invoices/` Path Prefix

**ID**: BUG-024  
**Reported**: 2026-08-04  
**Reporter**: Owner (Abhishek)  
**Role**: Intake Agent  
**Source investigation**: This session (URL mismatch investigation)  
**Status**: 🔴 OPEN  

---

## Owner Report

> URL shown: `https://crm-mygenie.mygenie.online/api/invoices/test`
> Question: is this what is expected?

Owner confirmed the correct URL format is `https://crm-mygenie.mygenie.online/api/invoices/{token}`.

---

## Classification

| Field | Value |
|---|---|
| **Type** | BUG — template configuration (wrong button base URL submitted to Meta) |
| **Severity** | P1 — "Bill" button in WhatsApp takes customer to wrong URL (404 page instead of invoice) |
| **Risk** | MEDIUM — fix requires Meta template re-submission + re-approval |
| **Duplicate check** | DISTINCT |
| **Blast radius** | MEDIUM — affects tenants using `bill_4`, `testbill1` templates |

---

## Evidence

### Affected templates

| Template | Tenant | wid | Current button URL | Correct button URL |
|---|---|---|---|---|
| `bill_4` | Kunafa Mahal (restaurant_689) | 43533 | `https://crm-mygenie.mygenie.online/{{1}}` | `https://crm-mygenie.mygenie.online/api/invoices/{{1}}` |
| `testbill1` | Kunafa Mahal (restaurant_689) | 43534 | `https://crm-stack-preview.preview.emergentagent.com/{{1}}` | `https://crm-mygenie.mygenie.online/api/invoices/{{1}}` |
| `final_bill` | Hungry Keya (restaurant_634) | 41354 | `https://crm.mygenie.online/{{1}}` | `https://crm.mygenie.online/api/invoices/{{1}}` |

### URL mismatch for `bill_4` with real token

```
Button URL (current):  https://crm-mygenie.mygenie.online/488d4aa7993a456d9c6923f2cd7d972d
                       → 404 (no route at /{token} on production server)

Button URL (correct):  https://crm-mygenie.mygenie.online/api/invoices/488d4aa7993a456d9c6923f2cd7d972d
                       → 200 ✅ invoice HTML served
```

### Invoice endpoint path (confirmed)

```
GET /api/invoices/{token}     ← correct backend path
    NOT /{token}
```

---

## Root Cause

When these templates were created in the **Template Builder** (CR-023), the owner entered:
- `https://crm-mygenie.mygenie.online/` as the base URL
- instead of `https://crm-mygenie.mygenie.online/api/invoices/`

This was submitted to Meta and approved. The base URL is **locked in the Meta-approved template** — it cannot be changed without full resubmission and re-approval.

---

## Fix Options

### Option A — Resubmit templates to Meta with correct URL (preferred for permanent fix)
Delete and resubmit each affected template with button URL:
- `https://crm-mygenie.mygenie.online/api/invoices/{{1}}`

Requires Meta re-approval (~hours to days). No CRM code change.

### Option B — Add redirect route at production server (immediate workaround)
Add a route/rewrite at `crm-mygenie.mygenie.online` nginx config:
```
location ~ ^/([a-f0-9]{32})$ {
    return 301 /api/invoices/$1;
}
```
Redirect `/{token}` → `/api/invoices/{token}`. No Meta resubmission needed. Works immediately.

### Option C — Add frontend route (React)
Add a route in React App.js: `<Route path="/:token" component={InvoiceRedirect} />` that redirects to `/api/invoices/:token`. No Meta resubmission needed.

---

## Owner Questions

| # | Question | Options |
|---|---|---|
| Q1 | Which fix approach? | (a) Resubmit templates (b) Nginx redirect (c) Frontend route |
| Q2 | Same fix for `final_bill` (`crm.mygenie.online/{{1}}`)? | (a) Yes — same pattern, fix all (b) Different domain, handle separately |

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | Tapping "Bill" button in WhatsApp → browser opens invoice HTML |
| AC-2 | URL in button resolves to `https://{domain}/api/invoices/{token}` |
| AC-3 | HTTP 200 returned for the invoice |

---

```
Intake complete: BUG-024
Classification: BUG (template configuration — wrong base URL on Meta submission)
Severity: P1
Risk: MEDIUM (Meta template resubmission OR nginx/frontend route change)
Duplicate check: DISTINCT
Evidence: 3 templates confirmed with wrong URL base, invoice endpoint path confirmed
Blast radius: MEDIUM (tenants using bill_4, testbill1, final_bill templates)
Owner decisions: Q1 (fix approach) + Q2 (final_bill same fix?)
Docs: discovery/BUG_024_TEMPLATE_BUTTON_URL_MISSING_API_PATH_INTAKE.md
Next: Owner answers Q1/Q2 → Planning (code or template config change)
```
