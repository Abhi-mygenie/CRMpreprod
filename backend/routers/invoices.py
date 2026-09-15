"""
CR-014 Phase 2 Bucket 3: Invoice public routes.
- GET /api/invoices/{token}       → serves invoice HTML page
- GET /api/invoices/{token}/pdf   → serves invoice PDF download
No authentication required — the token IS the secret.

CR-036 Part 4 (2026-07-04): dual-mode read.
- HTML: MUST stay behind the backend because we inject the PDF URL at serve
  time (invoice_food.html template has empty href="" that we rewrite). So we
  read HTML source from S3 first, then local disk, then 404. NO 302 redirect.
- PDF: static bytes, no injection → 302-redirect to public S3 URL when present,
  fall back to local FileResponse, else generate-on-the-fly.
"""
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse
from pathlib import Path

from core.database import db
from core import s3 as _s3

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["Invoices"])

DATA_DIR = Path("/app/data/invoices")


def _read_invoice_html(token: str) -> str | None:
    """CR-036 Part 4: read invoice HTML with dual-mode fallback.

    Order: S3 → local disk. Returns None if neither has it.
    """
    # 1. S3 first (new invoices post-CR-036)
    if _s3.S3_CONFIGURED:
        key = f"invoices/{token}/invoice.html"
        if _s3.object_exists(key):
            body = _s3.get_object_bytes(key)
            if body:
                return body.decode("utf-8")
    # 2. Local disk fallback (legacy invoices)
    html_path = DATA_DIR / token / "invoice.html"
    if html_path.exists():
        return html_path.read_text(encoding="utf-8")
    return None


@router.get("/{token}", response_class=HTMLResponse)
async def get_invoice_html(token: str):
    """Serve invoice HTML page. Public — no auth required.

    CR-036 Part 4: reads from S3 first, falls back to local disk.
    Does NOT 302-redirect because HTML needs runtime PDF-URL injection.
    """
    # Validate token exists in DB
    invoice = await db.invoices.find_one({"token": token}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    html = _read_invoice_html(token)
    if html is None:
        raise HTTPException(status_code=404, detail="Invoice file not found")

    # Inject correct PDF URL into the HTML before serving
    pdf_url = f"/api/invoices/{token}/pdf"
    html = html.replace('href=""', f'href="{pdf_url}"', 1)

    return HTMLResponse(content=html)


@router.get("/{token}/pdf")
async def get_invoice_pdf(token: str):
    """Serve invoice PDF download. Public — no auth required.

    CR-036 Part 4: 302-redirects to public S3 URL when present, falls back to
    local FileResponse, else generates PDF on-the-fly (which also writes to S3).
    """
    invoice = await db.invoices.find_one({"token": token}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice_number = invoice.get("invoice_number", token[:8])
    filename = f"Invoice_{invoice_number.replace('/', '_')}.pdf"

    # 1. S3 fast-path — 302 redirect to public S3 URL
    if _s3.S3_CONFIGURED and _s3.object_exists(f"invoices/{token}/invoice.pdf"):
        s3_url = _s3.get_public_url(f"invoices/{token}/invoice.pdf")
        # Preserve download-filename by wrapping through a query param? Not
        # supported on plain S3 objects unless we set Content-Disposition on
        # upload. For now, 302 to S3 URL — browsers will name it invoice.pdf
        # from the S3 key. Acceptable trade-off.
        return RedirectResponse(url=s3_url, status_code=302)

    # 2. Local disk fallback
    pdf_path = Path(invoice.get("pdf_path", ""))
    if not pdf_path.exists():
        # 3. Generate on-the-fly (this will also write to S3 if configured)
        html = _read_invoice_html(token)
        if html:
            from services.invoice_generator import generate_invoice_pdf
            pdf_path_str = generate_invoice_pdf(token, html=html)
            pdf_path = Path(pdf_path_str)
            await db.invoices.update_one({"token": token}, {"$set": {"pdf_path": pdf_path_str}})

            # After regen, prefer S3 redirect if it landed there
            if _s3.S3_CONFIGURED and _s3.object_exists(f"invoices/{token}/invoice.pdf"):
                return RedirectResponse(
                    url=_s3.get_public_url(f"invoices/{token}/invoice.pdf"),
                    status_code=302,
                )
        else:
            raise HTTPException(status_code=404, detail="Invoice PDF not found")

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=filename,
    )
