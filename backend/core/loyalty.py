"""Shared loyalty math helpers.

CR-001C-L Phase L1 (F1, 2026-05-22, forward-only):
  Single source of truth for loyalty point calculation and tier resolution.
  Hosts:
    • calculate_points(order_amount, customer, settings) — base earn +
      off-peak bonus.
    • calculate_tier(total_points, settings) — total_points → tier string.

  Parity contract: behavior MUST exactly match the previous inline
  `pos.py::_calculate_points` and `helpers.py::calculate_tier`
  implementations. A parity QA harness lives in
  `/tmp/cr_001c_l_l1_l2_parity_qa.py`.

  Used by:
    • routers/pos.py (realtime POS webhook) — Phase L1+L2.
    • core/helpers.py (re-export shim for `calculate_tier`) — Phase L1.

  Reserved for future phases (NOT yet wired here):
    • routers/migration.py order_sync — Phase L3.
    • routers/points.py manual redeem / core/loyalty_jobs.py crons — Phase L4.
"""
from core.helpers import check_off_peak_bonus, get_earn_percent_for_tier


def calculate_tier(total_points: int, settings: dict) -> str:
    """Map total_points → tier name. Pure function.

    Parity with prior `helpers.calculate_tier`. `helpers.calculate_tier`
    is retained as a re-export shim so existing callers do not change.
    """
    if total_points >= settings.get("tier_platinum_min", 5000):
        return "Platinum"
    if total_points >= settings.get("tier_gold_min", 1500):
        return "Gold"
    if total_points >= settings.get("tier_silver_min", 500):
        return "Silver"
    return "Bronze"


def calculate_points(order_amount: float, customer: dict, settings: dict) -> dict:
    """Calculate points earned for an order including off-peak bonus.

    Parity with prior `pos.py::_calculate_points`. Caller is responsible
    for honoring `settings.loyalty_enabled` (kill-switch); this helper
    computes math only.

    Returns dict with keys:
        base_points: int
        off_peak_bonus: int
        total_points: int
        description: str
        off_peak_message: Optional[str]
    """
    min_order = settings.get("min_order_value", 100.0)
    if order_amount < min_order:
        return {
            "base_points": 0,
            "off_peak_bonus": 0,
            "total_points": 0,
            "description": "",
        }

    tier = customer.get("tier", "Bronze")
    earn_percent = get_earn_percent_for_tier(tier, settings)
    base_points = int(order_amount * earn_percent / 100)

    # Off-peak bonus
    is_off_peak, bonus_value, bonus_type, off_peak_msg = check_off_peak_bonus(settings)
    off_peak_bonus = 0

    if is_off_peak and base_points > 0:
        if bonus_type == "multiplier":
            off_peak_bonus = int(base_points * (bonus_value - 1))
        else:
            off_peak_bonus = int(bonus_value)

    total = base_points + off_peak_bonus
    desc = f"Earned {earn_percent}% on order of Rs.{order_amount}"
    if off_peak_bonus > 0:
        desc += f" (+{off_peak_bonus} off-peak bonus)"

    return {
        "base_points": base_points,
        "off_peak_bonus": off_peak_bonus,
        "total_points": total,
        "description": desc,
        "off_peak_message": off_peak_msg if off_peak_bonus > 0 else None,
    }
