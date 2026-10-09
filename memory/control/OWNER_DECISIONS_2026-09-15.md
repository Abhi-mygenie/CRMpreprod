# Owner Decisions — 2026-09-15 (Customer surface ownership + INV-2026-09-15-001 follow-ups)

**Recorded by:** Intake agent (Role 1) · **Source:** owner messages 2026-09-15 · **Status:** FINAL unless owner revises in writing

| ID | Decision | Owner answer | Effect |
|---|---|---|---|
| **D-A** | Who owns the customer surface (login, profile, orders, points, wallet, addresses)? | **Option A — CRM owns customer data; Customer App owns the app shell.** App calls CRM `/scan/*` for all customer data. Our FastAPI backend keeps only: admin login, restaurant config CRUD, uploads, POS proxy, dietary tags, diagnostics. | CR-2026-09-15-001 (adapter) is the first delivery. Our `/api/customer/*` routes become retirement candidates under CR-2026-09-12-006 — **after** INV-2026-09-15-002 ownership map is signed by owner + CRM. |
| OD-1 | Which env is `crm.mygenie.online`? | **UAT.** Production CRM URL not yet known. | Release checklist item: prod `REACT_APP_CRM_URL` + prod `MONGO_URL` (shared CRM DB) confirmed together. |
| OD-2 | Wallet-tab gating source | **Moot** — shared DB, one `showWallet` flag. | CR-2026-09-15-001 gates on `RestaurantConfigContext.showWallet`. |
| OD-3 | `skip-otp` silently logs in customers who have a password | **Accept the behaviour.** | No CRM P-4 request. FE dead 409/429/Retry-After branches → P3 cleanup CR-2026-09-15-002. |
| OD-4 | Remove dead `x-api-key` / `REACT_APP_CRM_API_KEY` mechanism (CRM ignores it) | **Yes — after plan approval.** | Folded into CR-2026-09-12-007 scope; needs Implementation Plan + owner "go" before code. |
| OD-5 | ~28% POS-order linkage → many customers see "No orders yet" | Not answered — treated as **owner awareness**, no app item. | Note in CR-2026-09-15-001 acceptance criteria: empty list is valid. |
| OD-6 | Config source-of-truth investigation | Implied by D-A → **run INV-2026-09-15-002.** | Registered. |
| **OD-7** | Who is allowed to write restaurant config (`customer_app_config`)? | **We (Customer App admin UI).** CRM's `PUT /scan/config/{rid}` should be treated as read-only / to be disabled by CRM. | INV-2026-09-15-002 confirms whether CRM UI actually writes today; CRM to be asked to lock their PUT. |
| — | UAT tenant for planning/QA | Owner supplied restaurant-admin login (stored in `memory/test_credentials.md`, never in docs). Login resolves to **restaurant_id 689 (Kunafa Mahal), pos_id 0001**. | Use rid **689** as UAT tenant for CR-2026-09-15-001 planning + QA. |

## Standing rules derived

1. **Shared MongoDB with CRM** (verified INV-2026-09-15-001 §10): any collection/schema/index change is cross-team CRITICAL → owner **and** CRM approval, no exceptions.
2. Customer-data reads/writes go to CRM `/scan/*`. New customer-data code in our backend is out of policy under Option A.
3. Restaurant config writes go only through our admin UI → our `PUT /api/config`.
