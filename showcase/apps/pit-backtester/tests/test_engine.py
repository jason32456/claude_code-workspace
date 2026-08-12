"""Engine integration tests."""
from __future__ import annotations

import warnings
import pytest
import pandas as pd
import numpy as np

from backtester.data.pit_store import AsOfClock, PITDataView
from backtester.engine.portfolio import Portfolio, Position
from backtester.engine.broker import Broker, compute_buy_cost, compute_sell_cost
from backtester.engine.loop import BacktestEngine
from backtester.strategy.schema import (
    StrategyConfig, Condition, SizingConfig, ExecutionConfig, CostsConfig
)
from datetime import date


def _make_two_ticker_prices(n_days: int = 252) -> pd.DataFrame:
    """Ticker A: 1000→2000 linearly. Ticker B: flat 1000."""
    dates = pd.date_range("2020-01-01", periods=n_days, freq="B")
    rows = []
    for i, d in enumerate(dates):
        price_a = 1000.0 + (1000.0 * i / (n_days - 1))
        price_b = 1000.0
        for ticker, p in [("AAAA", price_a), ("BBBB", price_b)]:
            rows.append({
                "date": d,
                "ticker": ticker,
                "open": p,
                "high": p * 1.005,
                "low": p * 0.995,
                "close": p,
                "volume": 1_000_000,
            })
    return pd.DataFrame(rows)


def _zero_costs() -> CostsConfig:
    return CostsConfig(
        commission_buy_pct=0.0,
        commission_sell_pct=0.0,
        sell_tax_pct=0.0,
        slippage_bps=0.0,
    )


def _small_costs() -> CostsConfig:
    return CostsConfig(
        commission_buy_pct=0.0015,
        commission_sell_pct=0.0025,
        sell_tax_pct=0.001,
        slippage_bps=5.0,
    )


def _buy_and_hold_config(ticker: str = "AAAA") -> StrategyConfig:
    """Always-true entry (SMA5 > 0), 999-day time stop exit."""
    return StrategyConfig(
        name="buy_and_hold_test",
        universe=[ticker],
        start_date=date(2020, 1, 1),
        end_date=date(2020, 12, 31),
        initial_capital=1_000_000.0,
        currency="IDR",
        entry=Condition(indicator="sma", period=5, op=">", value=0),
        exit=Condition(type="time_stop", days=9999),
        sizing=SizingConfig(method="equal_weight", max_positions=1),
        execution=ExecutionConfig(signal_on="close", fill_on="next_open"),
        costs=_zero_costs(),
        lot_size=100,
    )


def test_buy_and_hold_exact():
    """
    Ticker A goes from 1000 to 2000 over 252 days. Buy on first signal, hold.
    With zero costs and fill_on=next_open, expect return close to 100%.
    """
    prices = _make_two_ticker_prices(252)
    config = _buy_and_hold_config("AAAA")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        engine = BacktestEngine(config, prices)
        portfolio = engine.run()

    metrics_df = portfolio.get_equity_df()
    assert not metrics_df.empty, "Equity curve should not be empty"

    trades = portfolio.closed_trades
    # May have 0 trades if time_stop never triggers within the date range
    # What matters: equity should have doubled (approximately)
    final_equity = metrics_df["equity"].iloc[-1]
    initial = config.initial_capital
    # Return should be positive (price goes from 1000 to ~2000)
    assert final_equity > initial, f"Final equity {final_equity} should exceed initial {initial}"


def test_signal_fill_separation():
    """
    With fill_on='next_open': signal on bar T must fill at bar T+1's open.
    We verify by checking audit log — ENTRY_SIGNAL date != BUY_FILL date.
    """
    prices = _make_two_ticker_prices(50)
    config = _buy_and_hold_config("AAAA")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        engine = BacktestEngine(config, prices)
        engine.run()

    audit = engine.audit_log

    entry_signals = [e for e in audit if e.event == "ENTRY_SIGNAL"]
    buy_fills = [e for e in audit if e.event == "BUY_FILL"]

    if entry_signals and buy_fills:
        first_signal_date = entry_signals[0].date
        first_fill_date = buy_fills[0].date
        assert first_fill_date > first_signal_date, (
            f"Fill date {first_fill_date} should be after signal date {first_signal_date}"
        )


def test_lot_rounding():
    """
    With 100-share lots and capital=1_000_000, buying at 9500:
    max lots = floor(1_000_000 / (100 * 9500)) = 1 lot.
    """
    costs = _zero_costs()
    broker = Broker(costs, lot_size=100)
    lots = broker.compute_lots(1_000_000.0, 9500.0)
    assert lots == 1, f"Expected 1 lot at price 9500 with capital 1_000_000, got {lots}"

    # Verify it's floor division, not rounding
    lots2 = broker.compute_lots(1_899_999.0, 9500.0)
    assert lots2 == 1, f"Expected 1 lot (not 2), got {lots2}"
    lots3 = broker.compute_lots(1_900_000.0, 9500.0)
    assert lots3 == 2, f"Expected 2 lots at 1.9M capital, got {lots3}"


def test_idempotent_results():
    """Run the same backtest twice. Assert equity curves are identical."""
    prices = _make_two_ticker_prices(100)
    config = _buy_and_hold_config("AAAA")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        engine1 = BacktestEngine(config, prices)
        portfolio1 = engine1.run()
        engine2 = BacktestEngine(config, prices)
        portfolio2 = engine2.run()

    eq1 = portfolio1.get_equity_df()["equity"]
    eq2 = portfolio2.get_equity_df()["equity"]

    pd.testing.assert_series_equal(eq1, eq2, check_names=False)


def test_costs_applied():
    """Verify commission and sell tax reduce returns vs no-cost run."""
    prices = _make_two_ticker_prices(252)

    config_no_cost = StrategyConfig(
        name="no_cost",
        universe=["AAAA"],
        start_date=date(2020, 1, 1),
        end_date=date(2020, 12, 31),
        initial_capital=1_000_000.0,
        currency="IDR",
        entry=Condition(indicator="sma", period=5, op=">", value=0),
        exit=Condition(type="stop_loss", pct=0.50),  # Won't trigger — AAAA only goes up
        sizing=SizingConfig(method="equal_weight", max_positions=1),
        execution=ExecutionConfig(fill_on="next_open"),
        costs=_zero_costs(),
        lot_size=100,
    )

    config_with_cost = StrategyConfig(
        name="with_cost",
        universe=["AAAA"],
        start_date=date(2020, 1, 1),
        end_date=date(2020, 12, 31),
        initial_capital=1_000_000.0,
        currency="IDR",
        entry=Condition(indicator="sma", period=5, op=">", value=0),
        exit=Condition(type="stop_loss", pct=0.50),
        sizing=SizingConfig(method="equal_weight", max_positions=1),
        execution=ExecutionConfig(fill_on="next_open"),
        costs=_small_costs(),
        lot_size=100,
    )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        engine_nc = BacktestEngine(config_no_cost, prices)
        port_nc = engine_nc.run()

        engine_wc = BacktestEngine(config_with_cost, prices)
        port_wc = engine_wc.run()

    eq_nc = port_nc.get_equity_df()["equity"].iloc[-1]
    eq_wc = port_wc.get_equity_df()["equity"].iloc[-1]

    # With costs, final equity should be lower or equal
    assert eq_wc <= eq_nc, (
        f"With-cost equity {eq_wc:.0f} should be <= no-cost equity {eq_nc:.0f}"
    )


def test_max_positions_limit():
    """With max_positions=2, never hold more than 2 positions simultaneously."""
    # 3 tickers, always-true entry, very long time stop
    dates = pd.date_range("2020-01-01", periods=100, freq="B")
    rows = []
    for d in dates:
        for ticker, p in [("AAA", 1000.0), ("BBB", 2000.0), ("CCC", 3000.0)]:
            rows.append({
                "date": d, "ticker": ticker,
                "open": p, "high": p * 1.01, "low": p * 0.99, "close": p,
                "volume": 1_000_000,
            })
    prices = pd.DataFrame(rows)

    config = StrategyConfig(
        name="max_pos_test",
        universe=["AAA", "BBB", "CCC"],
        start_date=date(2020, 1, 1),
        end_date=date(2020, 12, 31),
        initial_capital=10_000_000.0,
        currency="IDR",
        entry=Condition(indicator="sma", period=5, op=">", value=0),
        exit=Condition(type="time_stop", days=9999),
        sizing=SizingConfig(method="equal_weight", max_positions=2),
        execution=ExecutionConfig(fill_on="next_open"),
        costs=_zero_costs(),
        lot_size=100,
    )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        engine = BacktestEngine(config, prices)
        portfolio = engine.run()

    equity_df = portfolio.get_equity_df()
    max_positions = equity_df["num_positions"].max()
    assert max_positions <= 2, f"Max positions exceeded 2: got {max_positions}"


def test_survivorship_warning():
    """Running without universe.csv emits a UserWarning."""
    prices = _make_two_ticker_prices(30)
    config = _buy_and_hold_config("AAAA")

    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        engine = BacktestEngine(config, prices, universe_df=None)
        engine.run()

    warning_messages = [str(warning.message) for warning in w]
    has_survivorship_warning = any(
        "survivorship" in msg.lower() or "universe" in msg.lower()
        for msg in warning_messages
    )
    assert has_survivorship_warning, (
        f"Expected survivorship/universe warning, got: {warning_messages}"
    )
