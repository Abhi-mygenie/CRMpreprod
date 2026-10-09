#!/usr/bin/env python3
"""Render a SMOKE_BRIEF.md into a one-file PDF next to it (headless Chrome).

Usage:
  python3 memory/tools/smoke_brief.py memory/change_requests/<ITEM>/SMOKE_BRIEF.md
  python3 memory/tools/smoke_brief.py --all        # every SMOKE_BRIEF.md under change_requests/

Requires: `pip install markdown` and google-chrome / chromium on PATH.
Convention: one SMOKE_BRIEF.md (+ .pdf) per BUG/CR, written after QA PASS, before owner smoke.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[2]
CSS = """
@page { size: A4; margin: 18mm 16mm; }
body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #1a1a1a; }
h1 { font-size: 18pt; margin: 0 0 4px; } h2 { font-size: 13.5pt; margin: 18px 0 6px; border-bottom: 1.5px solid #e2e2e2; padding-bottom: 3px; }
h3 { font-size: 12pt; margin: 14px 0 4px; }
table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 10pt; }
th, td { border: 1px solid #cfcfcf; padding: 5px 7px; vertical-align: top; text-align: left; }
th { background: #f3f3f3; }
code { background: #f4f4f4; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
blockquote { border-left: 3px solid #e8632b; margin: 8px 0; padding: 4px 10px; background: #fff7f3; }
.meta { color: #666; font-size: 9.5pt; margin-bottom: 14px; }
ol li, ul li { margin: 2px 0; }
.box { border: 1px solid #cfcfcf; border-radius: 4px; padding: 8px 10px; margin: 8px 0; }
"""


def render(md_path: Path) -> Path:
    html_body = markdown.markdown(md_path.read_text(encoding="utf-8"), extensions=["tables", "fenced_code", "attr_list"])
    html = f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{html_body}</body></html>"
    pdf_path = md_path.with_suffix(".pdf")
    chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    if not chrome:
        sys.exit("no chrome/chromium found")
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "brief.html"
        src.write_text(html, encoding="utf-8")
        subprocess.run(
            [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
             f"--print-to-pdf={pdf_path}", f"file://{src}"],
            check=True, capture_output=True, timeout=60,
        )
    return pdf_path


def main(argv):
    if "--all" in argv:
        targets = sorted((ROOT / "memory" / "change_requests").glob("*/SMOKE_BRIEF.md"))
    else:
        targets = [Path(a).resolve() for a in argv if a.endswith(".md")]
    if not targets:
        sys.exit(__doc__)
    for t in targets:
        print("→", render(t).relative_to(ROOT))


if __name__ == "__main__":
    main(sys.argv[1:])
