"""Portfolio state management: positions, trades, equity tracking."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import pandas as pd


@dataclass
class Position:
    ticker: str
    lots: int
    shares: int
    entry_date: pd.Timestamp
    entry_price: float       # per share, cost basis (fill price)
    high_water_mark: float   # peak price seen since entry, for trailing stop


@dataclass
class Trade:
    ticker: str
    entry_date: pd.Timestamp
    exit_date: pd.Timestamp
    entry_price: float
    exit_price: float
    shares: int
    lots: int
    gross_pnl: float
    net_pnl: float
    costs: float
    return_pct: float
    holding_days: int
    exit_reason: str


@dataclass
class _EquitySnapshot:
    date: pd.Timestamp
    equity: float
    cash: float
    position_value: float
    num_positions: int


class Portfolio:
    def __init__(self, initial_capital: float) -> None:
        self.initial_capital = initial_capital
        self.cash = initial_capital
        self._positions: dict[str, Position] = {}
        self._closed_trades: list[Trade] = []
        self._equity_snapshots: list[_EquitySnapshot] = []

    @property
    def positions(self) -> dict[str, Position]:
        return self._positions

    @property
    def closed_trades(self) -> list[Trade]:
        return self._closed_trades

    def open_position(
        self,
        ticker: str,
        lots: int,
        lot_size: int,
        fill_price: float,
        cost: float,
        fill_date: pd.Timestamp,
    ) -> None:
        shares = lots * lot_size
        outlay = shares * fill_price + cost
        self.cash -= outlay
        self._positions[ticker] = Position(
            ticker=ticker,
            lots=lots,
            shares=shares,
            entry_date=fill_date,
            entry_price=fill_price,
            high_water_mark=fill_price,
        )

    def close_position(
        self,
        ticker: str,
        fill_price: float,
        cost: float,
        fill_date: pd.Timestamp,
        reason: str,
    ) -> Optional[Trade]:
        pos = self._positions.pop(ticker, None)
        if pos is None:
            return None

        proceeds = pos.shares * fill_price - cost
        self.cash += proceeds

        # net_pnl: sell proceeds after sell costs minus capital deployed at entry
        # (entry cost was already deducted from cash at open_position time)
        net_pnl = proceeds - pos.shares * pos.entry_price
        gross_pnl = pos.shares * (fill_price - pos.entry_price)
        capital_deployed = pos.shares * pos.entry_price
        return_pct = net_pnl / capital_deployed if capital_deployed != 0 else 0.0
        holding_days = (fill_date - pos.entry_date).days

        trade = Trade(
            ticker=ticker,
            entry_date=pos.entry_date,
            exit_date=fill_date,
            entry_price=pos.entry_price,
            exit_price=fill_price,
            shares=pos.shares,
            lots=pos.lots,
            gross_pnl=gross_pnl,
            net_pnl=net_pnl,
            costs=cost,
            return_pct=return_pct,
            holding_days=holding_days,
            exit_reason=reason,
        )
        self._closed_trades.append(trade)
        return trade

    def mark_to_market(self, date: pd.Timestamp, prices: dict[str, float]) -> float:
        """Record equity snapshot. Also update high_water_mark for trailing stops."""
        position_value = 0.0
        for ticker, pos in self._positions.items():
            price = prices.get(ticker)
            if price is not None and price == price:  # not nan
                position_value += pos.shares * price
                if price > pos.high_water_mark:
                    pos.high_water_mark = price

        equity = self.cash + position_value
        self._equity_snapshots.append(
            _EquitySnapshot(
                date=date,
                equity=equity,
                cash=self.cash,
                position_value=position_value,
                num_positions=len(self._positions),
            )
        )
        return equity

    def get_equity_df(self) -> pd.DataFrame:
        """Returns DataFrame indexed by date with equity, cash, position_value, num_positions."""
        if not self._equity_snapshots:
            return pd.DataFrame(
                columns=["equity", "cash", "position_value", "num_positions"]
            )
        rows = [
            {
                "date": s.date,
                "equity": s.equity,
                "cash": s.cash,
                "position_value": s.position_value,
                "num_positions": s.num_positions,
            }
            for s in self._equity_snapshots
        ]
        df = pd.DataFrame(rows).set_index("date")
        return df
