"""CR-085: single source of truth for customer phone identity."""
import re
from typing import Optional, Tuple

INDIA_CC = "+91"
_CC_RE = re.compile(r"^\+(\d{1,4})")


def normalize_phone(raw: Optional[str], country_code: Optional[str] = None) -> Tuple[str, str, str]:
    """Returns (phone_digits, country_code, status) with status in ok | fixed | invalid. Never raises."""
    raw_s = (raw or "").strip()
    cc_in = (country_code or "").strip() or None
    if cc_in and not _CC_RE.fullmatch(cc_in):
        return re.sub(r"\D", "", raw_s), cc_in, "invalid"
    m = _CC_RE.match(raw_s)
    if m and f"+{m.group(1)}" != INDIA_CC:
        cc = f"+{m.group(1)}"
        digits = re.sub(r"\D", "", raw_s[m.end():])
    else:
        digits = re.sub(r"\D", "", raw_s)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        cc = cc_in if cc_in and cc_in != INDIA_CC else INDIA_CC
    if cc == INDIA_CC:
        valid = len(digits) == 10 and digits[0] in "6789" and len(set(digits)) > 1
    else:
        valid = 6 <= len(digits) <= 15
    if not valid:
        return digits, cc, "invalid"
    unchanged = digits == raw_s and (cc_in or INDIA_CC) == cc
    return digits, cc, "ok" if unchanged else "fixed"


def phone_match(user_id: str, phone: str, cc: str) -> dict:
    """Unified identity key — same as sync F11 and /scan/auth/lookup.
    CR-100: tolerant for legacy country_code null/"" when cc == "+91".
    Foreign cc stays exact so +61/+44 diners are never mis-matched.
    """
    if cc == "+91":  # CR-100
        return {"user_id": user_id, "phone": phone, "country_code": {"$in": ["+91", None, ""]}}
    return {"user_id": user_id, "phone": phone, "country_code": cc}
