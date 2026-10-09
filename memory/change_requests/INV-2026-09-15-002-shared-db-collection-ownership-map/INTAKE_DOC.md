# INTAKE DOC — INV-2026-09-15-002

## Item Identity

| Field | Value |
|-------|-------|
| **INV ID** | INV-2026-09-15-002 |
| **Title** | Shared-MongoDB collection ownership map — who reads / who writes each collection (Customer App backend vs CRM), defaults ownership, config write-lock, auth-secret overlap |
| **Classification** | INVESTIGATION (read-only, no code — Alpha v0.1 §8 Role 6) |
| **Date Registered** | 2026-09-15 |
| **Reported By** | Owner fact "CRM and us use the same database" + decisions **D-A (Option A)**, **OD-7 (we own config writes)**; INV-2026-09-15-001 §10 S1/S3/S5 |
| **Severity** | **P1** — gates every data-destructive CR (CR-006, CR-014) and the Option A retirement of `/api/customer/*` |
| **Risk** | — (read-only). Output classifies items as CRITICAL. |
| **Status** | 📝 REGISTERED (Role 1 done) — can start on owner "go"; needs CRM counterpart input |
| **Parent** | CR-2026-09-12-001 (Wave 2) |
| **Blocks** | CR-2026-09-12-006 (backend split / route deletion), CR-2026-09-12-014 (MySQL migration), CR-2026-09-12-010 (config defaults SSOT) |

## 1. Questions

1. For every collection our `server.py` touches (`customer_app_config`, `orders`, `status_checks`, `users`/customers, dietary tags, uploads metadata, others found by grep): **who reads, who writes** — our backend, CRM, POS ingest?
2. **Config write-lock (OD-7):** does any CRM UI actually call `PUT /scan/config/{rid}` today? If yes, what does it write? Request CRM to make it read-only or remove.
3. **Defaults ownership (CR-010):** our `RestaurantConfigContext` defaults + backend defaults vs CRM `AppConfigUpdate` defaults — which wins when a key is absent? Enumerate divergent defaults.
4. **Dietary tags:** our `/api/dietary-tags` vs CRM `/scan/menu/dietary-tags/{rid}` — same collection? same writer?
5. **Auth overlap (S5):** do our `JWT_SECRET` and CRM's HS256 secret coincide? Do our tokens validate on CRM or vice-versa? (Ask CRM; do **not** print secrets.)
6. Which of our backend routes become **retirement candidates** under Option A (readers of customer data that CRM now serves), and which must stay (admin, uploads, POS proxy, config, diagnostics)?

## 2. Method (≤10 steps)
1. Grep `server.py` for `db.<collection>` → collection × operation (find/insert/update/delete) table.
2. Cross-reference CRM `INV_017_CUSTOMER_APP_CONTRACT_GAPS.md` §2 + contract for CRM's collections (`db.orders`, customers, points/wallet ledgers, `customer_app_config`).
3. Read-only Mongo probe on UAT (counts + one sanitised sample per collection, no PII in report) to confirm shared collections.
4. Compare default maps (FE context, backend, CRM `AppConfigUpdate`).
5. Send CRM a 6-question sheet (Q2, Q4, Q5 + collection list).
6. Produce **OWNERSHIP_MAP.md** signed-off by owner + CRM → feeds CR-006 / CR-014 / CR-010 scope.

## 3. Duplicate check
| Item | Verdict |
|---|---|
| INV-2026-09-12-001 (route usage trace) | RELATED — that was routes; this is data. Its "drop collections" output is **superseded** by this INV. |
| CR-2026-09-12-010 (config defaults SSOT) | RELATED — consumer of Q3 |
| BUG-001 / BUG-002 (identity + API surface) | RELATED — Option A + this map resolve both |

## 4. Deliverable
`OWNERSHIP_MAP.md` in this folder + CRM answers archived. No code.

```text
Intake complete: INV-2026-09-15-002
Classification: INVESTIGATION
Severity: P1 (gating)
Risk: — (read-only)
Duplicate check: RELATED (INV-2026-09-12-001 superseded on collections; CR-010) — DISTINCT
Evidence: shared-DB proof in INV-2026-09-15-001 §10
Blast radius: LARGE (informs CR-006/010/014)
Docs updated: this file, ../README.md, ../../PRD.md
Next: Owner "go" → Investigation (Role 6); CRM question sheet
```
