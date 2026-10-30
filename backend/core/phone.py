"""CR-085: single source of truth for customer phone identity."""
import re
from typing import Optional, Tuple

INDIA_CC = "+91"
_CC_RE = re.compile(r"^\+(\d{1,4})")

# CR-124: known country code prefixes for raw E.164 parsing (used when no explicit cc_in)
_KNOWN_CC = frozenset({
    "+1", "+33", "+39", "+44", "+49", "+61", "+65", "+81", "+86",
    "+91", "+353", "+852", "+966", "+971",
})


def normalize_phone(raw: Optional[str], country_code: Optional[str] = None) -> Tuple[str, str, str]:
    """Returns (phone_digits, country_code, status) with status in ok | fixed | invalid. Never raises."""
    raw_s = (raw or "").strip()
    cc_in = (country_code or "").strip() or None
    if cc_in and not _CC_RE.fullmatch(cc_in):
        return re.sub(r"\D", "", raw_s), cc_in, "invalid"

    # CR-124: detect cc from raw E.164 — known prefixes first (longest match), then regex fallback
    _raw_cc = None
    _is_india_e164 = False
    if raw_s.startswith("+"):
        for _n in (4, 3, 2, 1):
            _cand = raw_s[:_n + 1]
            if _cand in _KNOWN_CC:
                if _cand == INDIA_CC:
                    _is_india_e164 = True
                else:
                    _raw_cc = _cand
                break
        if not _raw_cc and not _is_india_e164:
            # Unknown prefix — regex fallback (greedy 1-4 digits)
            m = _CC_RE.match(raw_s)
            if m and f"+{m.group(1)}" != INDIA_CC:
                _raw_cc = f"+{m.group(1)}"

    if _raw_cc:
        # Non-India prefix detected in raw string (e.g. "+447911123456" → +44)
        cc = _raw_cc
        digits = re.sub(r"\D", "", raw_s[len(_raw_cc):])
    elif cc_in and cc_in != INDIA_CC:
        # CR-124: explicit non-India cc_in — skip India strip logic entirely
        digits = re.sub(r"\D", "", raw_s)
        cc = cc_in
    else:
        # India path — unchanged from CR-085
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
