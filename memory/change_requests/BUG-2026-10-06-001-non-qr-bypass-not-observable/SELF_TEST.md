# SELF-TEST — BUG-2026-10-06-001 (Role 3, 2026-10-07)

Environment: preview pod, backend `localhost:8001`, frontend via preview URL, shared Mongo (read + sentinel-rid writes only; sentinel cleaned). **No real restaurant's config was modified** — enforcement was simulated by intercepting `GET /api/config/689` in Playwright and setting `allowNonQrOrders: false` in the response.

| # | Plan ref | Result | Evidence |
|---|---|---|---|
| T1 (C1 only) | V1 | **PASS** | walk-in URL `?type=walkin&tableId=0` → menu loaded; POST body `{checkpoint: landing, scanned_room_or_table: walkin, decision: valid-qr, allowed: true}` |
| T1 (C2, C3) | V1 | **DEFERRED → QA** | rid 689 items all SOLD OUT in preview; needs orderable test rid (478) |
| T2–T4 | V2 | **DEFERRED → QA** | 716 / edit-mode / takeaway paths |
| T5 | V3 | **PASS** | real config for 689 (flag absent) → menu loaded, **0** diagnostics POSTs |
| T6 | V4 | **PASS** | direct URL, no scan → "Session Expired" modal; POST body `{checkpoint: landing, decision: non-qr-dinein, allowed: false}` + all legacy keys unchanged |
| T7 | V5 | **DEFERRED → QA** | hotspot regression (order placement all channels) |
| T8 | V6 | **PASS (by code)** | `postNonQrBlock` unchanged — try/catch + sendBeacon; call site has no await |
| T9 | V7 | **PASS** | payload keys exactly: `restaurant_id, checkpoint, scanned_room_or_table, final_table_id, is_edit_mode, is_authenticated, decision, allowed` |
| T10 | V8 | **PASS** | `$group` by `{decision, allowed}` on sentinel rid returned `{non-qr-dinein,false}: 200`, `{valid-qr,true}: 1001` |
| T11 | D4 | **PASS** | 5 blocks + 1 legacy + 1005 allows → blocks bucket 6 (all survive), allows bucket capped ≈1000 |
| T12 | D4 legacy | **PASS** | +201 blocks → blocks bucket 200, legacy doc (oldest ts) evicted first, allows bucket untouched |
| T13 | D6 | **DEFERRED → QA** | needs logged-in diner + add-to-cart |
| T14 | S4 | **PASS (by code)** | `console.log` → `logger.order(...)`; logger is prod-silent unless `debug:order` |
| T15 | build | **PASS** | webpack compiled; only pre-existing hook-deps warnings in untouched files |
| T16 | tests | **PASS** | `pytest -m smoke backend/tests/smoke/test_bug_2026_10_06_001.py` → 4/4 |

Observation (not a regression): under 20-way concurrent POSTs the allow bucket briefly read 1001 — the count-then-delete cap was never atomic (same as pre-change code); it converges on the next insert. Noted for QA as a NOTE, not a defect.

Code markers: `grep -rc "BUG-2026-10-06-001"` → orderAccessPolicy.js 1 · LandingPage.jsx 2 · MenuItems.jsx 3 · ReviewOrder.jsx 1 · server.py 4 · test file 1.
