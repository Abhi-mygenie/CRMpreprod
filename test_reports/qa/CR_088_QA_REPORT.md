# CR-088 /scan/* List Hygiene — QA Report
**Date:** 2026-10-09  **Agent:** T1 iteration_10

## Customer Token
Phone: 7505242126, r689 — obtained successfully

## Test Results

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| V1: GET /scan/orders?skip=0&limit=5 | 5 orders, total>0, skip:0, limit:5 | orders:5, total:76, skip:0, limit:5 | PASS |
| V2: GET /scan/orders?skip=5&limit=5 | different 5 orders, same total | orders:5, skip:5, limit:5 | PASS |
| V3: GET /scan/points/history?skip=0&limit=5 | total=real DB count | total:78, skip:0, limit:5 | PASS |
| V4: GET /scan/points/history?skip=20 | offset applied, total unchanged | skip:20, total:78 | PASS |
| V5: GET /scan/wallet/history | has total and skip | total:0, skip:True | PASS |
| V6: GET /scan/loyalty | has expiring_soon (int≥0) and expiring_date | expiring_soon:300, expiring_date:present | PASS |
| V7: GET /api/openapi.json | 200, openapi version, ≥186 paths | 3.1.0, 186 paths | PASS |
| V8: GET /scan/orders (no params) | skip:0, limit:20 backward compat | skip:0, limit:20 | PASS |

## Ad-hoc Tests
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| skip=-5 | clamped to 0 | skip:0 | PASS |
| limit=100 | clamped to 50 | limit:50, orders:50 | PASS |

**Result: 10/10 PASS** ✅
