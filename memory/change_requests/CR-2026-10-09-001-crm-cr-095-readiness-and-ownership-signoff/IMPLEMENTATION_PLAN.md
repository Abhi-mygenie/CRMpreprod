# IMPLEMENTATION PLAN — CR-2026-10-09-001
## Customer App side of CRM CR-095

**Written by:** Role 2 — Planning Agent · **Date:** 2026-10-09 · **Gate:** Impact Analysis written; D1 ruled (i)
**Risk:** LOW · **Code change:** none · **All edits are memory/documentation + one verification run**

---

## Pre-flight (Role 3, before any edit)

```bash
cd /app
grep -rn "scan/config\|scan/menu/dietary" frontend/src backend/ --include=*.js --include=*.jsx --include=*.py
# Expected: 0 results. Any hit → STOP, escalate (a caller appeared since intake).
```

---

## Phase 1 — Release the gate (do now)

### E1 — Confirmation note to CRM
**Create:** `CR-2026-10-09-001-…/CONFIRMATION_NOTE_TO_CRM.md`
Content: zero-caller evidence (grep + the two `/api/*` routes we actually use), UAT doc shapes, owner ruling D1=(i) in one line: *"CR-095 is released from the 4-step gate — ship at will; steps 2–3 continue on their own CRs."* Answers **CA-2** and **CA-8** together. Also carries the CA-4 / CA-5 answers already prepared in `inbox/CRM_REPLY_VALIDATIONS_ACCEPTED_CR102_2026-10-09.md` so CRM gets one message.

### E2 — Registry
`index.yml` CR-2026-10-09-001: `status: IMPLEMENTATION`, `status_note` "Phase 1 sent <date>; awaiting CRM ship confirmation", `blocked_on` → CRM CR-095 ship, `artefacts` += CONFIRMATION_NOTE.
Owner sends the note (E1 is a draft until owner pastes it).

---

## Phase 2 — Verify after CRM confirms CR-095 shipped (blocked until then)

### E3 — Route probe (expect 404 ×4)
```bash
CRM=$(grep REACT_APP_CRM_URL frontend/.env | cut -d= -f2)
for p in scan/config/478 scan/menu/dietary-tags/478; do
  curl -s -o /dev/null -w "GET  $p → %{http_code}\n" "$CRM/$p"
  curl -s -o /dev/null -w "PUT  $p → %{http_code}\n" -X PUT -H 'Content-Type: application/json' -d '{}' "$CRM/$p"
done
```
Expected: four `404`s. (A `405` or `401` means the route still exists → return to CRM.)

### E4 — Our contract tests unchanged
```bash
cd /app && pytest -m contract -n 0 backend/tests/contracts/test_public_config.py backend/tests/contracts/test_dietary.py
```
Expected: PASS, **no** snapshot update needed.

### E5 — Data unchanged (read-only)
Count `customer_app_config` and `dietary_tags_mapping` on UAT; compare with the pre-removal count recorded in E1 (13 / 0 as of 2026-10-09). Expected: equal, or differs only by our own admin writes in between (check `updated_at`).

### E6 — Verification report
**Create:** `VERIFICATION_REPORT.md` with E3–E5 outputs, timestamps, PASS/FAIL.

---

## Phase 3 — Countersign §4d (after Phase 2 PASS) — **D3 RULED 2026-10-09: owner signs personally**

### E7 — `OWNERSHIP_MAP.md` (INV-2026-09-15-002 folder)
- Row `customer_app_config` (line 36): status `⚠️ CONTESTED → OURS by OD-7` → `✅ OURS EXCLUSIVE — CRM routes removed (CR-095, <date>)`; note column: drop "CRM must lock/remove…".
- Row `dietary_tags_mapping` (line 38): `⚠️ CONTESTED → PENDING Q4` → `✅ OURS EXCLUSIVE — CRM routes removed (CR-095, <date>)`.
- Section "Sign-off": **add one line above the table**, not a signature in it:
  `§4d (CR-095 — 4 orphan routes removed): Customer App ✅ <owner initials, date> · CRM ✅ 2026-10-03 (CONTRACT_v1.0_CRM_SIGNOFF §4d)`
  E1 prepares the row edits and the line with `<owner initials, date>` left blank; **owner fills it in** (D3). E1 does not mark the row on the owner's behalf.
- **Do not** change the `Status: DRAFT — NOT signed` header. The map freeze still waits on POS + owner F3.

### E8 — Registry close
`index.yml`: `status: CLOSED`, `closed: <date>`, `artefacts` += VERIFICATION_REPORT. `PRD.md` one line.

---

## Edit summary

| ID | Phase | Where | What | Blocked on |
|---|---|---|---|---|
| E1 | 1 | CR folder | CONFIRMATION_NOTE_TO_CRM.md (CA-2/4/5/8 in one) | — |
| E2 | 1 | index.yml | INTAKE → IMPLEMENTATION | — |
| E3 | 2 | shell | 4× 404 probe | CRM ships CR-095 |
| E4 | 2 | pytest | contract snapshots green | CRM ships CR-095 |
| E5 | 2 | Mongo (read-only) | doc counts unchanged | CRM ships CR-095 |
| E6 | 2 | CR folder | VERIFICATION_REPORT.md | E3–E5 |
| E7 | 3 | OWNERSHIP_MAP.md | §4d rows + line; header untouched | E6 PASS + D3 |
| E8 | 3 | index.yml / PRD.md | CLOSED | E7 |

**Files WILL change:** memory only — this CR folder, `index.yml`, `PRD.md`, `INV-2026-09-15-002/OWNERSHIP_MAP.md`.
**Files WILL NOT touch:** anything under `frontend/` or `backend/`.

## Verification matrix

| Acceptance (intake §5) | Covered by |
|---|---|
| 1 written confirmation + D1 ruling | E1 |
| 2 four routes → 404 | E3 |
| 3 contract tests PASS, snapshots unchanged | E4 |
| 4 doc counts unchanged | E5 |
| 5 §4d marked, map still DRAFT | E7 |

No SMOKE_BRIEF: nothing diner- or admin-visible changes; QA = E3–E5 evidence in VERIFICATION_REPORT. (Owner may override and ask for one.)

```text
Planning complete: CR-2026-10-09-001
Stage: Implementation Plan
Code reality: NONE
Risk: LOW
Files WILL change: memory only (CR folder · index.yml · PRD.md · OWNERSHIP_MAP.md §4d)
Files WILL NOT touch: frontend/* · backend/*
Owner decisions: D1 ruled (i) · D2 default (a) · D3 ruled — owner signs
Docs: memory/change_requests/CR-2026-10-09-001-crm-cr-095-readiness-and-ownership-signoff/IMPLEMENTATION_PLAN.md
Next: "Gate 3 accepted for CR-2026-10-09-001" → Role 3 runs Phase 1 (E1–E2) and drafts the CRM message
```
