# CR-2026-10-14-002 — QA Handover (R1 + R3 + R6)

**Role:** Implementation → QA handover · **Date:** 2026-10-16 · **Risk:** LOW
**Plan:** `planning/CR_2026_10_14_002_IMPLEMENTATION_PLAN.md`
**Test method:** manual curl against preview (owner opted out of testing_agent). Tenant r689 (`pos_0001_restaurant_689`), key via DB.

## Implemented (code markers `# CR-2026-10-14-002`)
- **E1/E3 (R1):** `POST /api/pos/orders` response `data.einvoice {available, token, invoice_number, html_url, pdf_url}`.
- **E2 (R6):** structured ERROR log on invoice-gen throw/empty-token with `user_id`+`restaurant_id`+`pos_order_id`+`restaurant_order_id`+err.
- **E4 (R3):** `GET /api/pos/orders/{pos_order_id}/invoice` (tenant-scoped; `pos_order_id`→`restaurant_order_id` fallback; 404 when none).
- **E5 (D3):** index `idx_inv_user_posorder (user_id, pos_order_id)` on `invoices` (created ✅).
- **Bonus fix (in-scope pos.py):** `_invoice_public_base()`/`_invoice_urls()` strip a trailing `/api` from the env base → **fixes a pre-existing double-`/api`** bug that also affected the CR-014 WhatsApp `einvoice_link`. Files touched: `routers/pos.py`, `server.py` only.

## Verification results
| V | Check | Result |
|---|---|---|
| V1 | order response has `einvoice` (valid customer) | ✅ token+number+html+pdf, `available=true` |
| V2 | links resolve | HTML **200 ✅** · PDF **500 ❌** (see Findings) |
| V3 | guest order (invalid phone) | ✅ `einvoice.available=true`, `guest_order=true` |
| V4 | idempotency | ✅ R3 returns same token; re-POST hits "Duplicate order" guard (expected) |
| V5 | R3 known order | ✅ 200, same token, single-`/api` URL |
| V6 | R3 unknown order | ✅ 404 "Invoice not found for this order" |
| V7 | R3 tenant isolation (other tenant key) | ✅ 404 |
| V8 | invoice-gen failure path | ✅ PDF gen fails internally (weasyprint) but `create_invoice` still returns token → HTML link still served; order still 200 |
| V9/V10 | R6 failure logging | code-verified; real `BUG-023` PDF warnings observed with restaurant context pending real throw |
| D4 | `/api`-safe URL (both env forms) | ✅ unit + live, no `/api/api` |

## Findings — PDF download blocked (PRE-EXISTING, outside CR scope files)
- **B1 — weasyprint not installed in this pod.** `services/invoice_generator.generate_invoice_pdf` → `ModuleNotFoundError: weasyprint`. PDF never generated at create time → `pdf_path=None`, no PDF in S3. Likely a preview-pod env gap (CR-014 was live-tested with PDFs in prod). → dependency/deploy decision.
- **B2 — `routers/invoices.py:95` crash.** On-the-fly fallback does `Path(invoice.get("pdf_path", ""))`; `.get` returns `None` (key present), `Path(None)` → `TypeError` → **500**, before the generate branch. 1-line fix: `Path(invoice.get("pdf_path") or "")`. Independent of B1 (even with weasyprint, a None pdf_path 500s instead of regenerating).
- **Impact:** the HTML invoice (and the links we hand POS) work; the **PDF link 500s** whenever the PDF wasn't pre-generated. Both blockers are in `routers/invoices.py` / environment — files this CR declared WILL-NOT-touch. **Awaiting owner decision (fold-in vs separate BUG).**

## Test data created on r689 (cleanup candidates)
Orders `CR002_R1_1792142011`, `CR002_GUEST_1792142011g` (+ their invoices). Safe to leave or purge.

## Status
R1 + R3 + R6 code-complete and verified (HTML path). PDF download blocked by B1+B2 (pre-existing). Not closed.
