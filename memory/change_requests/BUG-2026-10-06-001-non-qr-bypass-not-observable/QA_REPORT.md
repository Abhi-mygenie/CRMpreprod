# QA REPORT — BUG-2026-10-06-001

**Role 4 (QA) · 2026-10-07 · executed by testing agent on Role 3 handover** · raw report: `/app/test_reports/iteration_1.json`

## Result: **PASS** — 11/11 QA cases, 0 failures

| QA case | Result | Evidence |
|---|---|---|
| Q1 walk-in full flow (flag off) | PASS | 3 POSTs landing / add_to_cart / place_order, all `valid-qr / allowed:true`; flow reached `/478/review-order`; no real order created |
| Q2 716 carve-out | PASS | no modal; `rid-716-carveout / allowed:true` |
| Q3 takeaway | PASS | `non-dinein-mode / allowed:true` |
| Q4 direct URL block (C1) | PASS | Session Expired modal; `non-qr-dinein / allowed:false` |
| Q5 deep-link menu, first add (C2 block) | PASS | modal; `checkpoint: add_to_cart, allowed:false` |
| Q6 flag on → zero events | PASS | 0 POSTs across landing + browse |
| Q7 logged-in `is_authenticated:true` on C2 | **NOT EXECUTED by QA** (no login path driven) — code-verified at `MenuItems.jsx:39,492`; covered by owner smoke step 1 if done logged in | NOTE |
| Q8 hotspot regression (flag on): landing, dine-in table QR, takeaway | PASS | renders, no diagnostics POST, no JS errors |
| Q9 legacy body → 204 | PASS | curl + pytest |
| Q10 41-char decision → 422 | PASS | curl + pytest |
| Q11 pytest smoke 4/4 · contract 14/14, 12 snapshots unchanged | PASS | |

**Invariant check (QA statement):** "No order outcome changed. Allow paths still navigate; block paths still show Session Expired and don't navigate."

**Findings:** BLOCKER 0 · MAJOR 0 · MINOR 0 · NOTE 1 (Q7 not driven E2E; rolling-cap non-atomicity pre-existing — see SELF_TEST.md).

**Registry:** SYNCED (`status: QA → SMOKE`, artefacts += QA_REPORT, `code_markers: true`).

```text
QA complete: BUG-2026-10-06-001
Result: PASS
Tests: 11 total, 11 pass, 0 fail (+ Q7 code-verified only)
Failures: none
Coverage: 6/6 files
Registry: SYNCED
Report: this file · /app/test_reports/iteration_1.json
Next: Owner smoke (Role 8) — 3 steps in QA_HANDOVER.md → then CLOSED; CR-2026-10-03-003 waits at Gate 2
```
