#!/usr/bin/env python3
"""Merge every per-item SMOKE_BRIEF.pdf into one handout with a cover index.

Usage:  python3 memory/tools/smoke_briefs_all.py
Output: memory/SMOKE_BRIEFS_ALL_<YYYY-MM-DD>.pdf
Per-item PDFs stay the source of truth; this file is a convenience artefact.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[2]
CR_DIR = ROOT / "memory" / "change_requests"
ORDER = [
    "BUG-2026-10-06-001", "CR-2026-10-03-003", "CR-2026-10-08-001",
    "CR-2026-09-15-001", "CR-2026-10-03-004", "CR-2026-10-07-002", "CR-2026-10-03-001",
]
CSS = """
@page { size: A4; margin: 18mm 16mm; }
body { font-family: -apple-system,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 11pt; color: #1a1a1a; }
h1 { font-size: 20pt; margin: 0 0 4px; } .meta { color: #666; font-size: 9.5pt; margin-bottom: 18px; }
table { border-collapse: collapse; width: 100%; font-size: 10pt; }
th, td { border: 1px solid #cfcfcf; padding: 6px 8px; text-align: left; vertical-align: top; } th { background: #f3f3f3; }
.box { border: 1px solid #cfcfcf; border-radius: 4px; padding: 8px 10px; margin-top: 18px; font-size: 10pt; }
"""


def find_items():
    for item_id in ORDER:
        hits = sorted(CR_DIR.glob(f"{item_id}*/SMOKE_BRIEF.pdf"))
        if not hits:
            sys.exit(f"missing SMOKE_BRIEF.pdf for {item_id}")
        yield item_id, hits[0]


def title_of(pdf: Path) -> str:
    md = pdf.with_suffix(".md").read_text(encoding="utf-8")
    m = re.search(r'(?:Change|Fix): "([^"]+)"', md)
    return m.group(1) if m else "—"


def cover_pdf(rows, out: Path):
    body = "".join(
        f"<tr><td>{i}</td><td><code>{iid}</code></td><td>{t}</td><td>p. {p}</td><td>☐ PASS ☐ FAIL</td></tr>"
        for i, (iid, t, p) in enumerate(rows, 1)
    )
    html = f"""<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>
<h1>Smoke Test Briefs — consolidated handout</h1>
<div class="meta">MyGenie Customer App · generated {date.today().isoformat()} · {len(rows)} items awaiting owner smoke · Tester: ____________</div>
<table><tr><th>#</th><th>Item</th><th>Change</th><th>Starts</th><th>Result</th></tr>{body}</table>
<div class="box">Reply per item with <b>"Smoke PASS &lt;ID&gt;"</b> or <b>"Smoke FAIL &lt;ID&gt; — step N"</b>. Each brief is self-contained; order above is the recommended run order.</div>
</body></html>"""
    chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    if not chrome:
        sys.exit("no chrome/chromium found")
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "cover.html"
        src.write_text(html, encoding="utf-8")
        subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
                        f"--print-to-pdf={out}", f"file://{src}"], check=True, capture_output=True, timeout=60)


def main():
    items = list(find_items())
    rows, page = [], 2
    for iid, pdf in items:
        rows.append((iid, title_of(pdf), page))
        page += len(PdfReader(pdf).pages)
    with tempfile.TemporaryDirectory() as tmp:
        cover = Path(tmp) / "cover.pdf"
        cover_pdf(rows, cover)
        writer = PdfWriter()
        writer.append(str(cover))
        for iid, pdf in items:
            writer.add_outline_item(iid, len(writer.pages))
            writer.append(str(pdf))
        out = ROOT / "memory" / f"SMOKE_BRIEFS_ALL_{date.today().isoformat()}.pdf"
        with open(out, "wb") as fh:
            writer.write(fh)
    print("→", out.relative_to(ROOT), f"({len(writer.pages)} pages)")


if __name__ == "__main__":
    main()
