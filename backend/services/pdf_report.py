"""CR-003 Phase 3 — Coupon Analytics PDF Report Generator.
Generates a branded PDF matching the MyGenie credit-statement style.
"""
from io import BytesIO
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    HRFlowable, PageBreak,
)
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate, Frame
from reportlab.lib.colors import HexColor

# ── Brand colours ────────────────────────────────────────
BRAND_ORANGE = HexColor("#F26B33")
BRAND_DARK = HexColor("#1F2937")
BRAND_GRAY = HexColor("#6B7280")
BRAND_LIGHT_GRAY = HexColor("#F3F4F6")
BRAND_WHITE = colors.white
BRAND_GREEN = HexColor("#329937")
BRAND_PURPLE = HexColor("#8B5CF6")
BRAND_TEAL = HexColor("#0D9488")
BRAND_BLUE = HexColor("#62B5E5")

SCOPE_COLORS = {
    "order": BRAND_ORANGE, "item": BRAND_PURPLE,
    "category": BRAND_GREEN, "unknown": BRAND_GRAY,
}
SCOPE_LABELS = {
    "order": "Order-Level", "item": "Item-Level",
    "category": "Category-Level", "unknown": "Other",
}
OFFER_LABELS = {
    "simple": "Simple", "bogo": "BOGO", "bxg": "Buy X Get Y",
    "nth_item": "Every Nth", "free_item": "Free Item",
    "combo": "Combo", "unknown": "Other",
}


def _fmt_inr(val):
    """Format a number as INR currency string."""
    try:
        return f"Rs.{float(val):,.2f}"
    except (TypeError, ValueError):
        return "Rs.0.00"


def _fmt_date(iso_str):
    """Format ISO date string to DD/MM/YYYY."""
    if not iso_str:
        return "Never"
    try:
        return iso_str[:10].replace("-", "/") if len(iso_str) >= 10 else str(iso_str)
    except Exception:
        return str(iso_str)


class CouponAnalyticsPDFReport:
    """Build a branded coupon analytics PDF report."""

    def __init__(self, restaurant_name: str, user_email: str,
                 stats: dict, top_coupons: list,
                 period_label: str = "All Time"):
        self.restaurant_name = restaurant_name
        self.user_email = user_email
        self.stats = stats
        self.top_coupons = top_coupons
        self.period_label = period_label
        self.generated_at = datetime.now(timezone.utc).strftime("%d/%m/%Y, %I:%M %p")
        self._styles = getSampleStyleSheet()
        self._add_custom_styles()

    def _add_custom_styles(self):
        s = self._styles
        s.add(ParagraphStyle("BrandTitle", parent=s["Title"],
                             fontSize=22, textColor=BRAND_ORANGE,
                             spaceAfter=2 * mm, fontName="Helvetica-Bold"))
        s.add(ParagraphStyle("RestName", parent=s["Normal"],
                             fontSize=14, textColor=BRAND_DARK,
                             fontName="Helvetica-Bold", spaceAfter=1 * mm))
        s.add(ParagraphStyle("SubInfo", parent=s["Normal"],
                             fontSize=8, textColor=BRAND_GRAY,
                             fontName="Helvetica"))
        s.add(ParagraphStyle("SectionHead", parent=s["Heading2"],
                             fontSize=12, textColor=BRAND_DARK,
                             fontName="Helvetica-Bold",
                             spaceBefore=6 * mm, spaceAfter=3 * mm))
        s.add(ParagraphStyle("CardValue", parent=s["Normal"],
                             fontSize=14, textColor=BRAND_DARK,
                             fontName="Helvetica-Bold", alignment=TA_CENTER,
                             leading=16))
        s.add(ParagraphStyle("CardLabel", parent=s["Normal"],
                             fontSize=8, textColor=BRAND_GRAY,
                             fontName="Helvetica", alignment=TA_CENTER,
                             spaceBefore=1 * mm, leading=10))
        s.add(ParagraphStyle("FooterText", parent=s["Normal"],
                             fontSize=7, textColor=BRAND_GRAY,
                             fontName="Helvetica", alignment=TA_CENTER))
        s.add(ParagraphStyle("CellText", parent=s["Normal"],
                             fontSize=8, textColor=BRAND_DARK,
                             fontName="Helvetica"))
        s.add(ParagraphStyle("CellTextBold", parent=s["Normal"],
                             fontSize=8, textColor=BRAND_DARK,
                             fontName="Helvetica-Bold"))

    # ── header / footer drawn on every page ──────────────
    def _header_footer(self, canvas, doc):
        canvas.saveState()
        w, h = A4
        # Top-left: date
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(BRAND_GRAY)
        canvas.drawString(15 * mm, h - 10 * mm, self.generated_at)
        # Top-right: report name
        canvas.drawRightString(w - 15 * mm, h - 10 * mm,
                               f"Coupon Analytics - {self.restaurant_name}")
        # Top accent line
        canvas.setStrokeColor(BRAND_ORANGE)
        canvas.setLineWidth(1.5)
        canvas.line(15 * mm, h - 12 * mm, w - 15 * mm, h - 12 * mm)
        # Footer
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(BRAND_GRAY)
        canvas.drawCentredString(w / 2, 10 * mm,
                                 "This is a computer-generated report. Powered by MyGenie CRM.")
        canvas.drawRightString(w - 15 * mm, 10 * mm,
                               f"{doc.page}")
        canvas.restoreState()

    # ── summary cards row ────────────────────────────────
    def _build_summary_cards(self):
        s = self.stats
        avg = _fmt_inr(s["discount_availed"] / s["coupons_used"]) if s.get("coupons_used") else "—"
        roi = s.get("roi", {})
        roi_val = f"{roi['score']}x" if roi.get("score") else "—"
        cards_data = [
            ("TOTAL COUPONS", str(s.get("total_coupons", 0)), BRAND_PURPLE),
            ("TIMES USED", str(s.get("coupons_used", 0)), BRAND_ORANGE),
            ("TOTAL DISCOUNT", _fmt_inr(s.get("discount_availed", 0)), BRAND_GREEN),
            ("AVG DISCOUNT", avg, BRAND_BLUE),
            ("ROI SCORE", roi_val, HexColor("#F59E0B")),
        ]
        cells = []
        for label, value, accent in cards_data:
            hex_c = accent.hexval()[2:]
            combined = Paragraph(
                f'<font size="12" color="#{hex_c}"><b>{value}</b></font>'
                f'<br/>'
                f'<font size="6" color="#6B7280">{label}</font>',
                ParagraphStyle("_card", parent=self._styles["Normal"],
                               alignment=TA_CENTER, leading=16,
                               spaceBefore=2 * mm, spaceAfter=2 * mm),
            )
            cells.append(combined)

        col_w = (A4[0] - 30 * mm) / 5
        t = Table([cells], colWidths=[col_w] * 5, rowHeights=[16 * mm])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BACKGROUND", (0, 0), (-1, -1), BRAND_WHITE),
            ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
        ]))
        return t

    # ── ROI insight banner ───────────────────────────────
    def _build_roi_banner(self):
        roi = self.stats.get("roi", {})
        if not roi.get("score"):
            return Spacer(1, 0)
        score = roi["score"]
        if score >= 8:
            label, accent = "Strong ROI", BRAND_GREEN
        elif score >= 4:
            label, accent = "Good ROI", HexColor("#F59E0B")
        elif score >= 2:
            label, accent = "Watch", BRAND_ORANGE
        else:
            label, accent = "Margin Risk", HexColor("#DC2626")
        hex_c = accent.hexval()[2:]

        lines = [f'<font size="9" color="#{hex_c}"><b>{label} ({score}x)</b></font>'
                 f' — Your coupons earned Rs.{score:.2f} for every Rs.1 discount']
        if roi.get("basket_lift") and roi["basket_lift"] > 1:
            lines.append(
                f'<br/><font size="8" color="#4B5563">Coupon customers spend '
                f'<b>{roi["basket_lift"]}x more</b> than average '
                f'(Rs.{roi.get("avg_coupon_order", 0):,.0f} vs Rs.{roi.get("avg_all_order", 0):,.0f})</font>')
        lines.append(
            f'<br/><font size="7" color="#6B7280">'
            f'Gross Revenue: <b>Rs.{roi.get("gross_revenue", 0):,.2f}</b>'
            f' &nbsp; Net Revenue: <b>Rs.{roi.get("net_revenue", 0):,.2f}</b>'
            f' &nbsp; Discount Cost: <b>{roi.get("discount_cost_pct", 0)}%</b>'
            f'</font>')
        return Paragraph("".join(lines),
                         ParagraphStyle("_roibanner", parent=self._styles["Normal"],
                                        fontSize=9, leading=14,
                                        spaceBefore=2 * mm, spaceAfter=2 * mm,
                                        leftIndent=4 * mm))

    # ── breakdown tables ─────────────────────────────────
    def _build_scope_table(self):
        rows = [["SCOPE", "USED", "DISCOUNT"]]
        bs = self.stats.get("breakdown_by_scope", {})
        for key in ["order", "item", "category", "unknown"]:
            v = bs.get(key, {})
            if v.get("used", 0) > 0 or True:  # show all
                rows.append([
                    SCOPE_LABELS.get(key, key),
                    str(v.get("used", 0)),
                    _fmt_inr(v.get("discount", 0)),
                ])
        col_w = [50 * mm, 30 * mm, 40 * mm]
        t = Table(rows, colWidths=col_w)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_ORANGE),
            ("TEXTCOLOR", (0, 0), (-1, 0), BRAND_WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("TEXTCOLOR", (0, 1), (-1, -1), BRAND_DARK),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
            ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ]))
        return t

    def _build_offer_type_table(self):
        rows = [["OFFER TYPE", "USED", "DISCOUNT"]]
        bo = self.stats.get("breakdown_by_offer_type", {})
        for key in ["simple", "bogo", "bxg", "nth_item", "free_item", "combo", "unknown"]:
            v = bo.get(key, {})
            rows.append([
                OFFER_LABELS.get(key, key),
                str(v.get("used", 0)),
                _fmt_inr(v.get("discount", 0)),
            ])
        col_w = [50 * mm, 30 * mm, 40 * mm]
        t = Table(rows, colWidths=col_w)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_ORANGE),
            ("TEXTCOLOR", (0, 0), (-1, 0), BRAND_WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("TEXTCOLOR", (0, 1), (-1, -1), BRAND_DARK),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
            ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ]))
        return t

    # ── special offer summary cards ──────────────────────
    def _build_special_offers_table(self):
        tw = self.stats.get("time_window_usage", {})
        bx = self.stats.get("bxgy_usage", {})
        nth = self.stats.get("nth_item_usage", {})
        rows = [
            ["METRIC", "VALUE"],
            ["Happy Hour — Coupons with window", str(tw.get("coupons_with_window", 0))],
            ["Happy Hour — Used within window", str(tw.get("used_within_window", 0))],
            ["BOGO — Orders", str(bx.get("bogo_orders", 0))],
            ["BXG — Orders", str(bx.get("bxg_orders", 0))],
            ["BOGO/BXG — Free items given", str(bx.get("free_units_given", 0))],
            ["BOGO/BXG — Discount amount", _fmt_inr(bx.get("discount_amount", 0))],
            ["Every Nth — Orders", str(nth.get("orders", 0))],
            ["Every Nth — Benefit items given", str(nth.get("benefit_units_given", 0))],
            ["Every Nth — Discount amount", _fmt_inr(nth.get("discount_amount", 0))],
        ]
        col_w = [100 * mm, 50 * mm]
        t = Table(rows, colWidths=col_w)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_ORANGE),
            ("TEXTCOLOR", (0, 0), (-1, 0), BRAND_WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("TEXTCOLOR", (0, 1), (-1, -1), BRAND_DARK),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
            ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
            # Alternate row shading
            *[("BACKGROUND", (0, i), (-1, i), BRAND_LIGHT_GRAY)
              for i in range(2, len(rows), 2)],
        ]))
        return t

    # ── coupon performance table ─────────────────────────
    def _build_coupons_table(self):
        header = ["#", "CODE", "TITLE", "SCOPE", "TYPE", "USED",
                  "DISCOUNT", "ROI", "LAST USED", "STATUS"]
        rows = [header]
        for i, c in enumerate(self.top_coupons, 1):
            roi_s = c.get("roi_score")
            if roi_s is not None:
                if roi_s >= 8:
                    roi_txt = f"{roi_s}x Strong"
                elif roi_s >= 4:
                    roi_txt = f"{roi_s}x Good"
                elif roi_s >= 2:
                    roi_txt = f"{roi_s}x Watch"
                else:
                    roi_txt = f"{roi_s}x Risk"
            else:
                roi_txt = "—"
            rows.append([
                str(i),
                str(c.get("code", "")),
                str(c.get("title", "") or "—")[:22],
                SCOPE_LABELS.get(c.get("discount_scope", ""), c.get("discount_scope", "")),
                OFFER_LABELS.get(c.get("offer_type", ""), c.get("offer_type", "")),
                str(c.get("times_used", 0)),
                _fmt_inr(c.get("total_discount", 0)),
                roi_txt,
                _fmt_date(c.get("last_used")),
                "Active" if c.get("is_active") else "Inactive",
            ])

        col_widths = [7 * mm, 28 * mm, 24 * mm, 20 * mm, 20 * mm,
                      12 * mm, 20 * mm, 20 * mm, 18 * mm, 15 * mm]
        t = Table(rows, colWidths=col_widths, repeatRows=1)

        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_ORANGE),
            ("TEXTCOLOR", (0, 0), (-1, 0), BRAND_WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 6.5),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 6.5),
            ("TEXTCOLOR", (0, 1), (-1, -1), BRAND_DARK),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (5, 0), (7, -1), "RIGHT"),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, HexColor("#E5E7EB")),
            ("TOPPADDING", (0, 0), (-1, -1), 1.5 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5 * mm),
            ("LEFTPADDING", (0, 0), (-1, -1), 1.5 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
        ]
        for i in range(2, len(rows), 2):
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), BRAND_LIGHT_GRAY))
        # Color ROI and Status cells
        for i, c in enumerate(self.top_coupons, 1):
            roi_s = c.get("roi_score")
            if roi_s is not None:
                if roi_s >= 8:
                    style_cmds.append(("TEXTCOLOR", (7, i), (7, i), BRAND_GREEN))
                elif roi_s >= 4:
                    style_cmds.append(("TEXTCOLOR", (7, i), (7, i), HexColor("#D97706")))
                elif roi_s >= 2:
                    style_cmds.append(("TEXTCOLOR", (7, i), (7, i), BRAND_ORANGE))
                else:
                    style_cmds.append(("TEXTCOLOR", (7, i), (7, i), HexColor("#DC2626")))
            if c.get("is_active"):
                style_cmds.append(("TEXTCOLOR", (9, i), (9, i), BRAND_GREEN))
            else:
                style_cmds.append(("TEXTCOLOR", (9, i), (9, i), HexColor("#DC2626")))

        t.setStyle(TableStyle(style_cmds))
        return t

    # ── assemble full document ───────────────────────────
    def generate(self) -> bytes:
        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            topMargin=15 * mm, bottomMargin=15 * mm,
            leftMargin=15 * mm, rightMargin=15 * mm,
        )
        story = []
        s = self._styles

        # ── Page 1: Header ───
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph("COUPON ANALYTICS", s["BrandTitle"]))
        story.append(Paragraph(self.restaurant_name, s["RestName"]))
        story.append(Paragraph(f"Period: {self.period_label}", s["SubInfo"]))
        story.append(Paragraph(
            f"Generated: {self.generated_at} &nbsp;&nbsp;|&nbsp;&nbsp; By: {self.user_email}",
            s["SubInfo"]))
        story.append(Spacer(1, 3 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5,
                                color=HexColor("#E5E7EB")))
        story.append(Spacer(1, 4 * mm))

        # ── Summary cards ────
        story.append(self._build_summary_cards())
        story.append(Spacer(1, 3 * mm))

        # ── ROI Insight Banner ────
        story.append(self._build_roi_banner())
        story.append(Spacer(1, 3 * mm))

        # ── Breakdown side-by-side ───
        story.append(Paragraph("Usage Breakdown", s["SectionHead"]))

        # Scope breakdown
        story.append(Paragraph(
            '<font color="#F26B33"><b>By Scope</b></font>', s["CellTextBold"]))
        story.append(Spacer(1, 2 * mm))
        story.append(self._build_scope_table())
        story.append(Spacer(1, 4 * mm))

        # Offer type breakdown
        story.append(Paragraph(
            '<font color="#F26B33"><b>By Offer Type</b></font>', s["CellTextBold"]))
        story.append(Spacer(1, 2 * mm))
        story.append(self._build_offer_type_table())
        story.append(Spacer(1, 5 * mm))

        # ── Special offer metrics ────
        story.append(Paragraph("Special Offer Metrics", s["SectionHead"]))
        story.append(self._build_special_offers_table())
        story.append(Spacer(1, 5 * mm))

        # ── Coupon performance table ─
        n = len(self.top_coupons)
        story.append(Paragraph(
            f"Coupon Performance ({n})", s["SectionHead"]))
        story.append(self._build_coupons_table())
        story.append(Spacer(1, 8 * mm))

        # ── Disclaimer ───
        story.append(HRFlowable(width="100%", thickness=0.5,
                                color=HexColor("#E5E7EB")))
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(
            "This is a computer-generated coupon analytics report. "
            "Powered by MyGenie CRM.",
            s["FooterText"]))

        doc.build(story, onFirstPage=self._header_footer,
                  onLaterPages=self._header_footer)
        return buf.getvalue()
