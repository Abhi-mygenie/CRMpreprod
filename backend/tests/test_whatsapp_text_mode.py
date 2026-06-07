"""
P1 Item 3 acceptance: build_body_values must honour modes['text'].
Covers the bug discovered in Addendum A 1.4 where text mode
worked in preview but was silently ignored at real send time.
"""
from core.whatsapp import build_body_values


def test_text_mode_literal_substitution():
    """mode=text -> literal string substituted as-is."""
    result = build_body_values(
        template_variables=["{{1}}", "{{2}}"],
        variable_mappings={"{{1}}": "customer_name", "{{2}}": "Welcome to MyGenie"},
        customer_data={"name": "John"},
        event_data={},
        variable_modes={"{{1}}": "map", "{{2}}": "text"},
    )
    assert result == {"1": "John", "2": "Welcome to MyGenie"}


def test_map_mode_field_resolution_default():
    """No modes dict passed -> defaults to map mode (backward compat)."""
    result = build_body_values(
        template_variables=["{{1}}"],
        variable_mappings={"{{1}}": "customer_name"},
        customer_data={"name": "Alice"},
        event_data={},
    )
    assert result == {"1": "Alice"}


def test_mixed_modes_per_variable():
    """Different modes per variable within one template."""
    result = build_body_values(
        template_variables=["{{1}}", "{{2}}", "{{3}}"],
        variable_mappings={
            "{{1}}": "customer_name",
            "{{2}}": "Hello",
            "{{3}}": "points_balance",
        },
        customer_data={"name": "Bob", "total_points": 500},
        event_data={},
        variable_modes={"{{1}}": "map", "{{2}}": "text", "{{3}}": "map"},
    )
    assert result == {"1": "Bob", "2": "Hello", "3": "500"}


def test_text_mode_with_empty_mapped_value_yields_empty():
    """If mapped string is empty AND mode=text, still empty output."""
    result = build_body_values(
        template_variables=["{{1}}"],
        variable_mappings={"{{1}}": ""},
        customer_data={},
        event_data={},
        variable_modes={"{{1}}": "text"},
    )
    assert result == {"1": ""}


def test_map_mode_unknown_field_yields_empty_not_literal():
    """mode=map + unknown field key -> empty (NOT the field key as literal)."""
    result = build_body_values(
        template_variables=["{{1}}"],
        variable_mappings={"{{1}}": "nonexistent_field"},
        customer_data={"name": "X"},
        event_data={},
        variable_modes={"{{1}}": "map"},
    )
    assert result == {"1": ""}
