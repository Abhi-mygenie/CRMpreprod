# INV-2026-07-03-001 — Order-Create Idempotency Audit

**Status:** ✅ RESOLVED-BY-OWNER-ASSERTION (2026-07-04)
**Raised:** 2026-07-03 (as CR-2026-07-03-006, renamed to INV-2026-07-03-001 by CR-2026-07-03-010)
**Author:** E1 (blocker discovered during CR-004 planning)
**Priority:** P1 (BLOCKER for CR-2026-07-03-004 — CLEARED 2026-07-04)
**Severity:** HIGH (worst-case: double-charge / double-order for a customer)
**Risk of the audit itself:** ZERO (read-only investigation)
**Risk of any downstream fix:** MEDIUM–HIGH (order flow)
**Blocks:** CR-2026-07-03-004 (frontend fetch timeouts on order-create path) — CLEARED
**Related CR reincarnation note:** File header still references old CR-006 ID for historical continuity; canonical ID is INV-2026-07-03-001.

---

## 0. Resolution — Owner assertion (2026-07-04)

**Owner statement (verbatim):** "d02 order wont get created backend take care of that"

**Interpretation applied by E1:** MyGenie POS enforces server-side idempotency on order-create — i.e., repeated `POST /web/place-order` (or equivalent) with the same cart payload does NOT create a second order.

**Effect on this audit:**
- Formal audit (§2 below — grep + POS contract read + Mongo query) is **NOT executed**.
- CR-2026-07-03-004 order-create timeout scope is **UNBLOCKED**.
- All three write paths in CR-004 (auth, config, order-create) proceed with `apiWriteClient` (15 s) + React Query retry (2× exponential backoff).

**Safety net in place regardless:**
- CR-004 wires a **blocking `AlertDialog`** on order-create timeout (per design-agent D-05). Customer must explicitly acknowledge before any retry. Not a silent auto-retry.
- CR-004 §V-04b defines a live test to confirm idempotency: submit an order with network throttled to offline, hit Retry after network returns, confirm exactly ONE order lands in POS.

**Contingency if D-02 assertion is ever proven wrong:**
- V-04b live test will surface the bug immediately (two orders instead of one).
- On failure: halt release, escalate to owner, this file gets amended with the counter-evidence and status flips to `⚠️ REOPENED`.
- Follow-up code work would then be: either add client-side idempotency key generation (per attempt), or escalate to MyGenie POS team to enforce server-side dedup.

**Owner-record-of-record:** this section §0 is the audit trail for the safety guarantee. Any post-mortem starts here.

---

## 1. Why this CR exists

CR-2026-07-03-004 proposes wrapping every frontend `fetch()`/`axios` call in a client-side timeout (default 15 s for writes). If applied naively to order-create, a customer whose network is momentarily slow can see:

1. Client sends `POST /web/place-order` to MyGenie POS.
2. Server receives it, starts processing.
3. Client-side timeout fires at 15 s (network round-trip is 16 s).
4. Client shows "Failed, retry?" and user clicks retry.
5. Second `POST /web/place-order` fires.
6. Server processes the **second** order because the first one was actually accepted.
7. Customer is charged twice / kitchen sees two tickets.

**We MUST NOT wrap order-create in a timeout+retry pattern until we know the server-side dedup story.**

## 2. Audit tasks (read-only)

### 2.1 Frontend audit
1. Locate the exact order-create call site(s).
   - `grep -rn "place-order\|placeOrder\|createOrder\|order/create\|/web/place-order" /app/frontend/src`
   - Identify the file, function, and payload shape.
2. Determine what unique-per-attempt identifier (if any) the frontend includes in the payload:
   - `order_reference_id` / `client_reference_id` / idempotency-key header / UUID / cart hash?
   - Is that ID **regenerated on retry** (bad — no dedup) or **stable across retries** (good — dedup possible)?
3. Look at how "retry" UX is implemented today. Does the user get an explicit retry button, or does React Query auto-retry (which would already have caused duplicates if any timeout ever fires)?

### 2.2 Backend / POS audit
The order-create endpoint is on MyGenie POS (`POST /web/place-order` at `preprod.mygenie.online/api/v1`), NOT on our FastAPI. We do not own that code. We need to obtain from MyGenie:
1. Documentation of any idempotency contract:
   - Idempotency-Key header support?
   - Duplicate-order dedup window on same `(restaurant_id, customer_id, cart_hash)`?
   - Any request-uniqueness enforcement?
2. If none exists: request MyGenie to add one, or accept that order-create must not be retried on our side.

### 2.3 Data audit (evidence of past double-orders)
1. Query prod Mongo (`mygenie_db.orders`):
   - `db.orders.aggregate([{$group:{_id:{customer_id:'$customer_id', total:'$total', hour:{$dateToString:{format:'%Y-%m-%dT%H', date:'$created_at'}}}, cnt:{$sum:1}}}, {$match:{cnt:{$gt:1}}}])`
   - Any row where the same customer + same total + same hour appears more than once is a candidate duplicate.
2. If found, confirm with the operator whether those were legitimate re-orders or actual duplicates.

## 3. Possible outcomes and their implications for CR-004

| Outcome of audit | What CR-004 must do for order-create |
|---|---|
| **A. Server enforces strict idempotency via header / cart_hash** | ✅ safe to apply 15 s timeout + 1 retry with backoff on order-create |
| **B. Server dedups only within a short window (< 60 s)** | ✅ safe with timeout, but retries must be spaced OUTSIDE that window OR use idempotency key |
| **C. No server-side dedup, but client sends a stable `order_reference_id` that server checks** | ✅ safe |
| **D. No server-side dedup and client regenerates ID on retry** | ❌ **Order-create MUST be excluded from CR-004** timeout logic OR the client change must be done together with a client-side stable ID + server side check request to MyGenie |
| **E. Unknown / can't get answer from MyGenie** | Treat as D — safest default |

## 4. Files this audit will INSPECT (read only)

- `frontend/src/api/services/orderService.ts` (and `.js` variants)
- `frontend/src/pages/ReviewOrder.jsx` (per operating prompt §12: 716 hardcode lives here — do not touch)
- `frontend/src/api/config/endpoints.js`
- `frontend/src/types/api/order.types.ts`
- MyGenie POS docs (external — need owner to obtain or share)

## 5. Files this audit will NOT touch
- Anything. This is a read-only audit. No code will be modified in this CR.

## 6. Deliverables

- **`FINDINGS.md`** in this CR folder — includes:
  - The exact code paths that create orders.
  - Whether they include an idempotency identifier.
  - Whether frontend retry today is explicit or automatic.
  - Evidence (or absence) of past duplicates in prod orders collection.
  - Verdict: outcome A / B / C / D / E from §3.
- **Recommendation memo** for CR-004:
  - Which of D/E → exclude order-create from CR-004
  - Which of A/B/C → include order-create with the specified guardrails

## 7. Owner decisions

1. Approve running this audit? (Recommended: yes.)
2. Approve contacting MyGenie for the idempotency contract? Owner may need to broker the conversation.
3. If outcome is D/E, is owner willing to sponsor a joint effort with MyGenie to add server-side dedup?

## 8. Effort
- Frontend + data audit: 2-3 hours.
- MyGenie coordination: dependent on their responsiveness.
- Write-up: 30 min.

## 9. Non-goals
- No code change in this CR.
- No frontend timeouts applied — that is CR-004's job.
- No POS-side code change — that is not our repo.
- No design work.
