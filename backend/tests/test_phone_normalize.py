import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytest
from core.phone import normalize_phone, phone_match


@pytest.mark.parametrize("raw,cc_in,exp", [
    ("9876543210", None, ("9876543210", "+91", "ok")),
    ("+91 98765 43210", None, ("9876543210", "+91", "fixed")),
    ("09876543210", None, ("9876543210", "+91", "fixed")),
    ("919876543210", None, ("9876543210", "+91", "fixed")),
    ("98387 77712", None, ("9838777712", "+91", "fixed")),
    ("+61 404668073", None, ("404668073", "+61", "fixed")),
    ("404668073", "+61", ("404668073", "+61", "ok")),
    ("0000000000", None, ("0000000000", "+91", "invalid")),
    ("123456789", None, ("123456789", "+91", "invalid")),
    ("", None, ("", "+91", "invalid")),
    ("1234567890", None, ("1234567890", "+91", "invalid")),
    ("9876543210", "91", ("9876543210", "91", "invalid")),
])
def test_normalize(raw, cc_in, exp):
    assert normalize_phone(raw, cc_in) == exp


def test_phone_match_key():
    assert phone_match("u1", "9876543210", "+91") == {"user_id": "u1", "phone": "9876543210", "country_code": "+91"}
