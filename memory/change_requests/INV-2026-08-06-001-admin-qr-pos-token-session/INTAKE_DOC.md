# INTAKE DOC — INV-2026-08-06-001 (reconstructed)

## Item Identity

| Field | Value |
|-------|-------|
| **ID** | INV-2026-08-06-001 |
| **Title** | Admin QR page — POS token expiry handling and direct order-type QR codes (reconstructed from live code markers) |
| **Classification** | **INV** — investigation whose fixes shipped |
| **Date Registered** | 2026-08-06 (taken from the ID itself; no document survives to confirm it) |
| **Reported By** | Audit finding **F2** of `CR-2026-10-04-004`: *"Ghost ID `INV-2026-08-06-001` — appears in a code marker, has no folder and no row anywhere. Origin unknown."* |
| **Intake by** | E1 (Role 1 — Intake, read-only). Owner instruction this session: create the folder and reconstruct from whatever references it |
| **Severity** | **P2** — registry-integrity gap; the code it refers to is live and working |
| **Risk** | **LOW** — this intake is documentation only. No code change is proposed |
| **Status** | 📝 REGISTERED (reconstructed) — its **fixes are already live**, never owner-verified |
| **Blast radius** | **SMALL** — admin QR page only (`/admin/qr-scanners`) |

## 1. Why this item exists

It was a **ghost**. Two comments in shipped production code cite an ID that had no folder, no
registry row, and no document anywhere in `/app/memory`. The registry recorded its origin as
*"unknown"*. Everything below is reconstructed from the code it left behind — it is **evidence, not
recovered history**.

## 2. The only surviving evidence

| Marker | Location | What it says shipped |
|---|---|---|
| **fix 2a** | `frontend/src/pages/admin/AdminQRPage.jsx:105` | `// INV-2026-08-06-001 fix 2a: auto-refresh pos_token on 401 rather than asking user to logout` |
| **fix 2b** | `frontend/src/pages/admin/AdminQRPage.jsx:355` | `{/* INV-2026-08-06-001 fix 2b: Direct Order-Type QR Codes (Delivery, Takeaway, Walk-in, Dine-in) */}` |

Both are live on the `3oct` branch today.

**fix 2a** — on a `401` from `/api/table-config`, the page POSTs `/api/pos/auth-token`, stores the
new token in `localStorage.pos_token` and retries the fetch once, instead of showing a session-expired
screen.

**fix 2b** — a second QR block on the same page rendering four direct order-type QR codes
(`?orderType=delivery|takeaway|walkin|dinein`) that start an order without a table scan.

## 3. What reconstruction can and cannot establish

**Established:** the investigation existed, concerned the admin QR page, and produced at least two
numbered fixes, both shipped.

**Not established, and not invented:**

| Unknown | Why it matters |
|---|---|
| The original symptom | The numbering **"2a" / "2b"** implies a **fix 1** that carries no marker. It may have shipped unmarked, or never shipped |
| Date | `2026-08-06` is read off the ID. No document corroborates it |
| Whether it was ever QA'd | No QA artefact exists. Both fixes are customer-affecting admin behaviour and are **unverified** |
| Why it was never registered | Unknown. It pre-dates `CR-2026-10-04-004`'s reconciliation, which found the marker but had nothing to register |

## 4. Two live connections worth recording

1. **`CR-2026-10-04-001`** (table-config POS-token fallback) is working the **same code**, and its
   intake already cites these exact lines: *"`AdminQRPage.jsx:110` sends `'X-POS-Token': posToken || ''`"*
   and *"`AdminQRPage.jsx:119` only auto-refreshes on 401"* — while the live failure is a **400**, so
   **fix 2a does not rescue it**. That is a known limitation of this investigation's fix, already
   captured there. No duplicate work.
2. **fix 2b overlaps `CR-2026-10-06-001`.** The direct order-type QR codes this investigation shipped
   include `?orderType=walkin`, and the walk-in exemption is exactly the bypass path
   `INV-2026-06-17-001` identified. This page is **generating** the QR codes that lead down the
   unenforced route. Recorded as a relationship; the fix belongs to `CR-2026-10-06-001`.

## 5. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `CR-2026-08-06-001` (time-controlled ordering) | Same date, **different subject** (channel shift windows). Shares no code with the QR page | **DISTINCT** — not a mis-typed ID |
| `CR-2026-10-04-001` (table-config token fallback) | Same file, same POS-token problem, open today | **RELATED** — see §4.1 |
| `CR-2026-10-06-001` (walk-in enforcement) | Consumes the QR codes fix 2b created | RELATED — see §4.2 |

**Verdict: DISTINCT.** The ID is real and belongs to its own work.

## 6. Recommendation

Register, do not re-open. Its code is live and has been for two months; there is no symptom to chase
and no fix to plan. What it leaves behind is **unverified admin behaviour** — if the owner wants fix
2a and 2b smoke-tested, that is a QA ask against `CR-2026-10-04-001`, which already owns this file.

**Its true contract status is `IMPLEMENTED`** (live, never owner-verified) under the convention the
owner set during adjudication: *"live but never verified, and don't pretend otherwise."* Written to
`index.yml` in the single status pass that ships with amendment change #10.

---

```text
Intake complete: INV-2026-08-06-001 (reconstructed)
Classification: INV (fixes shipped, history lost)
Severity: P2
Risk: LOW (documentation only; no code change proposed)
Duplicate check: DISTINCT (not CR-2026-08-06-001; RELATED to CR-2026-10-04-001 and CR-2026-10-06-001)
Evidence: captured — AdminQRPage.jsx:105 (fix 2a), :355 (fix 2b), CR-2026-10-04-004 finding F2, CR-2026-10-04-001/INTAKE_DOC.md:37/60
Blast radius: SMALL — admin QR page
Docs updated: this file; ../index.yml; ../README.md; ../INTAKE_PASS_2026-10-06.md
Next: none. Ghost ID closed out. Optional QA of fix 2a/2b rides on CR-2026-10-04-001
```
