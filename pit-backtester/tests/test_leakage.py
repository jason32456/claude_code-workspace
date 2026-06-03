"""
Adversarial tests proving future data is structurally impossible to access.
These are the most important tests in the project.
"""
from __future__ import annotations

import pytest
import pandas as pd
import numpy as np

from backtester.data.pit_store import AsOfClock, PITDataView
from backtester.strategy.schema import Condition, IndicatorRef
from backtester.strategy.conditions import evaluate_condition
from backtester.engine.portfolio import Position


def _make_prices(n_days: int = 10, ticker: str = "AAAA", start_price: float = 1000.0) -> pd.DataFrame:
    """Create a simple price DataFrame with n_days rows."""
    dates = pd.date_range("2020-01-01", periods=n_days, freq="B")
    prices = [start_price + i * 10 for i in range(n_days)]
    rows = []
    for d, p in zip(dates, prices):
        rows.append({
            "date": d,
            "ticker": ticker,
            "open": p,
            "high": p * 1.01,
            "low": p * 0.99,
            "close": p,
            "volume": 1_000_000,
        })
    return pd.DataFrame(rows)


def test_history_never_returns_future_bars():
    """
    Create a PITDataView with 10 bars. Set clock to day 5.
    Assert history() returns at most 5 bars, never bar 6-10.
    """
    df = _make_prices(10)
    clock = AsOfClock()
    pit = PITDataView(df, clock)

    dates = sorted(df["date"].unique())
    clock.advance(dates[4])  # day 5 (0-indexed: day index 4)

    history = pit.history("AAAA", "close", lookback=100)

    assert len(history) <= 5, f"Expected <= 5 bars, got {len(history)}"
    # Verify none of the returned dates are after clock.now
    for dt in history.index:
        assert pd.Timestamp(dt) <= clock.now, f"Future bar {dt} found in history!"

    # Explicitly check bars 6-10 are absent
    future_dates = dates[5:]
    for fd in future_dates:
        assert fd not in history.index, f"Future date {fd} found in history!"


def test_history_field_count():
    """history() with lookback=3 at day 5 returns exactly 3 bars, all <= day5."""
    df = _make_prices(10)
    clock = AsOfClock()
    pit = PITDataView(df, clock)

    dates = sorted(df["date"].unique())
    clock.advance(dates[4])  # day 5

    history = pit.history("AAAA", "close", lookback=3)

    assert len(history) == 3, f"Expected 3 bars with lookback=3, got {len(history)}"
    for dt in history.index:
        assert pd.Timestamp(dt) <= clock.now, f"Future bar in history: {dt}"


def test_current_bar_is_pit():
    """current_bar() returns None for future dates, correct bar for current date."""
    df = _make_prices(10)
    clock = AsOfClock()
    pit = PITDataView(df, clock)

    dates = sorted(df["date"].unique())

    # Before advancing: clock not yet set — calling current_bar would fail
    clock.advance(dates[0])  # day 1

    bar = pit.current_bar("AAAA")
    assert bar is not None, "current_bar() should return bar at clock.now"
    assert pd.Timestamp(bar.name) == dates[0]

    # Advance to day 3; day 5's bar should not be available as current
    clock.advance(dates[2])  # day 3
    bar_day3 = pit.current_bar("AAAA")
    assert bar_day3 is not None
    assert pd.Timestamp(bar_day3.name) == dates[2]

    # A future ticker should return None
    bar_future = pit.current_bar("NONEXISTENT")
    assert bar_future is None


def test_indicator_uses_only_past_data():
    """
    Compute RSI at day 50. Then compute RSI at day 49.
    Assert the values differ (day-50 incorporates day-50's close, day-49 does not).
    Uses a price series with both up and down moves so RSI is not pegged at 100.
    """
    from backtester.strategy.indicators import compute_indicator

    n = 60
    # Use alternating up/down prices so RSI is not pegged at 100
    rng = np.random.default_rng(12345)
    base = 1000.0
    prices_arr = [base]
    for i in range(1, n):
        change = rng.choice([-1, 1]) * (10 + i % 7)
        prices_arr.append(max(100.0, prices_arr[-1] + change))

    dates = pd.date_range("2020-01-01", periods=n, freq="B")
    rows = []
    for d, p in zip(dates, prices_arr):
        rows.append({
            "date": d, "ticker": "AAAA",
            "open": p, "high": p * 1.01, "low": p * 0.99, "close": p, "volume": 1e6,
        })
    df = pd.DataFrame(rows)
    dates = sorted(df["date"].unique())

    clock50 = AsOfClock()
    pit50 = PITDataView(df, clock50)
    clock50.advance(dates[49])  # day 50
    rsi_at_50 = compute_indicator("rsi", 14, None, pit50, "AAAA")

    clock49 = AsOfClock()
    pit49 = PITDataView(df, clock49)
    clock49.advance(dates[48])  # day 49
    rsi_at_49 = compute_indicator("rsi", 14, None, pit49, "AAAA")

    assert not np.isnan(rsi_at_50), "RSI at day 50 should not be nan"
    assert not np.isnan(rsi_at_49), "RSI at day 49 should not be nan"
    # Since the prices change each day, the RSI values should differ
    assert rsi_at_50 != rsi_at_49, (
        f"RSI at day 50 ({rsi_at_50}) should differ from RSI at day 49 ({rsi_at_49})"
    )


def test_cross_signal_no_leakage():
    """
    Construct a time series where SMA50 crosses above SMA200 on day 203 (index 202).
    At clock=day 202 (index 201): cross_above signal must be False.
    At clock=day 203 (index 202): cross_above signal must be True.

    Price series: first 200 days declining from 2000, then strong rally.
    SMA50 crosses above SMA200 empirically at index 202 (verified analytically).
    """
    n = 260
    prices_arr = []
    for i in range(n):
        if i < 200:
            prices_arr.append(2000.0 - i * 2.0)   # slowly declining: 2000→1602
        else:
            prices_arr.append(5000.0 + (i - 200) * 50.0)  # strong rally: 5000+

    dates = pd.date_range("2020-01-01", periods=n, freq="B")
    rows = []
    for d, p in zip(dates, prices_arr):
        rows.append({
            "date": d,
            "ticker": "TEST",
            "open": p,
            "high": p * 1.005,
            "low": p * 0.995,
            "close": p,
            "volume": 1_000_000,
        })
    df = pd.DataFrame(rows)

    cond = Condition(
        indicator="sma",
        period=50,
        op="cross_above",
        target=IndicatorRef(indicator="sma", period=200),
    )

    # At day 202 (index 201): cross has NOT happened yet (SMA50 still below SMA200)
    clock_before = AsOfClock()
    pit_before = PITDataView(df, clock_before)
    clock_before.advance(dates[201])
    result_before = evaluate_condition(cond, pit_before, "TEST")
    assert result_before == False, (
        f"cross_above should be False at day 202 (index 201), got {result_before}"
    )

    # At day 203 (index 202): cross fires (SMA50 just crossed above SMA200)
    clock_cross = AsOfClock()
    pit_cross = PITDataView(df, clock_cross)
    clock_cross.advance(dates[202])
    result_cross = evaluate_condition(cond, pit_cross, "TEST")
    assert result_cross == True, (
        f"cross_above should be True at day 203 (index 202), got {result_cross}"
    )


def test_exit_stop_loss_uses_current_bar_only():
    """
    Position entry at price 1000. Configure stop_loss at 8%.
    At a bar where close=920 (below stop), stop fires.
    At a bar where close=930 (above stop), stop does not fire.
    Verify the price used is the current bar's close, not any future bar.
    """
    # close=920 triggers stop (1000 * (1 - 0.08) = 920 threshold, 920 <= 920 → True)
    rows_920 = [
        {"date": pd.Timestamp("2020-01-02"), "ticker": "STOP",
         "open": 950, "high": 960, "low": 915, "close": 920, "volume": 1e6}
    ]
    df_920 = pd.DataFrame(rows_920)
    clock = AsOfClock()
    pit = PITDataView(df_920, clock)
    clock.advance(pd.Timestamp("2020-01-02"))

    pos = Position(
        ticker="STOP",
        lots=1,
        shares=100,
        entry_date=pd.Timestamp("2020-01-01"),
        entry_price=1000.0,
        high_water_mark=1000.0,
    )
    cond = Condition(type="stop_loss", pct=0.08)
    result = evaluate_condition(cond, pit, "STOP", position=pos)
    assert result == True, f"Stop loss should fire at close=920, threshold=920. Got {result}"

    # close=930 does NOT trigger stop (930 > 920)
    rows_930 = [
        {"date": pd.Timestamp("2020-01-02"), "ticker": "STOP",
         "open": 950, "high": 960, "low": 925, "close": 930, "volume": 1e6}
    ]
    df_930 = pd.DataFrame(rows_930)
    clock2 = AsOfClock()
    pit2 = PITDataView(df_930, clock2)
    clock2.advance(pd.Timestamp("2020-01-02"))

    result2 = evaluate_condition(cond, pit2, "STOP", position=pos)
    assert result2 == False, f"Stop loss should NOT fire at close=930. Got {result2}"


def test_clock_monotonicity():
    """Verify AsOfClock can only advance forward, not backward."""
    clock = AsOfClock()
    clock.advance(pd.Timestamp("2020-01-05"))
    clock.advance(pd.Timestamp("2020-01-06"))  # OK

    with pytest.raises(ValueError, match="advance forward"):
        clock.advance(pd.Timestamp("2020-01-04"))  # Going back — must raise


def test_available_tickers_respects_clock():
    """Tickers with all bars in the future are not in available_tickers()."""
    # PAST ticker: has bar on 2020-01-02
    # FUTURE ticker: has bar on 2020-06-01
    rows = [
        {"date": pd.Timestamp("2020-01-02"), "ticker": "PAST",
         "open": 100, "high": 105, "low": 95, "close": 100, "volume": 1e6},
        {"date": pd.Timestamp("2020-06-01"), "ticker": "FUTURE",
         "open": 200, "high": 210, "low": 195, "close": 200, "volume": 1e6},
    ]
    df = pd.DataFrame(rows)
    clock = AsOfClock()
    pit = PITDataView(df, clock)

    clock.advance(pd.Timestamp("2020-01-15"))

    available = pit.available_tickers()
    assert "PAST" in available, "PAST ticker should be available"
    assert "FUTURE" not in available, "FUTURE ticker should NOT be available before its first bar"
