# MyGenie CRM — PRD

**Last updated**: 2026-08-04  
**Branch**: main  
**DB**: Remote MongoDB 52.66.232.149:27017/mygenie

---

## Product

Restaurant CRM — loyalty, coupons, WhatsApp marketing, POS integration, e-invoicing.  
Stack: React 19 + FastAPI + MongoDB + APScheduler.

---

## Implemented (shipped + QA passed)

### This session (2026-08-04)

| ID | What |
|---|---|
| BUG-020 | "Unknown" customer name → WhatsApp sends "Namaste **Guest**" |
| BUG-021 | POS order webhook now updates existing customer name/email |
| BUG-022 | Migration re-sync name guard — real names preserved |
| BUG-023 | `weasyprint` in requirements.txt + invoice DB insert before PDF |
| CR-069 fix | `button_param_value` — correct AuthKey field for dynamic URL token |
| CR-073 | AuthKey-created templates imported into CRM on sync with button data |

### Previous sessions (reference)

CR-002 to CR-043 — see CR_STATUS_DASHBOARD.md for full history.  
Notable: loyalty engine, coupon engine (142 QA), campaigns (all phases), WhatsApp variables, template builder, customer import/export, message report download, webhook composite key fix.

---

## Active Queue

| Priority | ID | Title | Status |
|---|---|---|---|
| P0 | — | Production deploy (push all 2026-08-04 fixes) | Pending |
| P1 | BUG-024 | Template button URL missing `/api/invoices/` path | Q1 open |
| P1 | CR-071 | B2B customer pipeline (6 gaps) | Ready for planning |
| P1 | CR-072 | Hotel document upload + POS recall | Q1 pending POS payload |
| P1 | — | switch send_bill → kmfinalbill (Kunafa Mahal) | Owner action |
| P2 | — | Migration sync-orders name update (INV-013B ext) | Needs intake |

---

## Test credentials

| Account | Password | Tenant |
|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Kunafa Mahal (689) |
| owner@hungry.com | Qplazm@10 | Hungry Keya (634) |
| owner@palmhouse.com | Qplazm@10 | Palm House (558) |

---

## Backlog (P2/P3)

CR-046 to CR-059 (audit remediation batch) — see CR_STATUS_DASHBOARD.md.  
CR-067 (template deletion), CR-068 (validate template dry-run).
