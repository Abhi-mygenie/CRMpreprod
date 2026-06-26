"""
Unit tests for core.whatsapp_status state machine.

Pure tests - no DB, no network, no fixtures. Run with:
    cd /app/backend && python -m pytest tests/test_whatsapp_status_machine.py -v
"""

from core.whatsapp_status import (
    next_status,
    is_terminal,
    TERMINAL_STATUSES,
    ALLOWED_TRANSITIONS,
)


class TestInitialTransitions:
    def test_none_to_pending_on_success(self):
        assert next_status(None, "initial_send_success") == "pending"

    def test_none_to_rejected_on_failure(self):
        assert next_status(None, "initial_send_failure") == "rejected"

    def test_none_with_unknown_event_returns_none(self):
        assert next_status(None, "delivered") is None
        assert next_status(None, "random_event") is None


class TestPendingTransitions:
    def test_pending_to_delivered(self):
        assert next_status("pending", "delivered") == "delivered"

    def test_pending_to_read_direct(self):
        # AuthKey may skip 'delivered' and go straight to 'read' for fast reads
        assert next_status("pending", "read") == "read"

    def test_pending_to_rejected(self):
        assert next_status("pending", "rejected") == "rejected"

    def test_pending_duplicate_no_op(self):
        # Replayed 'sent -> pending' webhook
        assert next_status("pending", "initial_send_success") is None


class TestDeliveredTransitions:
    def test_delivered_to_read(self):
        assert next_status("delivered", "read") == "read"

    def test_delivered_to_rejected_late_carrier_failure(self):
        assert next_status("delivered", "rejected") == "rejected"

    def test_delivered_duplicate_no_op(self):
        assert next_status("delivered", "delivered") is None


class TestTerminalStates:
    def test_read_is_terminal(self):
        assert is_terminal("read") is True
        assert next_status("read", "delivered") is None  # out-of-order
        assert next_status("read", "read") is None
        assert next_status("read", "rejected") is None

    def test_rejected_is_terminal(self):
        assert is_terminal("rejected") is True
        assert next_status("rejected", "delivered") is None
        assert next_status("rejected", "read") is None
        assert next_status("rejected", "rejected") is None

    def test_non_terminal_states(self):
        assert is_terminal("pending") is False
        assert is_terminal("delivered") is False
        assert is_terminal(None) is False


class TestInvariants:
    def test_terminal_set_matches_table(self):
        """Every state in TERMINAL_STATUSES has no outgoing transitions."""
        for terminal in TERMINAL_STATUSES:
            assert ALLOWED_TRANSITIONS.get(terminal, {}) == {}

    def test_all_target_states_are_known(self):
        """Every transition target must itself be a known state in the table."""
        known_states = set(ALLOWED_TRANSITIONS.keys())
        for source, transitions in ALLOWED_TRANSITIONS.items():
            for event, target in transitions.items():
                assert target in known_states, (
                    f"Transition {source!r}--{event}-->{target!r} targets unknown state"
                )
