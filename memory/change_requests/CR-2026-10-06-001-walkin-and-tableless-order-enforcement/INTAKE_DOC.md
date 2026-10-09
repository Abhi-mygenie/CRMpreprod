# INTAKE DOC — CR-2026-10-06-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-06-001 |
| **Title** | Enforce the non-QR order block: walk-in QR is an exempt scan type and the table-status check is skipped when `table_id === '0'` |
| **Classification** | **CR** — fix CR for a documented investigation that never got one |
| **Date Registered** | 2026-10-06 |
| **Reported By** | Owner, this session. Source finding: `INV-2026-06-17-001` (report written **2026-06-17**, no fix CR raised in the 3½ months since) |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Severity** | **P1** — orders are accepted that restaurant policy was configured to block |
| **Risk** | **HIGH** — every candidate fix touches `orderAccessPolicy.js` and `ReviewOrder.jsx`, the order-placement path |
| **Status** | 📝 REGISTERED (Role 1 done) — needs an owner ruling on option A/B/C/D, then Planning |
| **Parent** | `INV-2026-06-17-001-tableless-order-bypass` |
| **Blast radius** | **LARGE** — any restaurant running `allowNonQrOrders: false`; originally reported at 698 (Cafe Flora) |

## 1. The reported symptom

Restaurant 698 received a **dine-in order with no table assigned**, while its config said that
should be impossible:

| Flag | Value | Intent |
|---|---|---|
| `allowNonQrOrders` | `false` | block orders that did not come from a QR scan |
| `skipOtpWalkIn` | `true` | — |
| `otpRequiredWalkIn` | `false` | — |

The investigation confirmed the policy **was active and correctly configured**. The order still got
through.

## 2. Root cause — three bypass paths (verbatim from the investigation)

**BP-1 — walk-in QR is an exempt scan type (most likely path).**
`orderAccessPolicy.js` treats `walkin` as a valid scan, so the non-QR block returns
`{block: false, reason: 'valid-qr'}`. The order then proceeds with `table_id: '0'`, and the
table-status check is skipped because the ID is `'0'`.

**BP-2 — direct URL manipulation.** Typing `/{restaurantId}?type=walkin` produces the same
sessionStorage state as a real scan. `useScannedTable.js` trusts URL params with no origin check.

**BP-3 — no server-side enforcement.** `allowNonQrOrders` is **client-side JavaScript only**. The POS
`/customer/order/place` endpoint accepts any order with `table_id: '0'` regardless of config, so dev
tools or a direct API call bypass every frontend guard.

## 3. Code check — is it still live? **Yes, all three.** (verified this session)

| Path | Evidence found today |
|---|---|
| BP-1 | `frontend/src/utils/orderAccessPolicy.js:20` — `const VALID_QR_SCAN_TYPES = new Set(['table', 'room', 'walkin']);` and the membership test at `:63` |
| BP-1 | `frontend/src/pages/ReviewOrder.jsx:1168` and `:1281` — `if (finalTableId && String(finalTableId) !== '0')` guards the status check, so `'0'` skips it |
| BP-2 | `frontend/src/hooks/useScannedTable.js` — URL params still consumed without origin verification |
| BP-3 | no server-side `allowNonQrOrders` check exists in `backend/server.py`; order placement does not pass through the backend |

Nothing has been fixed since the report was written. The investigation's own diagnostic note still
holds: a walk-in bypass **produces no block event**, so this failure is invisible in the logs —
which is why 5 logged blocks at 698 all show `scanned_room_or_table: None` (those were true non-QR
attempts, correctly blocked).

## 4. What the owner must rule on (carried from the investigation, unchanged)

| Option | Change | Cost / risk |
|---|---|---|
| **A** | Drop `walkin` from `VALID_QR_SCAN_TYPES` | Breaks walk-in ordering for **every** restaurant using walk-in QR. Needs a per-restaurant flag to be safe |
| **B** | Add server-side enforcement — backend validates `allowNonQrOrders` + `table_id` before forwarding to POS | Closes BP-1, BP-2 **and** BP-3. Requires an order-placement proxy, which does not exist today |
| **C** | New `allowWalkinOrders` config flag (default `true`), blocking walk-in only when both flags are false | Most flexible; still client-side, so BP-3 survives |
| **D** | Revoke 698's walk-in QR codes | Operational, zero code. Does not address BP-2 or BP-3 |

**Intake observation, not a decision:** only **B** closes BP-3, and BP-3 is the one an attacker with
dev tools can use. A, C and D all leave the server trusting the client. B overlaps materially with
`CR-2026-07-03-011` (full POS-proxy refactor, already registered, P1) — if B is chosen, these two
should be planned together rather than twice.

## 5. Verification required before closure (none of it done)

| # | Check |
|---|---|
| V1 | With `allowNonQrOrders: false`, a walk-in QR scan is blocked (or allowed, per the chosen option) and the decision is logged |
| V2 | A direct `?type=walkin` URL with no scan is treated the same as a scan — or deliberately differently, recorded |
| V3 | Order placement with `table_id: '0'` is rejected server-side when policy forbids it (option B only) |
| V4 | Legitimate walk-in ordering still works at restaurants that permit it — no regression |
| V5 | Dine-in and room flows unchanged |
| V6 | A block event is now emitted for the walk-in path, so the hole is visible in logs if it reopens |
| V7 | Owner smoke at 698 |

## 6. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `INV-2026-06-17-001` | Parent investigation. Owns *"why did this happen"*; this CR owns *"fix it"* | **DISTINCT** |
| `CR-2026-07-03-011` (full POS-proxy refactor) | Option B is a subset of its scope | **RELATED — plan together if B is chosen** |
| `CR-2026-10-06-002` (multi-menu landing skip) | Same family: a table-status check that does not run. Different trigger, different code path | RELATED |
| `CR-2026-09-15-002` (skip-OTP dead branch) | Touches the same policy area, different concern | RELATED |

**Verdict: DISTINCT.** No CR has ever carried this fix.

## 7. Note on severity

P1, not P0. It is a policy-enforcement hole on the ordering path, documented since June, and no
production incident has been attributed to it — but it accepts orders the restaurant configured as
forbidden, and BP-3 means the server has no opinion at all. If an incident is traced to it, this
becomes P0.

---

```text
Intake complete: CR-2026-10-06-001
Classification: CR (fix CR for INV-2026-06-17-001)
Severity: P1
Risk: HIGH (orderAccessPolicy.js + ReviewOrder.jsx, order-placement path)
Duplicate check: DISTINCT (parent INV-2026-06-17-001; RELATED CR-2026-07-03-011, CR-2026-10-06-002)
Evidence: captured — orderAccessPolicy.js:20/63, ReviewOrder.jsx:1168/1281, useScannedTable.js, INV-2026-06-17-001/INVESTIGATION_REPORT.md
Blast radius: LARGE — every restaurant with allowNonQrOrders: false
Docs updated: this file; ../index.yml; ../README.md; ../INTAKE_PASS_2026-10-06.md
Next: owner rules on option A/B/C/D → Planning (Role 2)
```
