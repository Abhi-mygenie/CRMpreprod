# MyGenie CRM — Agent Onboarding README

> **🛑 If you are an agent picking up this repo, read this file FIRST, in full, before touching any code.**
> All other docs are referenced from here in the order you should read them.

---

## 1. What this project is

| | |
|---|---|
| **Product** | Multi-tenant restaurant CRM (loyalty, coupons, WhatsApp automation, POS integration, feedback, segments) |
| **Tech stack** | FastAPI (Python) backend + React 19 (CRA/craco) frontend + remote MongoDB + AuthKey.io for WhatsApp |
| **Repo origin** | `https://github.com/Abhi-mygenie/CRMpreprod.git` branch `28-may` |
| **Working tree** | `/app` (this preview pod) |
| **Production** | `https://crm.mygenie.online` (owner manages) |
| **Primary live-test tenant** | R689 Kunafa Mahal — `pos_0001_restaurant_689` |

---

## 2. MANDATORY first-read order (do not skip)

Read in this exact sequence. Stop at any item if the question that brought you here is answered:

```
1. README.md                                  ← you are here
2. CR_STATUS_DASHBOARD.md                     ← what's done, in flight, parked
                                                (especially the Latest Session Snapshot at the top)
3. DECISIONS_LOG.md                           ← every owner-locked decision so far
4. PRD.md                                     ← full product + sprint context (513 lines)
5. crm/crm_roi_sprint/00_register/
       ROI_MEASUREMENT_CR_REGISTER.md         ← every CR ever, with links to discovery/planning/impl/qa
6. For the CR you are about to work on:
       crm/crm_roi_sprint/discovery/CR_XXX_*.md      ← problem framing
       crm/crm_roi_sprint/planning/CR_XXX_*.md       ← locked plan (if exists)
       crm/crm_roi_sprint/implementation/CR_XXX_*.md ← closeout / current state
       crm/crm_roi_sprint/qa/CR_XXX_*.md             ← acceptance evidence
7. RUNBOOK.md / AGENT_PLAYBOOK.md (when running ops or coding standard patterns)
8. test_credentials.md (if auth flow involved)
```

### Conditional reads (read these IF your CR touches the relevant area)

```
• crm/crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md
    READ-ONLY baseline (209 lines). Status: `crm_1_0_baseline_closed_production_promotable_2026_05_26`.
    Required BEFORE touching any of:
      - loyalty engine (points earn, redemption, L1–L4 migration)
      - coupon engine (V1–V3-C)
      - coupon admin UI
      - POS order ingestion / POS contract
    Captures what was already working when this sprint began. Never modify; if it must change, that's a baseline-amendment CR.
```

If the owner says "Resume CR-XYZ", the discovery doc for that CR has a `Resume signal` section at the bottom telling you exactly which questions to ask next.

---

## 3. Active sprint snapshot

**Live status of every CR** → see `CR_STATUS_DASHBOARD.md`.

**Sprint name**: ROI Measurement / CRM (`crm_roi_sprint`)
**Sprint phase**: late-stage execution — multiple closed CRs, three parked discoveries awaiting owner answers

---

## 4. CR lifecycle protocol

Every change request MUST move through these phases. Skipping phases is the #1 source of rework.

```
Phase 0 — Discovery  → discovery/CR_XXX_*.md
       Problem framing, evidence from codebase, fields-gap matrix, risks,
       owner-only decisions listed at bottom

Phase 1 — Planning   → planning/CR_XXX_*.md
       Locked decisions, file plan, API contracts, DB schemas, test plan
       Owner approves planning doc before code is written

Phase 2 — Implementation → implementation/CR_XXX_*.md (closeout doc)
       Code lands in file-by-file commits. Each commit gets a handover note
       inside the closeout doc.

Phase 3 — QA + Live Test → qa/CR_XXX_*_QA_REPORT.md AND/OR _LIVE_TEST_REPORT.md
       Acceptance criteria matrix; live trace; closes the CR.

Phase 4 — Handoff (only for sprint-closing or system-wide CRs) → handoff/
       Baseline freeze documents.
```

**Status codes use snake_case**, e.g. `cr014_discovery_phase_0_parked_awaiting_2_final_confirmations`, `cr_004_p3_5_closed_live_test_passed`. Every register row + dashboard row uses the SAME status code as the CR's own docs.

---

## 5. How to resume any CR

Owner says: **"Resume CR-XYZ"**.

Agent does:
1. Open `crm/crm_roi_sprint/discovery/CR_XYZ_*.md` end-to-end
2. Scroll to the "**Resume signal**" or "**PARK status**" section near the bottom
3. Ask the owner the listed open questions (usually labeled Q1, Q2, ... in §7 or §8)
4. Once answers are in, move to Phase 1 → write `planning/CR_XYZ_PHASE_1_PLAN.md`
5. After planning approved → implementation
6. After implementation → QA report + live test
7. Update `CR_STATUS_DASHBOARD.md` after every phase transition

**Never** start coding on a parked CR without re-reading the discovery doc first. State drift between sessions is the #2 source of rework.

---

## 6. How to register a NEW CR

1. Find next CR number in `crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` (currently up to CR-016 as of 2026-05-28)
2. Create `crm/crm_roi_sprint/discovery/CR_<NNN>_<SLUG>_DISCOVERY.md` following the existing structure (Problem statement → Evidence → Scope → Out-of-scope → Risks → Owner questions → Effort → DoD → Park status)
3. Add a row to the register with: id, name, scope, doc links, status code
4. Add a row to `CR_STATUS_DASHBOARD.md` with the status light
5. If the CR touches a system-wide concern, add 1 line to `PRD.md` §11
6. Park the CR with `Resume signal` at the bottom of its discovery doc until owner gives the go

---

## 7. Environment + URLs

| Thing | Value |
|---|---|
| Backend internal | `http://localhost:8001` (all routes `/api/*`) |
| Frontend internal | `http://localhost:3000` |
| **Preview external** (current pod, POS + AuthKey webhook point here) | `https://c158ad1e-e16c-449c-b11f-8eaabb028c19.preview.emergentagent.com` |
| **Production** | `https://crm.mygenie.online` |
| Remote MongoDB | `mongodb://...@52.66.232.149:27017/mygenie` (shared between prod + preview) |
| `MONGO_URL` location | `/app/backend/.env` |
| `REACT_APP_BACKEND_URL` location | `/app/frontend/.env` |
| AuthKey egress IP | `157.245.105.3` (DigitalOcean NY) |
| WhatsApp webhook endpoint | `POST /api/whatsapp/status-callback` |
| POS order endpoint | `POST /api/pos/orders` (header `X-API-Key`) |
| Supervisor | `sudo supervisorctl restart backend frontend` |
| Backend logs | `tail -n 200 /var/log/supervisor/backend.err.log` |

---

## 8. Credentials map (values live in `test_credentials.md`, NOT here)

| Account | Where to find | Notes |
|---|---|---|
| R689 owner login | `test_credentials.md` | `owner@kunafamahal.com` |
| AuthKey API key | `db.users[<user_id>].authkey_api_key` (per-tenant) | NOT in .env |
| POS API key (R689) | `db.users[<user_id>].api_key` | header `X-API-Key` on `/api/pos/orders` |
| Test customer | abhishek jain / `7505242126` / `country_code=+91` | designated test recipient — safe to send WhatsApps to |
| Emergent LLM key (if used) | `emergent_integrations_manager` tool | not currently used in this sprint |

---

## 9. Critical "do nots"

1. **❌ Do NOT call `testing_agent_v3`** — owner has opted out for this sprint
2. **❌ Do NOT write to remote MongoDB from ad-hoc scripts** — reads via app code are fine; arbitrary writes require explicit owner approval per change
3. **❌ Do NOT push to production `crm.mygenie.online`** — owner does this manually
4. **❌ Do NOT modify `CRM_1_0_BASELINE_CLOSE_2026_05_26.md`** — read-only baseline
5. **❌ Do NOT add AuthKey or 3rd-party secrets to `.env`** — keys live in DB per tenant
6. **❌ Do NOT change `requirements.txt` or `package.json` by hand** — use `pip install ...` then `pip freeze >`, or `yarn add ...`
7. **❌ Do NOT skip the discovery → planning → implementation order** for non-trivial CRs
8. **❌ Do NOT auto-fix bugs surfaced during investigation** without explicit owner approval (e.g. "investigate only, no code edits")

---

## 10. Repo map

```
/app/
├── backend/                                # FastAPI
│   ├── core/
│   │   ├── whatsapp.py                     # send-side + variable resolver (CR-015 territory)
│   │   ├── whatsapp_variables.py           # variable REGISTRY (CR-015 expansion)
│   │   ├── loyalty.py / loyalty_jobs.py    # points + daily cron jobs (CR-016 signal sources)
│   │   └── database.py                     # Mongo client init
│   ├── routers/
│   │   ├── pos.py                          # POS webhook + send_bill trigger (CR-014, CR-015, CR-016)
│   │   ├── whatsapp.py                     # status-callback webhook (CR-004 P3.5 closure)
│   │   ├── auth.py                         # /profile endpoint (CR-014 fields go here)
│   │   ├── customers.py, coupons.py, wallet.py, scan.py, ...
│   │   └── ...
│   ├── services/
│   │   ├── pdf_report.py                   # existing reportlab analytics PDFs (CR-014 reference)
│   │   └── feedback_service.py
│   ├── models/schemas.py                   # POSOrderWebhook + AUTOMATION_EVENTS (CR-016 source)
│   ├── tests/test_whatsapp_*.py            # 65 baseline + 54 CR-015 = 119 passing tests
│   └── .env                                # MONGO_URL, DB_NAME
├── frontend/                               # React 19 + craco + Tailwind + Radix UI
│   ├── src/
│   │   ├── pages/                          # one file per page
│   │   │   ├── ProfilePage.jsx             # CR-014 will extend here
│   │   │   ├── MessageStatusPage.jsx       # CR-004 P3.5 dashboard
│   │   │   └── ...
│   │   ├── components/shared/
│   │   │   └── WhatsAppAutomationContent.jsx   # CR-016 will extend (events list + modal)
│   │   ├── components/ui/                  # Radix-based primitives
│   │   └── App.js
│   └── .env
└── memory/                                 # Documentation lives here
    ├── README.md                           # ← THIS FILE (entry point)
    ├── CR_STATUS_DASHBOARD.md              # live flat status board
    ├── PRD.md                              # narrative product + sprint doc
    ├── test_credentials.md                 # auth values (not in repo by convention)
    └── crm/
        ├── crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md    # READ-ONLY
        └── crm_roi_sprint/
            ├── 00_register/ROI_MEASUREMENT_CR_REGISTER.md          # narrative CR index
            ├── discovery/CR_XXX_*_DISCOVERY.md                     # Phase 0 docs
            ├── planning/CR_XXX_*_PLAN.md                           # Phase 1 docs
            ├── implementation/CR_XXX_*_CLOSEOUT.md                 # Phase 2 docs + handover notes
            ├── qa/CR_XXX_*_QA_REPORT.md / _LIVE_TEST_REPORT.md     # Phase 3 docs
            └── handoff/                                            # rare — sprint-close docs
```

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **Tenant** | One restaurant on the CRM. Identified by `user_id` (e.g. `pos_0001_restaurant_689`). |
| **R689** | Shorthand for Kunafa Mahal — the primary live-test tenant |
| **POS** | Restaurant point-of-sale system — pushes orders to `/api/pos/orders` |
| **AuthKey** | `authkey.io` — third-party WhatsApp BSP we use for outbound + delivery callbacks |
| **logid** | 32-char hex string AuthKey returns when accepting a send; used to link outbound row to inbound callbacks |
| **wamid** | Meta WhatsApp's own message identifier (returned by AuthKey in delivery callback) |
| **Signal** (CR-016) | A system-detectable hook like `pos.order.received`, `daily.birthday`. Events subscribe to signals. |
| **Event** | A WhatsApp send trigger — e.g. `send_bill`, `tier_upgrade`. Today hardcoded; CR-016 makes them dynamic. |
| **Variable** | A `{{N}}` slot in a Meta-approved template. Resolved from registry → event_data / customer / brand. |
| **Variable mapping** | Per-tenant: which registry variable maps to which `{{N}}` slot of a given template |
| **Mode A / B / C** (CR-014) | E-invoice modes: Tax Invoice / Simple Receipt / Hotel Folio |
| **PARKED** | CR is documented but waiting on owner decision before next phase |
| **Source signal cadence** | The natural firing rate of a signal — used in place of cooldown (CR-016 decision 2026-05-28) |

---

## 12. Emergency / debugging checklist

Run these IN ORDER when something is wrong.

### Services down?
```bash
sudo supervisorctl status
sudo supervisorctl restart backend frontend
curl -s http://localhost:8001/api/health
```

### Backend log dump
```bash
tail -n 200 /var/log/supervisor/backend.err.log
tail -n 100 /var/log/supervisor/backend.out.log
```

### MongoDB unreachable?
```bash
cd /app/backend && python3 -c "
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv; load_dotenv('.env')
async def t():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=5000)
    print(await c[os.environ['DB_NAME']].list_collection_names())
asyncio.run(t())
"
```

### WhatsApp not landing?
1. Check `whatsapp_message_logs` for a recent row matching the order — does it have `message_id` populated?
2. Check `whatsapp_callback_logs` for callbacks matching that `message_id` — what's the `verdict`?
3. See PRD §14 "Investigation playbook" for the full 3-step root-cause tree.

### Frontend page blank?
1. Browser console for errors
2. `tail -n 100 /var/log/supervisor/frontend.err.log`
3. Confirm `REACT_APP_BACKEND_URL` in `frontend/.env` matches current preview URL

### A CR is being requested but you don't know its status?
→ Read `CR_STATUS_DASHBOARD.md` FIRST. One line per CR. Saves you from grep-ing the register.

---

## 13. Suggested control-plane docs (governance layer)

Beyond this README + the existing `PRD.md` + `00_register/...`, the following docs would tighten project control:

| Doc | Purpose | Owner sign-off needed? |
|---|---|---|
| `CR_STATUS_DASHBOARD.md` | **CREATED** — live flat status board, updated on every phase transition | No, agent maintains |
| `DECISIONS_LOG.md` | Append-only log of owner-locked decisions with timestamp + quote | No, agent maintains |
| `RUNBOOK.md` | Step-by-step operational procedures (AuthKey URL registration, tenant seed, etc.) | Maybe, when first written |
| `AGENT_PLAYBOOK.md` | Common task recipes (add a variable, add a signal, add a profile field) | No, agent maintains |
| `test_credentials.md` | Auth values for testing (mentioned in §8) | Owner provides values |
| (already exists) `PRD.md` | Narrative product / sprint doc — read 3rd | — |

Recommended order of creation if you accept the proposal: `CR_STATUS_DASHBOARD.md` (done) → `DECISIONS_LOG.md` → `AGENT_PLAYBOOK.md` → `RUNBOOK.md`.

---

**End of README. If anything here was unclear, that's a doc bug — please report it before proceeding.**
