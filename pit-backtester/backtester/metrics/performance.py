"""Performance metrics computation from equity curve and trade log."""
from __future__ import annotations

import math
from typing import Optional

import numpy as np
import pandas as pd

from ..engine.portfolio import Portfolio


def compute_metrics(
    portfolio: Portfolio,
    risk_free_rate: float = 0.0,
    trading_days: int = 252,
) -> dict:
    """
    Compute comprehensive performance metrics from equity curve and trade log.
    """
    equity_df = portfolio.get_equity_df()
    trades = portfolio.closed_trades

    if equity_df.empty:
        return _empty_metrics(portfolio.initial_capital)

    equity = equity_df["equity"]
    initial_capital = portfolio.initial_capital
    final_equity = float(equity.iloc[-1])
    total_return = (final_equity - initial_capital) / initial_capital

    n_days = len(equity)
    n_years = n_days / trading_days

    # CAGR
    if n_years > 0 and initial_capital > 0:
        cagr = (final_equity / initial_capital) ** (1.0 / n_years) - 1.0
    else:
        cagr = 0.0

    # Daily returns
    daily_returns = equity.pct_change().dropna()

    # Volatility (annualised)
    vol = float(daily_returns.std()) * math.sqrt(trading_days) if len(daily_returns) > 1 else 0.0

    # Sharpe ratio
    rf_daily = risk_free_rate / trading_days
    excess = daily_returns - rf_daily
    sharpe = (
        float(excess.mean() / excess.std()) * math.sqrt(trading_days)
        if excess.std() > 0
        else 0.0
    )

    # Sortino ratio
    downside = excess[excess < 0]
    downside_std = float(downside.std()) if len(downside) > 1 else 0.0
    sortino = (
        float(excess.mean() / downside_std) * math.sqrt(trading_days)
        if downside_std > 0
        else 0.0
    )

    # Max drawdown
    cummax = equity.cummax()
    drawdown = (equity - cummax) / cummax
    max_drawdown = float(drawdown.min())

    # Drawdown duration
    underwater = drawdown < 0
    max_dd_duration = _max_consecutive_true(underwater)

    # Calmar
    calmar = abs(cagr / max_drawdown) if max_drawdown < 0 else 0.0

    # Exposure (fraction of days with at least one open position)
    exposure = float(equity_df["num_positions"].gt(0).mean()) if "num_positions" in equity_df else 0.0

    # Turnover: sum of all trade values / average equity
    if trades:
        avg_equity = float(equity.mean())
        total_trade_value = sum(t.shares * t.entry_price for t in trades) * 2  # in + out
        turnover = total_trade_value / avg_equity / n_years if avg_equity > 0 and n_years > 0 else 0.0
    else:
        turnover = 0.0

    # Trade statistics
    n_trades = len(trades)
    if n_trades > 0:
        wins = [t for t in trades if t.net_pnl > 0]
        losses = [t for t in trades if t.net_pnl <= 0]
        win_rate = len(wins) / n_trades
        total_win = sum(t.net_pnl for t in wins)
        total_loss = abs(sum(t.net_pnl for t in losses))
        profit_factor = total_win / total_loss if total_loss > 0 else float("inf")
        avg_win = total_win / len(wins) if wins else 0.0
        avg_loss = sum(t.net_pnl for t in losses) / len(losses) if losses else 0.0
        win_loss_ratio = abs(avg_win / avg_loss) if avg_loss != 0 else float("inf")
    else:
        win_rate = 0.0
        profit_factor = 0.0
        avg_win = 0.0
        avg_loss = 0.0
        win_loss_ratio = 0.0

    return {
        "total_return": total_return,
        "cagr": cagr,
        "volatility": vol,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown": max_drawdown,
        "drawdown_duration_days": max_dd_duration,
        "calmar": calmar,
        "exposure": exposure,
        "turnover": turnover,
        "n_trades": n_trades,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "avg_win_idr": avg_win,
        "avg_loss_idr": avg_loss,
        "win_loss_ratio": win_loss_ratio,
        "final_equity": final_equity,
        "initial_capital": initial_capital,
        "n_trading_days": n_days,
    }


def compute_benchmark_metrics(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
    risk_free_rate: float = 0.0,
    trading_days: int = 252,
) -> dict:
    """Compute alpha, beta, tracking_error, information_ratio."""
    aligned = pd.concat(
        [portfolio_returns.rename("port"), benchmark_returns.rename("bench")], axis=1
    ).dropna()

    if len(aligned) < 2:
        return {"alpha": 0.0, "beta": 1.0, "tracking_error": 0.0, "information_ratio": 0.0}

    port = aligned["port"]
    bench = aligned["bench"]

    # Beta via OLS
    covariance = float(port.cov(bench))
    bench_var = float(bench.var())
    beta = covariance / bench_var if bench_var > 0 else 1.0

    # Alpha (Jensen's)
    rf_daily = risk_free_rate / trading_days
    alpha_daily = float(port.mean()) - rf_daily - beta * (float(bench.mean()) - rf_daily)
    alpha = alpha_daily * trading_days

    # Tracking error
    active_returns = port - bench
    tracking_error = float(active_returns.std()) * math.sqrt(trading_days)

    # Information ratio
    information_ratio = (
        float(active_returns.mean()) * trading_days / tracking_error
        if tracking_error > 0
        else 0.0
    )

    return {
        "alpha": alpha,
        "beta": beta,
        "tracking_error": tracking_error,
        "information_ratio": information_ratio,
    }


def _max_consecutive_true(series: pd.Series) -> int:
    """Count the longest consecutive run of True values."""
    max_run = 0
    current_run = 0
    for val in series:
        if val:
            current_run += 1
            max_run = max(max_run, current_run)
        else:
            current_run = 0
    return max_run


def _empty_metrics(initial_capital: float) -> dict:
    return {
        "total_return": 0.0,
        "cagr": 0.0,
        "volatility": 0.0,
        "sharpe": 0.0,
        "sortino": 0.0,
        "max_drawdown": 0.0,
        "drawdown_duration_days": 0,
        "calmar": 0.0,
        "exposure": 0.0,
        "turnover": 0.0,
        "n_trades": 0,
        "win_rate": 0.0,
        "profit_factor": 0.0,
        "avg_win_idr": 0.0,
        "avg_loss_idr": 0.0,
        "win_loss_ratio": 0.0,
        "final_equity": initial_capital,
        "initial_capital": initial_capital,
        "n_trading_days": 0,
    }
