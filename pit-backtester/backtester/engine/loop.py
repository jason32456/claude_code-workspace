"""Main backtest event loop with 1-bar signal/fill gap."""
from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from typing import Optional

import pandas as pd

from ..data.pit_store import AsOfClock, PITDataView
from ..strategy.schema import StrategyConfig
from ..strategy.conditions import evaluate_condition
from .portfolio import Portfolio
from .broker import Broker


@dataclass
class Signal:
    ticker: str
    direction: str   # 'buy' | 'sell'
    reason: str
    signal_date: pd.Timestamp


@dataclass
class AuditEntry:
    date: pd.Timestamp
    event: str   # 'ENTRY_SIGNAL' | 'EXIT_SIGNAL' | 'BUY_FILL' | 'SELL_FILL'
    ticker: str
    detail: str


class BacktestEngine:
    def __init__(
        self,
        config: StrategyConfig,
        prices_df: pd.DataFrame,
        corporate_actions_df: Optional[pd.DataFrame] = None,
        universe_df: Optional[pd.DataFrame] = None,
        benchmark_df: Optional[pd.DataFrame] = None,
    ) -> None:
        self._config = config
        self._prices_df = prices_df
        self._corporate_actions_df = corporate_actions_df
        self._universe_df = universe_df
        self._benchmark_df = benchmark_df

        if universe_df is None:
            warnings.warn(
                "No universe.csv provided. Running without survivorship bias protection.",
                UserWarning,
                stacklevel=2,
            )

        self._clock = AsOfClock()
        self._pit_view = PITDataView(prices_df, self._clock, corporate_actions_df)
        self._portfolio = Portfolio(config.initial_capital)
        self._broker = Broker(config.costs, config.lot_size)
        self._audit_log: list[AuditEntry] = []

        # Filter prices to strategy date range
        start = pd.Timestamp(config.start_date)
        end = pd.Timestamp(config.end_date)
        mask = (prices_df["date"] >= start) & (prices_df["date"] <= end)
        self._trading_dates = sorted(prices_df.loc[mask, "date"].unique())

    def run(self) -> Portfolio:
        """
        Walk dates chronologically.
        For each date T:
          1. clock.advance(T)
          2. Execute pending fills from T-1's signals at T's open
          3. Evaluate exit conditions for open positions
          4. Evaluate entry conditions
          5. Queue signals (fills next bar for next_open mode)
          6. Mark to market at close
        """
        pending_signals: list[Signal] = []

        for date in self._trading_dates:
            date = pd.Timestamp(date)
            self._clock.advance(date)

            # Step 2: Execute pending fills at today's open
            if pending_signals:
                self._execute_fills(pending_signals, date)
            pending_signals = []

            # Build price dict for today's close (for mark-to-market)
            close_prices = self._get_close_prices(date)

            # Step 3: Evaluate exit conditions for open positions
            for ticker in list(self._portfolio.positions.keys()):
                pos = self._portfolio.positions.get(ticker)
                if pos is None:
                    continue
                exit_reason = self._evaluate_exit(ticker, pos)
                if exit_reason:
                    sig = Signal(
                        ticker=ticker,
                        direction="sell",
                        reason=exit_reason,
                        signal_date=date,
                    )
                    pending_signals.append(sig)
                    self._audit_log.append(AuditEntry(
                        date=date,
                        event="EXIT_SIGNAL",
                        ticker=ticker,
                        detail=exit_reason,
                    ))

            # Step 4: Evaluate entry conditions
            available_slots = self._config.sizing.max_positions - len(self._portfolio.positions)
            # Subtract pending sells from occupied count
            pending_sell_tickers = {s.ticker for s in pending_signals if s.direction == "sell"}
            # After pending sells, slots free up — but we signal for next bar anyway
            # Subtract already-pending buys (don't double-signal)
            pending_buy_tickers = {s.ticker for s in pending_signals if s.direction == "buy"}
            already_holding = set(self._portfolio.positions.keys())

            candidate_tickers = self._get_universe_tickers(date)

            for ticker in candidate_tickers:
                # Skip if already holding or already have pending buy/sell
                if ticker in already_holding:
                    continue
                if ticker in pending_buy_tickers:
                    continue
                # Check if we'd exceed max positions (account for pending buys already queued)
                n_open = len(already_holding) - len(pending_sell_tickers)
                n_pending_buys = len(pending_buy_tickers)
                if n_open + n_pending_buys >= self._config.sizing.max_positions:
                    break

                # Evaluate entry condition using PIT data at T
                try:
                    entry_fires = evaluate_condition(
                        self._config.entry,
                        self._pit_view,
                        ticker,
                        position=None,
                    )
                except Exception:
                    entry_fires = False

                if entry_fires:
                    sig = Signal(
                        ticker=ticker,
                        direction="buy",
                        reason="entry_signal",
                        signal_date=date,
                    )
                    pending_signals.append(sig)
                    pending_buy_tickers.add(ticker)
                    self._audit_log.append(AuditEntry(
                        date=date,
                        event="ENTRY_SIGNAL",
                        ticker=ticker,
                        detail="entry condition met",
                    ))

            # Step 6: Mark to market at close
            self._portfolio.mark_to_market(date, close_prices)

        return self._portfolio

    def _execute_fills(self, signals: list[Signal], fill_date: pd.Timestamp) -> None:
        """Execute pending signals at today's open price."""
        # Process sells first to free up cash
        sell_signals = [s for s in signals if s.direction == "sell"]
        buy_signals = [s for s in signals if s.direction == "buy"]

        for sig in sell_signals:
            bar_price = self._get_open_price(sig.ticker, fill_date)
            if bar_price is None:
                continue
            success = self._broker.execute_sell(
                sig.ticker, bar_price, self._portfolio, fill_date, sig.reason
            )
            if success:
                self._audit_log.append(AuditEntry(
                    date=fill_date,
                    event="SELL_FILL",
                    ticker=sig.ticker,
                    detail=f"reason={sig.reason} fill_price={bar_price:.2f}",
                ))

        for sig in buy_signals:
            # Re-check max positions at fill time (sells may have freed slots)
            if len(self._portfolio.positions) >= self._config.sizing.max_positions:
                break
            # Skip if already holding (possible if sell and buy both queued for same ticker)
            if sig.ticker in self._portfolio.positions:
                continue

            bar_price = self._get_open_price(sig.ticker, fill_date)
            if bar_price is None:
                continue

            lots = self._compute_lots_for_signal(bar_price)
            if lots <= 0:
                continue

            success = self._broker.execute_buy(
                sig.ticker, lots, bar_price, self._portfolio, fill_date
            )
            if success:
                self._audit_log.append(AuditEntry(
                    date=fill_date,
                    event="BUY_FILL",
                    ticker=sig.ticker,
                    detail=f"lots={lots} fill_price={bar_price:.2f}",
                ))

    def _compute_lots_for_signal(self, bar_price: float) -> int:
        method = self._config.sizing.method
        if method == "equal_weight":
            available_slots = max(1, self._config.sizing.max_positions - len(self._portfolio.positions))
            capital_per_slot = self._portfolio.cash / available_slots
            return self._broker.compute_lots(capital_per_slot, bar_price)
        elif method == "fixed_fraction":
            fraction = self._config.sizing.fraction or 0.2
            capital = self._portfolio.cash * fraction
            return self._broker.compute_lots(capital, bar_price)
        elif method == "fixed_lots":
            return self._config.sizing.lots or 1
        return self._broker.compute_lots(self._portfolio.cash, bar_price)

    def _evaluate_exit(self, ticker: str, position) -> Optional[str]:
        """Returns exit reason string if exit condition fires, else None."""
        try:
            fires = evaluate_condition(
                self._config.exit,
                self._pit_view,
                ticker,
                position=position,
            )
        except Exception:
            fires = False

        if not fires:
            return None

        # Determine specific reason
        return self._determine_exit_reason(ticker, position)

    def _determine_exit_reason(self, ticker: str, position) -> str:
        """Inspect exit condition sub-clauses to find which one fired."""
        exit_cond = self._config.exit

        # If it's an any/all combinator, check each sub-condition
        if exit_cond.any is not None:
            for sub in exit_cond.any:
                try:
                    if evaluate_condition(sub, self._pit_view, ticker, position):
                        if sub.type:
                            return sub.type
                        if sub.indicator:
                            return f"{sub.indicator}_{sub.op}"
                        return "exit_any"
                except Exception:
                    pass
            return "exit_any"

        if exit_cond.all is not None:
            return "exit_all"

        if exit_cond.type:
            return exit_cond.type

        if exit_cond.indicator:
            return f"{exit_cond.indicator}_{exit_cond.op}"

        return "exit"

    def _get_open_price(self, ticker: str, date: pd.Timestamp) -> Optional[float]:
        bar = self._pit_view.current_bar(ticker)
        if bar is None:
            return None
        price = bar.get("open")
        if price is None or (price != price):  # nan check
            return None
        return float(price)

    def _get_close_prices(self, date: pd.Timestamp) -> dict[str, float]:
        result = {}
        for ticker in self._portfolio.positions:
            bar = self._pit_view.current_bar(ticker)
            if bar is not None:
                close = bar.get("close")
                if close is not None and close == close:
                    result[ticker] = float(close)
        return result

    def _get_universe_tickers(self, date: pd.Timestamp) -> list[str]:
        """Get tickers active in universe on this date."""
        strategy_tickers = set(self._config.universe)
        available = set(self._pit_view.available_tickers())
        candidates = strategy_tickers & available

        if self._universe_df is not None:
            active = set()
            for _, row in self._universe_df.iterrows():
                if row["ticker"] not in candidates:
                    continue
                start = pd.Timestamp(row["start_date"])
                end_val = row.get("end_date")
                end = pd.Timestamp(end_val) if pd.notna(end_val) else pd.Timestamp("2999-12-31")
                if start <= date <= end:
                    active.add(row["ticker"])
            return sorted(active)

        return sorted(candidates)

    @property
    def audit_log(self) -> list[AuditEntry]:
        return self._audit_log
