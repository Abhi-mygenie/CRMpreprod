# Intake — ENV-002: Production edge verification for `/api/scan/*` public reads (Cache-Control passthrough + X-Forwarded-For trust)
**Date**: 2026-10-09 · **Role**: Intake Agent (Role 1) · **Source**: owner 2026-10-09 "register CR to check these issues by infra team on production" ← CR-094 self-test NOTE-1/NOTE-2 (`qa/CR_094_QA_HANDOVER.md`) · **No code changed.**

| ID | Class | Severity | Risk | Dup check | Evidence | Blast | Status |
|---|---|---|---|---|---|---|---|
| **ENV-002** | ENVIRONMENT — infra verification on production (`crm.mygenie.online`) | P2 | LOW (read-only checks; no CRM code) | DISTINCT (ENV-001 = r69 loyalty off; GAP-11 = FastAPI version drift on live — related "live ≠ repo" family, different fact) | captured on preview | SMALL (Customer App caching + rate-limit correctness) | 📋 REGISTERED — owner: hand to infra team |

## 1. What was observed (preview, 2026-10-09)
| # | Fact | Evidence |
|---|---|---|
| F1 | Preview edge (`server: cloudflare`, `via: 1.1 google`) **rewrites** response `Cache-Control` to `no-store, no-cache, must-revalidate` on **every** route (`/api/health`, `/api/scan/loyalty-rules/689`, POST `/api/scan/auth/lookup`). | `curl -D -` via `REACT_APP_BACKEND_URL` vs `http://localhost:8001` — origin sends `public, max-age=60` for CR-094. |
| F2 | 61 sequential round-trips through the edge take > 60 s (≈1 s each) — i.e. the edge adds ~1 s latency per call to a route that answers in ms at origin. | R5 timing; localhost 62 calls < 5 s. |
| F3 | Rate limiters (`CR-089` skip-otp, `CR-093` lookup, `CR-094` loyalty-rules) key on the **first** entry of `X-Forwarded-For` (`scan.py:_client_ip`). Preview edge forwards a client-supplied XFF unchanged (tests spoof IPs successfully). | R5 / L8 / S3 tests all pass with spoofed XFF. |

## 2. Why production must be checked
- **C1 Cache-Control**: Customer App contract note (CR-094) promises `public, max-age=60`. If prod edge also forces `no-store`, the app re-fetches on every screen — correct but wasteful; the contract line must then be amended to "no caching" so Scan & Order don't rely on it.
- **C2 XFF trust (security-relevant)**: if the prod edge **does not overwrite/append** a trusted client IP, anyone can bypass all three IP buckets by sending a random `X-Forwarded-For` (limiters degrade to per-phone only). If the prod edge **replaces** XFF with its own hop IP for all clients, every diner shares one bucket (30/min skip-otp, 10/min lookup, 60/min loyalty-rules) → **false 429s for a whole restaurant**. Either failure mode is invisible from the repo; only infra can confirm header handling.
- **C3 Latency**: ~1 s per call at the edge on preview; if prod is similar, the Customer App pre-login screen (lookup + loyalty-rules) costs ~2 s before first paint.

## 3. Checks for the infra team (production, read-only)
| # | Check | Pass criterion |
|---|---|---|
| I1 | `curl -sD - -o /dev/null https://crm.mygenie.online/api/scan/loyalty-rules/689` | `cache-control: public, max-age=60` reaches the client (or document the override policy) |
| I2 | Same for `/api/health` | shows whether the override is global |
| I3 | From two different public IPs, call `/api/scan/auth/lookup` with **no** XFF header; inspect what origin receives (temporary debug log or `pos_request_logs` if enabled) | origin sees two distinct real client IPs in `X-Forwarded-For[0]` (or `X-Real-IP`) |
| I4 | Send a forged `X-Forwarded-For: 1.2.3.4` from outside | origin must **not** see `1.2.3.4` as first entry (edge appends/overwrites) — otherwise IP limiters are bypassable |
| I5 | 20 sequential `GET /api/scan/loyalty-rules/689` from one IP, measure p50/p95 | report latency; flag if > 300 ms p50 |
| I6 | Confirm which hop(s) sit in front of origin on prod (Cloudflare? LB? nginx?) and their header policy | documented in `RUNBOOK.md` |

## 4. Possible CRM follow-ups (NOT in scope of ENV-002; register only after infra answers)
- If I4 fails → CR: `_client_ip` must read a trusted header (`CF-Connecting-IP` / `X-Real-IP`) or use the **last** trusted hop instead of `XFF[0]` — touches 3 limiters, MEDIUM.
- If I1 shows global `no-store` → amend CR-094 consumer note + contract v1.1 ("no edge caching").
- If I5 is slow → separate infra/perf item.

## 5. Owner asks
- **Q1** Who owns this on infra side and by when? (blocks final wording of the CR-094 consumer note "Cache" line — currently says "verify on prod domain").
- **Q2** May infra enable `POS_REQUEST_LOGGING_ENABLED` briefly on prod for I3/I4, or should they use edge logs instead?

```
Intake complete: ENV-002
Classification: ENVIRONMENT (infra verification, production)
Severity: P2 · Risk: LOW · Blast radius: SMALL
Duplicate check: DISTINCT (related: ENV-001, GAP-11)
Evidence: captured (preview curl headers; R5 timing; XFF spoof success in R5/L8/S3)
Docs updated: this file · 00_register/ROI_MEASUREMENT_CR_REGISTER.md row 61 · CR_STATUS_DASHBOARD.md (row + transition) · qa/CR_094_QA_HANDOVER.md NOTE-1 → ENV-002 · PRD.md
Owner decisions: Q1 infra owner/date · Q2 logging on prod for I3/I4
Next: owner hands I1–I6 to infra → results → Intake (CRM follow-up CR if I4 fails) · meanwhile "choose QA role for CR-094"
```
