"""
WhatsApp message status state machine.

Pure functions, no I/O. Used by:
  - core.whatsapp.log_message_attempt          (initial send -> pending/rejected)
  - routers.whatsapp.message_status_callback   (webhook -> delivered/read/rejected)

States:
  None        - pre-send (no row yet)
  pending     - successfully submitted to AuthKey, awaiting delivery report
  delivered   - AuthKey reported delivered to handset
  read        - recipient opened the message (terminal)
  rejected    - send failed OR carrier rejected/undelivered (terminal)

Events:
  initial_send_success   - emitted by send-side after AuthKey accepts
  initial_send_failure   - emitted by send-side on send error
  delivered              - emitted by webhook on AuthKey delivery report
  read                   - emitted by webhook on AuthKey read report
  rejected               - emitted by webhook on failed/undelivered/rejected

Transition rules (locked, CR-004 P3.5 plan section 5):
  - Only forward transitions are allowed.
  - Out-of-order events (e.g. delivered AFTER read) return None - caller MUST
    still append to status_history for audit but MUST NOT $set the status.
  - Duplicate transitions to the same state return None (idempotent webhook
    replays are silently dropped from status_history by the caller).
"""

from typing import Optional


ALLOWED_TRANSITIONS = {
    None: {
        "initial_send_success": "pending",
        "initial_send_failure": "rejected",
    },
    "pending": {
        "delivered": "delivered",
        "read": "read",
        "rejected": "rejected",
    },
    "delivered": {
        "read": "read",
        "rejected": "rejected",
    },
    "read": {
        # terminal - no forward transitions
    },
    "rejected": {
        # terminal - no forward transitions; /resend writes a new attempt row
    },
}

TERMINAL_STATUSES = frozenset({"read", "rejected"})


def next_status(current: Optional[str], event: str) -> Optional[str]:
    """
    Compute the next status given the current state and a transition event.

    Returns the new status if the transition is allowed, else None.
    Callers MUST treat None as "do not $set status" - but they MAY still
    record the event in status_history for audit.

    Examples:
        next_status(None, "initial_send_success") -> "pending"
        next_status("pending", "delivered")        -> "delivered"
        next_status("delivered", "read")           -> "read"
        next_status("read", "delivered")           -> None       # out-of-order
        next_status("rejected", "delivered")       -> None       # terminal
        next_status("pending", "unknown_event")    -> None
    """
    return ALLOWED_TRANSITIONS.get(current, {}).get(event)


def is_terminal(status: Optional[str]) -> bool:
    """True if status is a terminal state (no further transitions allowed)."""
    return status in TERMINAL_STATUSES
