"""CR-015 T1 + T5 — unit tests for resolver hardening + new formatters/registry.

Run from /app/backend with: python3 -m pytest tests/test_cr015_resolver.py -v
(No DB required for these tests — `db` is a mock.)
"""
import sys
import os
import pytest
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.whatsapp import (  # noqa: E402
    _format_value,
    resolve_variable,
    get_event_template_config,
)
from core.whatsapp_variables import (  # noqa: E402
    VARIABLES_BY_KEY,
    WHATSAPP_VARIABLES,
)


# ─────────────────────────────────────────────────────────────────
# T5 — Formatters
# ─────────────────────────────────────────────────────────────────

class TestTimeFormatter:
    def test_iso_evening(self):
        assert _format_value("2026-05-28T19:45:00+00:00", "time") == "7:45 PM"

    def test_iso_midnight(self):
        assert _format_value("2026-05-28T00:15:00+00:00", "time") == "12:15 AM"

    def test_iso_noon(self):
        assert _format_value("2026-05-28T12:00:00+00:00", "time") == "12:00 PM"

    def test_iso_zulu(self):
        assert _format_value("2026-05-28T19:45:00Z", "time") == "7:45 PM"

    def test_empty(self):
        assert _format_value("", "time") == ""

    def test_none(self):
        assert _format_value(None, "time") == ""

    def test_invalid_str(self):
        assert _format_value("not-a-date", "time") == "not-a-date"


class TestTitlecaseFormatter:
    def test_underscore_compound(self):
        assert _format_value("dine_in", "titlecase") == "Dine-In"

    def test_hyphen_compound(self):
        assert _format_value("take-away", "titlecase") == "Take-Away"

    def test_single_word_lower(self):
        assert _format_value("delivery", "titlecase") == "Delivery"

    def test_uppercase(self):
        assert _format_value("DELIVERY", "titlecase") == "Delivery"

    def test_mixed_case_compound(self):
        assert _format_value("DINE_IN", "titlecase") == "Dine-In"

    def test_three_word_underscore(self):
        assert _format_value("eat_in_dining", "titlecase") == "Eat-In-Dining"

    def test_empty(self):
        assert _format_value("", "titlecase") == ""

    def test_none(self):
        assert _format_value(None, "titlecase") == ""

    def test_whitespace_only(self):
        assert _format_value("   ", "titlecase") == ""


# ─────────────────────────────────────────────────────────────────
# T5 — Registry expansion
# ─────────────────────────────────────────────────────────────────

class TestRegistryExpansion:
    REQUIRED_NEW_KEYS = [
        "payment_method", "order_date", "order_time", "restaurant_order_id",
        "transaction_id", "table_id", "waiter_name", "order_type",
        "loyalty_points_used", "loyalty_discount", "wallet_used",
        "tax_amount", "item_count", "order_notes",
    ]

    def test_all_14_new_keys_present(self):
        for k in self.REQUIRED_NEW_KEYS:
            assert k in VARIABLES_BY_KEY, f"Missing registry entry: {k}"

    def test_total_count_at_least_37(self):
        # 23 baseline + 14 new
        assert len(WHATSAPP_VARIABLES) >= 37

    def test_every_entry_has_sources(self):
        for v in WHATSAPP_VARIABLES:
            assert v.get("sources"), f"{v['key']} missing sources"

    def test_every_entry_has_required_fields(self):
        for v in WHATSAPP_VARIABLES:
            for field in ("key", "label", "example", "description", "category", "fills_on_events"):
                assert field in v, f"{v.get('key','?')} missing field {field}"

    def test_payment_method_formatter_titlecase(self):
        assert VARIABLES_BY_KEY["payment_method"]["formatter"] == "titlecase"

    def test_order_date_formatter_date(self):
        assert VARIABLES_BY_KEY["order_date"]["formatter"] == "date"

    def test_order_time_formatter_time(self):
        assert VARIABLES_BY_KEY["order_time"]["formatter"] == "time"

    def test_loyalty_points_used_integer(self):
        assert VARIABLES_BY_KEY["loyalty_points_used"]["formatter"] == "integer"

    def test_loyalty_discount_currency(self):
        assert VARIABLES_BY_KEY["loyalty_discount"]["formatter"] == "currency"


# ─────────────────────────────────────────────────────────────────
# resolve_variable() — new keys end-to-end
# ─────────────────────────────────────────────────────────────────

class TestResolveVariableNewKeys:
    customer = {"name": "Abhishek", "phone": "7505242126"}
    brand = {"restaurant_name": "Kunafa Mahal"}

    def test_payment_method_titlecase(self):
        v = resolve_variable("payment_method", self.customer,
                             event_data={"payment_method": "upi"}, brand=self.brand)
        assert v == "Upi"

    def test_order_type_dine_in(self):
        v = resolve_variable("order_type", self.customer,
                             event_data={"order_type": "dine_in"}, brand=self.brand)
        assert v == "Dine-In"

    def test_order_date(self):
        v = resolve_variable("order_date", self.customer,
                             event_data={"order_created_at": "2026-05-28T19:45:00+00:00"},
                             brand=self.brand)
        assert v == "28 May 2026"

    def test_order_time(self):
        v = resolve_variable("order_time", self.customer,
                             event_data={"order_created_at": "2026-05-28T19:45:00+00:00"},
                             brand=self.brand)
        assert v == "7:45 PM"

    def test_restaurant_order_id_priority(self):
        # priority: restaurant_order_id → pos_order_id → order_id
        v = resolve_variable("restaurant_order_id", self.customer,
                             event_data={"restaurant_order_id": "KM-1234",
                                         "pos_order_id": "POS-X", "order_id": "ORD-Y"},
                             brand=self.brand)
        assert v == "KM-1234"

    def test_restaurant_order_id_fallback_to_pos(self):
        v = resolve_variable("restaurant_order_id", self.customer,
                             event_data={"pos_order_id": "POS-X", "order_id": "ORD-Y"},
                             brand=self.brand)
        assert v == "POS-X"

    def test_loyalty_discount_currency_formatter(self):
        v = resolve_variable("loyalty_discount", self.customer,
                             event_data={"loyalty_discount": 50.0}, brand=self.brand)
        assert v == "Rs.50"

    def test_tax_amount_falls_back_to_gst_tax(self):
        v = resolve_variable("tax_amount", self.customer,
                             event_data={"gst_tax": 85.5}, brand=self.brand)
        assert v == "Rs.85.50"

    def test_item_count_integer(self):
        v = resolve_variable("item_count", self.customer,
                             event_data={"item_count": 3}, brand=self.brand)
        assert v == "3"

    def test_missing_value_returns_empty(self):
        v = resolve_variable("payment_method", self.customer,
                             event_data={}, brand=self.brand)
        assert v == ""

    def test_unknown_var_key_returns_empty(self):
        v = resolve_variable("totally_unknown_key", self.customer,
                             event_data={"anything": 1}, brand=self.brand)
        assert v == ""


# ─────────────────────────────────────────────────────────────────
# T1 — get_event_template_config resolver hardening
# (No pytest-asyncio dep — use asyncio.run wrapper)
# ─────────────────────────────────────────────────────────────────

import asyncio


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


def _make_mock_db(event_map_row=None, var_map_str_row=None, var_map_int_row=None):
    """Build a mock motor db with whatsapp_event_template_map + whatsapp_template_variable_map."""
    db = MagicMock()

    db.whatsapp_event_template_map = MagicMock()
    db.whatsapp_event_template_map.find_one = AsyncMock(return_value=event_map_row)

    # variable_map.find_one is called once or twice; route by `template_id` type.
    db.whatsapp_template_variable_map = MagicMock()

    async def _var_find_one(query, *_args, **_kwargs):
        tid = query.get("template_id")
        if isinstance(tid, str):
            return var_map_str_row
        return var_map_int_row

    db.whatsapp_template_variable_map.find_one = AsyncMock(side_effect=_var_find_one)
    return db


class TestGetEventTemplateConfig:
    """Bug #1 fix — resolver must find var_map regardless of event_map's template_id type."""

    def test_int_event_map_finds_str_var_map(self):
        """The R689 send_bill case: event_map.template_id=int(25140), var_map.template_id='25140'."""
        event_map = {"user_id": "u", "event_key": "send_bill",
                     "template_id": 25140, "is_enabled": True,
                     "template_name": "loyality_points_collect_bill"}
        var_map_str = {"template_id": "25140",
                       "mappings": {"{{1}}": "customer_name", "{{2}}": "amount"},
                       "modes": {}}
        db = _make_mock_db(event_map_row=event_map, var_map_str_row=var_map_str)

        cfg = _run(get_event_template_config(db, "u", "send_bill"))
        assert cfg is not None
        assert cfg["template_id"] == "25140"  # canonical str
        assert cfg["variable_mappings"] == {"{{1}}": "customer_name", "{{2}}": "amount"}

    def test_str_event_map_finds_str_var_map(self):
        """Normal happy path: both stored as str."""
        event_map = {"user_id": "u", "event_key": "send_bill_manual",
                     "template_id": "26508", "is_enabled": True,
                     "template_name": "send_bill_to_customer"}
        var_map_str = {"template_id": "26508",
                       "mappings": {"{{1}}": "customer_name"},
                       "modes": {}}
        db = _make_mock_db(event_map_row=event_map, var_map_str_row=var_map_str)

        cfg = _run(get_event_template_config(db, "u", "send_bill_manual"))
        assert cfg["template_id"] == "26508"
        assert cfg["variable_mappings"] == {"{{1}}": "customer_name"}

    def test_int_event_map_falls_back_to_int_var_map(self):
        """Defensive: pre-T2 legacy row stored as int in var_map too."""
        event_map = {"user_id": "u", "event_key": "x",
                     "template_id": 99999, "is_enabled": True}
        var_map_int = {"template_id": 99999, "mappings": {"{{1}}": "amount"},
                       "modes": {}}
        db = _make_mock_db(event_map_row=event_map, var_map_str_row=None,
                           var_map_int_row=var_map_int)

        cfg = _run(get_event_template_config(db, "u", "x"))
        assert cfg["variable_mappings"] == {"{{1}}": "amount"}

    def test_disabled_event_returns_none(self):
        event_map = {"user_id": "u", "event_key": "x",
                     "template_id": "1", "is_enabled": False}
        db = _make_mock_db(event_map_row=event_map)
        assert _run(get_event_template_config(db, "u", "x")) is None

    def test_missing_event_map_returns_none(self):
        db = _make_mock_db(event_map_row=None)
        assert _run(get_event_template_config(db, "u", "x")) is None

    def test_missing_template_id_returns_none(self):
        event_map = {"user_id": "u", "event_key": "x",
                     "template_id": None, "is_enabled": True}
        db = _make_mock_db(event_map_row=event_map)
        assert _run(get_event_template_config(db, "u", "x")) is None

    def test_no_var_map_returns_empty_mappings(self):
        """No mapping doc → empty mappings (NOT None) — call site handles."""
        event_map = {"user_id": "u", "event_key": "x",
                     "template_id": "55555", "is_enabled": True}
        db = _make_mock_db(event_map_row=event_map, var_map_str_row=None,
                           var_map_int_row=None)
        cfg = _run(get_event_template_config(db, "u", "x"))
        assert cfg["template_id"] == "55555"
        assert cfg["variable_mappings"] == {}
        assert cfg["variable_modes"] == {}

    def test_canonical_str_template_id_in_response(self):
        """Even when input is int, response template_id is str."""
        event_map = {"user_id": "u", "event_key": "x",
                     "template_id": 25140, "is_enabled": True}
        var_map_str = {"template_id": "25140", "mappings": {}, "modes": {}}
        db = _make_mock_db(event_map_row=event_map, var_map_str_row=var_map_str)
        cfg = _run(get_event_template_config(db, "u", "x"))
        assert isinstance(cfg["template_id"], str)
        assert cfg["template_id"] == "25140"
