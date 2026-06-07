"""
CR-014 Phase 2 Bucket 3: Invoice public routes.
- GET /api/invoices/{token}       → serves invoice HTML page
- GET /api/invoices/{token}/pdf   → serves invoice PDF download
No authentication required — the token IS the secret.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from pathlib import Path

from core.database import db

router = APIRouter(prefix="/invoices", tags=["Invoices"])

DATA_DIR = Path("/app/data/invoices")


@router.get("/{token}", response_class=HTMLResponse)
async def get_invoice_html(token: str):
    """Serve invoice HTML page. Public — no auth required."""
    # Validate token exists in DB
    invoice = await db.invoices.find_one({"token": token}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    html_path = Path(invoice.get("html_path", ""))
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Invoice file not found")

    # Inject correct PDF URL into the HTML before serving
    html = html_path.read_text(encoding="utf-8")
    pdf_url = f"/api/invoices/{token}/pdf"
    html = html.replace('href=""', f'href="{pdf_url}"', 1)

    return HTMLResponse(content=html)


@router.get("/{token}/pdf")
async def get_invoice_pdf(token: str):
    """Serve invoice PDF download. Public — no auth required."""
    invoice = await db.invoices.find_one({"token": token}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    pdf_path = Path(invoice.get("pdf_path", ""))
    if not pdf_path.exists():
        # Try to generate PDF on-the-fly if HTML exists
        html_path = Path(invoice.get("html_path", ""))
        if html_path.exists():
            from services.invoice_generator import generate_invoice_pdf
            pdf_path_str = generate_invoice_pdf(token)
            pdf_path = Path(pdf_path_str)
            # Update DB with pdf_path
            await db.invoices.update_one({"token": token}, {"$set": {"pdf_path": pdf_path_str}})
        else:
            raise HTTPException(status_code=404, detail="Invoice PDF not found")

    invoice_number = invoice.get("invoice_number", token[:8])
    filename = f"Invoice_{invoice_number.replace('/', '_')}.pdf"

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=filename,
    )
