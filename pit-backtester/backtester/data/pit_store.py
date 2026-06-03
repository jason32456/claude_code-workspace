"""Point-in-Time data store. Future bars are structurally absent."""
from __future__ import annotations

from typing import Optional

import pandas as pd


class AsOfClock:
    """Single simulated time authority. Passed by reference to all PIT components."""

    def __init__(self) -> None:
        self._now: Optional[pd.Timestamp] = None

    def advance(self, dt: pd.Timestamp) -> None:
        dt = pd.Timestamp(dt)
        if self._now is not None and dt < self._now:
            raise ValueError(
                f"Clock can only advance forward. Attempted to go from {self._now} to {dt}"
            )
        self._now = dt

    @property
    def now(self) -> pd.Timestamp:
        if self._now is None:
            raise RuntimeError("Clock has not been advanced yet")
        return self._now


class PITDataView:
    """
    Point-in-time data view. Future bars are structurally ABSENT.
    This makes look-ahead bias IMPOSSIBLE, not just discouraged.

    Internally we keep a per-ticker dict of DataFrames sorted by date for O(log n) slicing.
    """

    def __init__(
        self,
        prices: pd.DataFrame,
        clock: AsOfClock,
        corporate_actions: Optional[pd.DataFrame] = None,
    ) -> None:
        self._clock = clock
        self._corporate_actions = corporate_actions

        # Build per-ticker index sorted by date
        prices = prices.copy()
        prices["date"] = pd.to_datetime(prices["date"])
        prices = prices.sort_values(["date", "ticker"]).reset_index(drop=True)

        self._by_ticker: dict[str, pd.DataFrame] = {}
        for ticker, grp in prices.groupby("ticker", sort=False):
            grp = grp.set_index("date").sort_index()
            self._by_ticker[ticker] = grp

        # Also store as MultiIndex for cross-sectional access
        self._all: pd.DataFrame = prices.set_index(["date", "ticker"]).sort_index()

    def history(self, ticker: str, field: str, lookback: int) -> pd.Series:
        """
        Returns at most `lookback` bars with date <= clock.now.
        Future bars are absent from the returned object entirely.
        """
        df = self._by_ticker.get(ticker)
        if df is None:
            return pd.Series(dtype=float)
        # Filter by date index — never by integer position
        past = df.loc[df.index <= self._clock.now, field]
        return past.iloc[-lookback:] if len(past) > lookback else past

    def current_bar(self, ticker: str) -> Optional[pd.Series]:
        """Returns the bar at exactly clock.now, or None."""
        df = self._by_ticker.get(ticker)
        if df is None:
            return None
        now = self._clock.now
        if now not in df.index:
            return None
        return df.loc[now]

    def available_tickers(self) -> list[str]:
        """All tickers with at least one bar <= clock.now."""
        now = self._clock.now
        result = []
        for ticker, df in self._by_ticker.items():
            if df.index.min() <= now:
                result.append(ticker)
        return result

    def get_adjustment_factor(
        self,
        ticker: str,
        as_of: pd.Timestamp,
        for_date: pd.Timestamp,
    ) -> float:
        """
        Forward-only PIT adjustment factor.
        Only actions with announce_date <= as_of AND ex_date in (for_date, as_of].
        Returns multiplicative factor (1.0 = no adjustment).
        """
        if self._corporate_actions is None:
            return 1.0

        ca = self._corporate_actions
        mask = (
            (ca["ticker"] == ticker)
            & (ca["announce_date"] <= as_of)
            & (ca["ex_date"] > for_date)
            & (ca["ex_date"] <= as_of)
        )
        actions = ca[mask]
        factor = 1.0
        for _, row in actions.iterrows():
            action_type = row["type"]
            if action_type == "split":
                ratio = float(row.get("ratio", 1.0))
                factor *= ratio
            elif action_type == "reverse_split":
                ratio = float(row.get("ratio", 1.0))
                factor /= ratio
        return factor
