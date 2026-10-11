# QA Handover — CR-099: relax phone sanitiser in CRM Add/Edit Customer
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_099_IMPLEMENTATION_PLAN.md` · **Risk**: LOW (frontend input only) · **Frontend + backend API test.**
**Creds**: `owner@kunafamahal.com / Qplazm@10` · URL from `/app/frontend/.env`

## What changed (1 file, markers `# CR-099` not added — 4-line removal)

| File | Lines | Before | After |
|---|---|---|---|
| `CustomersPage.jsx` | 1910 | `e.target.value.replace(/\D/g, '')` | `e.target.value` |
| `CustomersPage.jsx` | 1914 | `maxLength={10}` | `maxLength={15}` |
| `CustomersPage.jsx` | 2447 | `e.target.value.replace(/\D/g, '')` | `e.target.value` |
| `CustomersPage.jsx` | 2451 | `maxLength={10}` | `maxLength={15}` |

Not touched: backend · `CustomerDetailPage.jsx` · `core/phone.py`

## Self-test — V2/V3 PASS (API-level)

| V | Check | Result |
|---|---|---|
| V2 | `POST /api/customers` `{phone:"+91 98765 43201"}` → stored as `9876543201` | ✅ |
| V3 | `PUT /api/customers/:id` `{phone:"098765 43201"}` → stored as `9876543201` | ✅ |

Note: V1 (UI typing test) requires Playwright with MyGenie SSO — covered by QA.

## QA asks
1. Open Add Customer modal → type `+91 98765 43210` in phone field → confirm `+`, spaces accepted (not stripped); submit → customer created with `phone:9876543210`.
2. Open Edit Customer modal → paste `098765 43210` → confirm leading `0` accepted; save → stored as `9876543210`.
3. Confirm invalid phone (e.g. `0000000000`) → backend returns `400 "Enter a valid mobile number"`, customer not created.
4. Report → `qa/CR_099_QA_REPORT.md` + `test_reports/iteration_10.json` (or next).
