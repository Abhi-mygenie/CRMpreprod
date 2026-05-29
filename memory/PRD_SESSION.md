# MyGenie CRM — PRD (Session Memory)

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git, branch 29-may. Wipe local /app, then pull the remote repo directly into /app. Tech stack: Python backend, React frontend, MongoDB database. Use remote MongoDB only. Do not use any local database. Do not call or modify the database unless explicitly required. Build the project as-is. Do not run a testing agent. Post deployment, read README and follow instructions, no code edits.

## Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React 19 (CRA/craco) + Tailwind + Radix UI on port 3000
- **Database**: Remote MongoDB at 52.66.232.149:27017/mygenie (shared prod + preview)
- **WhatsApp**: AuthKey.io integration (per-tenant keys in DB)
- **Branch**: `29-may`
- **Preview URL**: https://c158ad1e-e16c-449c-b11f-8eaabb028c19.preview.emergentagent.com

## What's Been Implemented This Session (2026-05-29)

### CR-015 — WhatsApp Template Variable Mapping Fidelity — 🟢 CLOSED
- T7 script narrowed + committed ({{7}} points_earned → points_balance; {{4}}/{{5}} already fixed via UI)
- T2 DB normalization skipped (owner decision — resolver handles int→str)
- {{6}} semantic mismatch found during live test (template says "Loyalty Points Used" but mapped to points_earned) → fixed to loyalty_points_used
- Full template-vs-mapping audit: 4 R689 templates, 18 slots, 0 remaining mismatches
- Live test passed: orders 869331 + 869333, 7/7 slots correct, status=read

### CR-017 — /pos/max-redeemable Projected Points Earned — 🟢 CLOSED
- Hot production fix: added projected_points_earned, projected_earn_percent, earn_ratio_display to /pos/max-redeemable
- POS can now show "you'll earn X points" before payment
- POS handoff doc updated

### Documentation
- DECISIONS_LOG.md: 10 new entries logged this session
- CR_STATUS_DASHBOARD.md: fully updated with session chronology + handoff
- ROI_MEASUREMENT_CR_REGISTER.md: CR-017 registered (row 21)
- README.md: pod URL updated
- test_credentials.md: created with owner login + test customer
- 2 closeout docs created (CR-017 + CR-015 updated)

## Prioritized Backlog

### P0 — Next
- **CR-014** E-Invoice PDF + Mobile HTML Link — ⏸ parked, 2 owner questions pending (§15.6 C1+C2)

### P1 — This Sprint (if time)
- CR-015 live test with coupon-applied order (AC-9 in closeout)

### P2 — Next Sprint
- **CR-016** Dynamic Event Registry + Trigger Config UI — deferred, §7 Q1-Q8 open

### Backlog
- CR-011 Coupon Optimizer
- CR-012 WhatsApp Template Builder
- CR-013 Template Gallery (blocked by CR-012)
