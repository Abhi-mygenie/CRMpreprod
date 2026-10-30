# CR-2026-10-14-002 — Implementation Plan (R1 + R3 + R6)

**Role:** Planning Agent · **Stage:** Implementation Plan · **Date:** 2026-10-14
**Risk:** LOW · **Code reality:** PARTIAL · **Approved scope:** R1 + R3 + R6 · D1–D4 ruled
**IA:** `planning/CR_2026_10_14_002_IMPACT_ANALYSIS.md` · **Intake:** `discovery/CR_2026_10_14_002_POS_EINVOICE_DOWNLOAD_INTAKE.md`
**Code marker for all edits:** `# CR-2026-10-14-002`

---

## Pre-flight
- Item registered ✅. Plan still matches code: `pos.py` order route `@router.post("/orders")` L1340; invoice gen block L1587-1599; response `return POSResponse(... data={...})` L1753-1781; sibling GET pattern `pos_get_documents` L2304-2342; imports have `os`, `logging`, `verify_pos_auth`, `db`. Index startup block in `server.py` L28-54.
- Base URL rule (D4): `os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("CRM_EXTERNAL_URL")` — already used at L1594. No hardcoding.

## Edit-by-edit

### E1 — R1: capture `pdf_url`, build `einvoice` block (pos.py, invoice-gen block ~L1587-1599)
Currently:
```py
einvoice_link = ""
einvoice_token = ""
try:
    from services.invoice_generator import create_invoice
    saved_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if saved_order:
        base_url = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("CRM_EXTERNAL_URL")
        inv = await create_invoice(db, saved_order, user, updated_customer, order_ctx, base_url)
        einvoice_link = inv.get("invoice_url", "")
        einvoice_token = inv.get("token", "")
except Exception as _inv_err:
    ...
```
Change to also capture pdf + build the nested block + number:
```py
# CR-2026-10-14-002 (R1): also capture pdf_url + invoice_number for the POS response
einvoice_link = ""
einvoice_pdf = ""
einvoice_token = ""
einvoice_number = ""
try:
    ...
        inv = await create_invoice(...)
        einvoice_link = inv.get("invoice_url", "")
        einvoice_pdf = inv.get("pdf_url", "")
        einvoice_token = inv.get("token", "")
        einvoice_number = inv.get("invoice_number", "")
        if not einvoice_token:   # R6 silent-failure guard (see E2)
            raise RuntimeError("invoice returned empty token")
except Exception as _inv_err:
    ... (E2 logging)
```
Keep the existing WhatsApp `einvoice_link`/`einvoice_token` injection (L1608-1609) unchanged.

### E2 — R6: structured failure log with restaurant identity (same block, `except`)
Replace the thin warning (L1598-1599) with:
```py
except Exception as _inv_err:
    # CR-2026-10-14-002 (R6): log invoice-gen failure WITH restaurant identity
    logging.getLogger(__name__).error(
        "CR-014 invoice generation FAILED user_id=%s restaurant_id=%s pos_order_id=%s restaurant_order_id=%s order_id=%s err=%s",
        user.get("id"), user.get("restaurant_id"),
        order_data.order_id, getattr(order_data, "restaurant_order_id", None),
        order_id, _inv_err,
    )
    einvoice_link = einvoice_pdf = einvoice_token = einvoice_number = ""
```
Covers both throw and the empty-token raise from E1. Order still succeeds (block already outside the fatal path).

### E3 — R1: add `einvoice` to the order response (pos.py `return POSResponse` L1753-1781)
Add one key to `data={...}` (before `loyalty_redeem` line):
```py
# CR-2026-10-14-002 (R1): surface e-invoice links to POS (D1 nested object)
"einvoice": {
    "available": bool(einvoice_token),
    "token": einvoice_token or None,
    "invoice_number": einvoice_number or None,
    "html_url": einvoice_link or None,
    "pdf_url": einvoice_pdf or None,
},
```

### E4 — R3: new re-fetch endpoint (pos.py, after `pos_get_documents` ~L2342)
```py
@router.get("/orders/{pos_order_id}/invoice", response_model=POSResponse)
async def pos_get_order_invoice(pos_order_id: str, user: dict = Depends(verify_pos_auth)):
    """CR-2026-10-14-002 (R3): POS re-fetch the e-invoice for one of its orders."""
    inv = await db.invoices.find_one(
        {"user_id": user["id"], "pos_order_id": pos_order_id}, {"_id": 0}
    )
    if not inv:   # D2 fallback on restaurant_order_id
        inv = await db.invoices.find_one(
            {"user_id": user["id"], "restaurant_order_id": pos_order_id}, {"_id": 0}
        )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found for this order")
    base_url = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("CRM_EXTERNAL_URL") or ""
    token = inv["token"]
    return POSResponse(
        success=True, message="Invoice found",
        data={
            "pos_order_id": pos_order_id,
            "available": True,
            "token": token,
            "invoice_number": inv.get("invoice_number"),
            "html_url": f"{base_url}/api/invoices/{token}",
            "pdf_url": f"{base_url}/api/invoices/{token}/pdf",
            "generated_at": inv.get("generated_at"),
        },
    )
```
Route placement note: define it **near the other `/orders` GET routes and before any broad catch-all**; `/orders/{pos_order_id}/invoice` is specific so no collision with `POST /orders`.

### E5 — D3: index (server.py startup, near L31-33 orders indexes)
```py
# CR-2026-10-14-002 (D3): fast POS invoice lookup
await db.invoices.create_index([("user_id", 1), ("pos_order_id", 1)], name="idx_inv_user_posorder")
```

## Files
**WILL change:** `routers/pos.py` (E1, E2, E3, E4) · `server.py` (E5).
**WILL NOT touch:** `services/invoice_generator.py`, `routers/invoices.py`, `models/schemas.py` (POSResponse.data is `Optional[dict]` — no schema change), `core/loyalty.py`, `core/coupon.py`, `core/whatsapp*.py`, webhook/event contract, frontend.

## Verification matrix (maps to IA V1–V10)
| V | Edit | Test | Expect |
|---|---|---|---|
| V1 | E1,E3 | `POST /api/pos/orders` valid customer | `data.einvoice.available=true`, html_url+pdf_url+token+invoice_number set |
| V2 | — | GET both urls | HTML 200; PDF 200 or 302→S3 |
| V3 | E1 | guest order (invalid phone) | `einvoice.available=true`; WhatsApp still skipped |
| V4 | — | re-post same order | same token (idempotent); no dup invoice row |
| V5 | E4 | `GET /orders/{pos_order_id}/invoice` known | 200, same token/urls |
| V6 | E4 | GET unknown order | 404 |
| V7 | E4 | GET tenant B key for tenant A order | 404 (isolation) |
| V8 | E1,E2 | force gen failure | `available=false`, nulls; order still 200 |
| V9 | E2 | gen throws | ERROR log has user_id+restaurant_id+pos_order_id+restaurant_order_id+err |
| V10 | E1,E2 | gen returns empty token | R6 ERROR log fires; `available=false` |

## Regression checks (must stay green)
- R-a: existing `POST /api/pos/orders` fields unchanged (points, tier, wallet, coupon_usage, loyalty_redeem) — nothing renamed/removed.
- R-b: `send_bill` WhatsApp still receives `einvoice_link`/`einvoice_token` (L1608-1609 untouched).
- R-c: order still succeeds if invoice gen fails (no new raise escapes the try/except).
- R-d: backend boots; new index creates idempotently; `GET /orders/{id}/invoice` does not shadow `POST /orders`.
- R-e: self-test via curl against preview with a POS X-API-Key (owner acct) — one new order + one re-fetch + one 404.

## Test method (per owner opt-out of testing_agent)
Manual: `curl` the 3 R3 cases + 1 order POST against preview `REACT_APP_BACKEND_URL`, verify `einvoice` block + link fetch. Optionally a focused `pytest` in `backend/tests/`.

## Gate
Implementation Plan complete. **No code written.** Next: owner opens implementation gate ("choose implementation role for CR-2026-10-14-002").
