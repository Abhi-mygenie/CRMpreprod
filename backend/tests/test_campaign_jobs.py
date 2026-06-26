"""
CR-024 Phase 3 unit tests — compute_next_run_at().

Run: cd /app/backend && pytest tests/test_campaign_jobs.py -v
"""
import sys
import os
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.campaign_jobs import compute_next_run_at, DEFAULT_TZ

IST = ZoneInfo("Asia/Kolkata")


def _utc(dt_iso: str) -> datetime:
    return datetime.fromisoformat(dt_iso)


def test_scheduled_one_time_future():
    """Scheduled one-time future date — returns that UTC ISO."""
    camp = {
        "schedule_type": "scheduled",
        "scheduled_date": "2030-06-15",
        "scheduled_time": "10:00",
    }
    now = datetime(2026, 6, 7, 8, 0, tzinfo=timezone.utc)
    result = compute_next_run_at(camp, now)
    expected = datetime(2030, 6, 15, 10, 0, tzinfo=IST).astimezone(timezone.utc).isoformat()
    assert result == expected


def test_scheduled_one_time_past():
    """Scheduled one-time past — still returns that time (caller decides if stale)."""
    camp = {
        "schedule_type": "scheduled",
        "scheduled_date": "2020-01-01",
        "scheduled_time": "10:00",
    }
    now = datetime(2026, 6, 7, 8, 0, tzinfo=timezone.utc)
    result = compute_next_run_at(camp, now)
    assert result is not None
    # Should be 2020-01-01 10:00 IST in UTC
    expected = datetime(2020, 1, 1, 10, 0, tzinfo=IST).astimezone(timezone.utc).isoformat()
    assert result == expected


def test_recurring_daily_before_time():
    """Recurring daily 10:00 IST when now=08:00 IST → today 10:00 IST."""
    # 08:00 IST = 02:30 UTC
    now = datetime(2026, 6, 7, 2, 30, tzinfo=timezone.utc)
    camp = {
        "schedule_type": "recurring",
        "recurring_frequency": "daily",
        "scheduled_time": "10:00",
        "run_count": 0,
    }
    result = compute_next_run_at(camp, now)
    # Today (June 7) 10:00 IST = 04:30 UTC
    expected = datetime(2026, 6, 7, 10, 0, tzinfo=IST).astimezone(timezone.utc).isoformat()
    assert result == expected


def test_recurring_daily_after_time():
    """Recurring daily 10:00 IST when now=12:00 IST → tomorrow 10:00 IST."""
    # 12:00 IST = 06:30 UTC
    now = datetime(2026, 6, 7, 6, 30, tzinfo=timezone.utc)
    camp = {
        "schedule_type": "recurring",
        "recurring_frequency": "daily",
        "scheduled_time": "10:00",
        "run_count": 0,
    }
    result = compute_next_run_at(camp, now)
    expected = datetime(2026, 6, 8, 10, 0, tzinfo=IST).astimezone(timezone.utc).isoformat()
    assert result == expected


def test_recurring_weekly_multiple_days():
    """Weekly [Mon,Wed] when today=Tue → tomorrow Wed."""
    # 2026-06-09 is a Tuesday. 10:00 IST = 04:30 UTC.
    now = datetime(2026, 6, 9, 4, 30, tzinfo=timezone.utc)  # Tue 10:00 IST exactly
    camp = {
        "schedule_type": "recurring",
        "recurring_frequency": "weekly",
        "recurring_days": ["Mon", "Wed"],
        "scheduled_time": "10:00",
        "run_count": 0,
    }
    result = compute_next_run_at(camp, now)
    # Should be Wed 2026-06-10 10:00 IST
    expected_local = datetime(2026, 6, 10, 10, 0, tzinfo=IST)
    assert expected_local.weekday() == 2  # Wed
    assert result == expected_local.astimezone(timezone.utc).isoformat()


def test_recurring_monthly_day_31_in_feb():
    """Monthly day=31 → in Feb rolls to day 28/29."""
    now = datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc)  # Feb 1 UTC
    camp = {
        "schedule_type": "recurring",
        "recurring_frequency": "monthly",
        "recurring_day_of_month": 31,
        "scheduled_time": "10:00",
        "run_count": 0,
    }
    result = compute_next_run_at(camp, now)
    # 2026 is not a leap year → Feb has 28 days
    expected_local = datetime(2026, 2, 28, 10, 0, tzinfo=IST)
    assert result == expected_local.astimezone(timezone.utc).isoformat()


def test_recurring_end_by_occurrences():
    """Recurring with run_count >= recurring_occurrences → None."""
    camp = {
        "schedule_type": "recurring",
        "recurring_frequency": "daily",
        "scheduled_time": "10:00",
        "recurring_end_option": "after_occurrences",
        "recurring_occurrences": 5,
        "run_count": 5,
    }
    now = datetime(2026, 6, 7, 0, 0, tzinfo=timezone.utc)
    assert compute_next_run_at(camp, now) is None


def test_recurring_end_by_date_past():
    """Recurring with candidate > recurring_end_date → None."""
    camp = {
        "schedule_type": "recurring",
        "recurring_frequency": "daily",
        "scheduled_time": "10:00",
        "recurring_end_option": "after_date",
        "recurring_end_date": "2020-01-01",
        "run_count": 0,
    }
    now = datetime(2026, 6, 7, 0, 0, tzinfo=timezone.utc)
    assert compute_next_run_at(camp, now) is None


def test_recurring_weekly_empty_days_defaults_monday():
    """Weekly with empty/missing recurring_days → defaults to Monday."""
    now = datetime(2026, 6, 7, 0, 0, tzinfo=timezone.utc)  # 2026-06-07 is Sun
    camp = {
        "schedule_type": "recurring",
        "recurring_frequency": "weekly",
        "recurring_days": [],
        "scheduled_time": "10:00",
        "run_count": 0,
    }
    result = compute_next_run_at(camp, now)
    # Next Monday = 2026-06-08
    expected_local = datetime(2026, 6, 8, 10, 0, tzinfo=IST)
    assert expected_local.weekday() == 0
    assert result == expected_local.astimezone(timezone.utc).isoformat()


def test_unknown_schedule_type_returns_none():
    camp = {"schedule_type": "now"}
    now = datetime(2026, 6, 7, 0, 0, tzinfo=timezone.utc)
    assert compute_next_run_at(camp, now) is None


if __name__ == "__main__":
    import subprocess
    subprocess.run(["pytest", __file__, "-v"], check=False)
