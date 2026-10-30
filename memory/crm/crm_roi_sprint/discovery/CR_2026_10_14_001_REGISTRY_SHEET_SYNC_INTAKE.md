# CR-2026-10-14-001 — Connect CRM registry to Tech Dashboard sheet (REGISTRAR)

**Role:** Intake Agent · **Date:** 2026-10-14 · **Type:** CR · **Status:** INTAKE
**Priority:** P1 · **Risk:** LOW · **Money path:** no
**Source:** Owner (Abhishek Jain) brief `brief-crm-agent.md` + `registry-sheet-contract-v1.5.md`
**Sheet:** CRM issue tracker — `1RFvI1MxmK6sYPBjejp78Sr_Ojcqo6UCRmgo0piEMBrc`

---

## 1. Request (what the owner asked)

Keep the CRM registry mirrored into the shared Google Sheet so the Tech Dashboard can read it, following contract v1.5. Sequence mandated by owner:
1. **(this gate)** Choose a registry format (internal to CRM) and report file name + location, fields per item, and item count. **Do not push.**
2. After owner confirms → first push to `All Items` + stage tabs + Summary; add **REGISTRAR** role to the operating prompt (push on every registry change).
3. Send the run report (brief §Deliverables) after every push.

## 2. Current state (investigation)

- **No machine registry exists today.** CRM tracks items in two human-readable markdown files:
  - `/app/memory/CR_STATUS_DASHBOARD.md` — the live flat status board (639 lines), one row per item, richest status/gate detail. **Authoritative for status.**
  - `/app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` — ordered CR register (sprint narrative + doc links).
- **Item count (distinct IDs, both files, deduped):** ~192 — **124 CR · 36 BUG · 23 INV · 9 GAP**. Exact figure to be reconciled at build time (drop prose-only references, fold sub-CRs e.g. CR-015a/b/c, confirm CLOSED/PARKED, adopt back-catalogue `Unrouted` for any un-adjudicated status per contract §4).
- **ID scheme:** legacy mixed (`CR-069`, `BUG-025`, `INV-017`, `GAP-11`) plus some already on the new scheme (`INV-2026-07-03-01`). New items from now use `TYPE-YYYY-MM-DD-NNN` (contract §7). Legacy IDs stay unchanged (unique within project — dashboard only requires per-project uniqueness).

## 3. Proposed registry (CRM's internal choice)

- **File:** `registry.json`
- **Location:** `/app/memory/crm/crm_roi_sprint/00_register/registry.json` (beside the human register; `.env` for the sync script's OAuth token will sit beside the script, not here).
- **Format:** JSON array of item objects. One object per tracked item. Fields map 1:1 to the 22 agent-owned contract columns (M Assignee and W Release week are **never** in the registry — owner/dashboard only).

**Fields per item (→ sheet column):**

| registry field | → col | notes |
|---|---|---|
| `project` | A | always `"CRM"` |
| `id` | B | unique; `TYPE-YYYY-MM-DD-NNN` for new, legacy kept |
| `type` | C | BUG/CR/INV/INCIDENT/GAP — derived from item, not prefix |
| `title` | D | one line |
| `status` | E | enum8: INTAKE/PLANNING/IMPLEMENTED/QA/SMOKE/CLOSED/PARKED/DUPLICATE (blank = Unrouted) |
| `status_note` | F | gate detail / verdicts / dates / prose |
| `priority` | G | P0–P3 (severity folds in; default P2 + `PRIORITY DEFAULTED`) |
| `risk` | H | LOW/MEDIUM/HIGH/CRITICAL or blank |
| `area` | I | blank (POS-only) |
| `sprint` | J | wave/sprint key or blank |
| `blocked_on` | K | free text; keep dashboard-written value |
| `owner_action` | L | one line; SMOKE items → `Smoke test <title>` |
| `registered` | N | YYYY-MM-DD |
| `last_updated` | O | YYYY-MM-DD (agent-computed only, never accepted from sheet) |
| `closed` | P | YYYY-MM-DD when CLOSED/PARKED/DUPLICATE else blank |
| `related` | Q | comma-separated IDs |
| `artefacts` | R | INTAKE/IMPACT_ANALYSIS/IMPLEMENTATION_PLAN/QA_HANDOVER/QA_REPORT |
| `code_markers` | S | YES/no |
| `files` | T | files touched |
| `notes` | U | anything else |
| `money_path` | V | YES/no (payments/billing/wallet/loyalty-points/coupons-with-value) |

Columns **M (Assignee)** and **W (Release week)** have **no registry field** — never read, written, or diffed.

## 4. Two-way / editability (already fixed by contract v1.5 — no open decision)

- Sheet → registry via **Change Log**, owner-approved: accepted columns = **Status, Registered, Closed**. All other agent-owned columns → logged `REJECTED` ("column not editable in Phase 1"). `Last updated` never accepted.
- **Dashboard** direct edits (tagged `SOURCE=DASHBOARD`, applied without approval): **Priority, Status (SMOKE→CLOSED only), Blocked on**.
- Assignee + Release week excluded from the diff entirely.

## 5. Carried-over rules (unchanged, to be honored by the script)

- **Hard code-file gate** — the sync script is guarded; refuses to run outside the gate.
- **Owner-triggered only** — never runs autonomously; only on explicit owner invocation.
- **push / drift / sync** operation model identical to the shared pattern.
- Sheet layout fixed: never rename/add/reorder tabs or columns; update `All Items` in place by ID, cols A–L & N–V; append new rows at bottom; never clear/delete/re-sort rows; never write M or W; stage tabs + Summary fully rewritten (derived); Change Log append-only.

## 6. Owner rulings (2026-10-14 — gate)

- **D1 RULED:** APPROVED — `registry.json` at `/app/memory/crm/crm_roi_sprint/00_register/registry.json`, the 22-column schema (§3). M Assignee + W Release week never included.
- **D2 RULED:** **The registry always wins** (it is the source of truth). We do NOT auto-accept sheet status over the registry. The **drift** operation surfaces any sheet↔registry divergence; the owner decides the next action **in chat** per drift. (Supersedes the earlier "dashboard wins for status" proposal. Matches contract §5.4 "registry wins unless owner overrides" + the Change-Log approval flow; `SOURCE=DASHBOARD` Priority/Status(SMOKE→CLOSED)/Blocked on remain the auto-apply exception.)
- **D3 RULED:** Auto-map every back-catalogue item to the 8-value enum from its existing gate text; flag only the unmappable as **Unrouted** (blank status) and report the count.
- **D4 RULED:** **Raw Google OAuth client** — owner supplies **client ID + client secret**; one-time browser flow mints a refresh token stored in a `.env` beside the sync script. ⚠ **Blocker for the first push:** cannot push until client ID/secret are provided. Integration playbook via `integration_expert` to be pulled at implementation time.

## 7. Gate — CLOSED (Intake)

Intake complete. **No code written. No push performed. No registry file created yet.** Decisions D1–D4 ruled above. Per owner "stick to gate", **not** proceeding to build. Next role (REGISTRAR / implementation) opens only on explicit owner instruction. First push additionally blocked on D4 credentials (Google OAuth client ID + secret).
