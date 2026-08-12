"""Broker: cost computation and order execution."""
from __future__ import annotations

from typing import Tuple

from .portfolio import Portfolio


def compute_buy_cost(
    shares: int,
    price: float,
    commission_pct: float,
    slippage_bps: float,
) -> Tuple[float, float]:
    """
    Returns (fill_price, commission_cost).
    fill_price = price * (1 + slippage_bps/10000)  — adverse to buyer.
    cost = shares * fill_price * commission_pct
    """
    fill_price = price * (1.0 + slippage_bps / 10_000.0)
    cost = shares * fill_price * commission_pct
    return fill_price, cost


def compute_sell_cost(
    shares: int,
    price: float,
    commission_pct: float,
    sell_tax_pct: float,
    slippage_bps: float,
) -> Tuple[float, float]:
    """
    Returns (fill_price, total_sell_cost).
    fill_price = price * (1 - slippage_bps/10000)  — adverse to seller.
    cost = shares * fill_price * (commission_pct + sell_tax_pct)
    """
    fill_price = price * (1.0 - slippage_bps / 10_000.0)
    cost = shares * fill_price * (commission_pct + sell_tax_pct)
    return fill_price, cost


class Broker:
    def __init__(self, costs_config, lot_size: int) -> None:
        self._costs = costs_config
        self._lot_size = lot_size

    def compute_lots(self, capital: float, price: float) -> int:
        """Max whole lots buyable with capital at price (including buy costs)."""
        if price <= 0:
            return 0
        # cost_per_share = fill_price * (1 + commission_pct) where fill_price = price * (1 + slip)
        fill_price = price * (1.0 + self._costs.slippage_bps / 10_000.0)
        cost_per_share = fill_price * (1.0 + self._costs.commission_buy_pct)
        cost_per_lot = self._lot_size * cost_per_share
        if cost_per_lot <= 0:
            return 0
        return int(capital / cost_per_lot)  # floor division

    def execute_buy(
        self,
        ticker: str,
        lots: int,
        bar_price: float,
        portfolio: Portfolio,
        fill_date,
    ) -> bool:
        """
        Execute a buy order. Reduces lots if insufficient cash.
        Returns False if no lots can be filled.
        """
        if lots <= 0:
            return False

        # Reduce lots to fit available cash
        shares = lots * self._lot_size
        fill_price, cost = compute_buy_cost(
            shares, bar_price,
            self._costs.commission_buy_pct,
            self._costs.slippage_bps,
        )
        total_outlay = shares * fill_price + cost

        while lots > 0 and total_outlay > portfolio.cash:
            lots -= 1
            shares = lots * self._lot_size
            fill_price, cost = compute_buy_cost(
                shares, bar_price,
                self._costs.commission_buy_pct,
                self._costs.slippage_bps,
            )
            total_outlay = shares * fill_price + cost

        if lots == 0:
            return False

        portfolio.open_position(ticker, lots, self._lot_size, fill_price, cost, fill_date)
        return True

    def execute_sell(
        self,
        ticker: str,
        bar_price: float,
        portfolio: Portfolio,
        fill_date,
        reason: str,
    ) -> bool:
        """Execute a sell order for an existing position. Returns False if no position."""
        pos = portfolio.positions.get(ticker)
        if pos is None:
            return False

        fill_price, cost = compute_sell_cost(
            pos.shares, bar_price,
            self._costs.commission_sell_pct,
            self._costs.sell_tax_pct,
            self._costs.slippage_bps,
        )
        portfolio.close_position(ticker, fill_price, cost, fill_date, reason)
        return True
