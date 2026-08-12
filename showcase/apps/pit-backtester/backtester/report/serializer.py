"""Serialize backtest results to JSON and CSV."""
from __future__ import annotations

import json
import os
from typing import Any, Optional

import pandas as pd

from ..engine.portfolio import Portfolio
from ..strategy.schema import StrategyConfig


def _make_serializable(obj: Any) -> Any:
    """Recursively convert non-JSON-serializable types."""
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_serializable(v) for v in obj]
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if isinstance(obj, float):
        if obj != obj or obj == float("inf") or obj == float("-inf"):
            return None
        return obj
    if hasattr(obj, "isoformat"):  # date / datetime
        return obj.isoformat()
    return obj


def serialize_results(
    portfolio: Portfolio,
    metrics: dict,
    config: StrategyConfig,
    benchmark_metrics: Optional[dict] = None,
) -> dict:
    """Returns a JSON-serializable dict with config summary, metrics, equity_curve, trade_log."""
    equity_df = portfolio.get_equity_df().reset_index()

    equity_curve = []
    for _, row in equity_df.iterrows():
        equity_curve.append({
            "date": pd.Timestamp(row["date"]).isoformat(),
            "equity": float(row["equity"]),
            "cash": float(row["cash"]),
            "position_value": float(row["position_value"]),
            "num_positions": int(row["num_positions"]),
        })

    trade_log = []
    for t in portfolio.closed_trades:
        trade_log.append({
            "ticker": t.ticker,
            "entry_date": t.entry_date.isoformat(),
            "exit_date": t.exit_date.isoformat(),
            "entry_price": t.entry_price,
            "exit_price": t.exit_price,
            "shares": t.shares,
            "lots": t.lots,
            "gross_pnl": t.gross_pnl,
            "net_pnl": t.net_pnl,
            "costs": t.costs,
            "return_pct": t.return_pct,
            "holding_days": t.holding_days,
            "exit_reason": t.exit_reason,
        })

    result = {
        "config": {
            "name": config.name,
            "universe": config.universe,
            "start_date": str(config.start_date),
            "end_date": str(config.end_date),
            "initial_capital": config.initial_capital,
            "currency": config.currency,
            "lot_size": config.lot_size,
        },
        "metrics": _make_serializable(metrics),
        "benchmark_metrics": _make_serializable(benchmark_metrics) if benchmark_metrics else None,
        "equity_curve": equity_curve,
        "trade_log": trade_log,
    }
    return result


def save_results(results: dict, output_dir: str, run_id: str) -> None:
    """Save results.json and trade_log.csv to output_dir/run_id/."""
    run_dir = os.path.join(output_dir, run_id)
    os.makedirs(run_dir, exist_ok=True)

    json_path = os.path.join(run_dir, "results.json")
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2)

    # Trade log CSV
    trade_log = results.get("trade_log", [])
    if trade_log:
        df = pd.DataFrame(trade_log)
        csv_path = os.path.join(run_dir, "trade_log.csv")
        df.to_csv(csv_path, index=False)


def trades_to_dataframe(portfolio: Portfolio) -> pd.DataFrame:
    """Convert closed trades to a DataFrame."""
    trades = portfolio.closed_trades
    if not trades:
        return pd.DataFrame()
    rows = []
    for t in trades:
        rows.append({
            "ticker": t.ticker,
            "entry_date": t.entry_date,
            "exit_date": t.exit_date,
            "entry_price": t.entry_price,
            "exit_price": t.exit_price,
            "shares": t.shares,
            "lots": t.lots,
            "gross_pnl": t.gross_pnl,
            "net_pnl": t.net_pnl,
            "costs": t.costs,
            "return_pct": t.return_pct,
            "holding_days": t.holding_days,
            "exit_reason": t.exit_reason,
        })
    return pd.DataFrame(rows)
