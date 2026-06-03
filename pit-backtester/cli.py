#!/usr/bin/env python3
"""CLI entrypoint for the PIT backtester."""
from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime

import click
import pandas as pd
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from backtester.data.loader import (
    load_prices, load_corporate_actions, load_universe, load_benchmark, ValidationResult
)
from backtester.data.pit_store import AsOfClock, PITDataView
from backtester.engine.loop import BacktestEngine
from backtester.metrics.performance import compute_metrics, compute_benchmark_metrics
from backtester.report.serializer import serialize_results, save_results, trades_to_dataframe
from backtester.strategy.schema import StrategyConfig

console = Console()


def _show_validation(name: str, vr: ValidationResult) -> None:
    if vr.has_errors:
        for err in vr.errors:
            console.print(f"  [red]ERROR[/red] {name}: {err}")
    for warn in vr.warnings:
        console.print(f"  [yellow]WARN[/yellow]  {name}: {warn}")
    if not vr.has_errors and not vr.warnings:
        console.print(f"  [green]OK[/green]    {name}")


def _fmt_metric(key: str, value) -> str:
    if value is None:
        return "N/A"
    pct_keys = {"total_return", "cagr", "volatility", "win_rate", "exposure",
                "max_drawdown", "alpha", "tracking_error", "information_ratio"}
    idr_keys = {"avg_win_idr", "avg_loss_idr", "final_equity", "initial_capital"}
    if key in pct_keys:
        return f"{value:.2%}"
    if key in idr_keys:
        return f"{value:,.0f}"
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)


def _metrics_table(metrics: dict, benchmark_metrics: dict = None) -> Table:
    table = Table(title="Performance Metrics", show_header=True, header_style="bold cyan")
    table.add_column("Metric", style="bold")
    table.add_column("Value", justify="right")

    metric_labels = [
        ("total_return", "Total Return"),
        ("cagr", "CAGR"),
        ("volatility", "Volatility (ann.)"),
        ("sharpe", "Sharpe Ratio"),
        ("sortino", "Sortino Ratio"),
        ("calmar", "Calmar Ratio"),
        ("max_drawdown", "Max Drawdown"),
        ("drawdown_duration_days", "Max DD Duration (days)"),
        ("exposure", "Exposure"),
        ("turnover", "Annual Turnover"),
        ("n_trades", "Number of Trades"),
        ("win_rate", "Win Rate"),
        ("profit_factor", "Profit Factor"),
        ("avg_win_idr", "Avg Win"),
        ("avg_loss_idr", "Avg Loss"),
        ("win_loss_ratio", "Win/Loss Ratio"),
        ("final_equity", "Final Equity"),
        ("n_trading_days", "Trading Days"),
    ]

    for key, label in metric_labels:
        val = metrics.get(key)
        formatted = _fmt_metric(key, val)
        # Color based on value
        if key in ("total_return", "cagr", "sharpe", "sortino", "calmar"):
            color = "green" if isinstance(val, float) and val > 0 else "red"
            formatted = f"[{color}]{formatted}[/{color}]"
        elif key == "max_drawdown":
            color = "red" if isinstance(val, float) and val < 0 else "green"
            formatted = f"[{color}]{formatted}[/{color}]"
        table.add_row(label, formatted)

    if benchmark_metrics:
        table.add_section()
        bm_labels = [
            ("alpha", "Alpha (ann.)"),
            ("beta", "Beta"),
            ("tracking_error", "Tracking Error"),
            ("information_ratio", "Information Ratio"),
        ]
        for key, label in bm_labels:
            val = benchmark_metrics.get(key)
            formatted = _fmt_metric(key, val)
            table.add_row(f"[dim]{label}[/dim]", f"[dim]{formatted}[/dim]")

    return table


def _trades_table(trades: list, top_n: int = 20) -> Table:
    table = Table(title=f"Top {top_n} Trades (by |Net P&L|)", show_header=True, header_style="bold cyan")
    table.add_column("Ticker", style="bold")
    table.add_column("Entry Date")
    table.add_column("Exit Date")
    table.add_column("Entry Price", justify="right")
    table.add_column("Exit Price", justify="right")
    table.add_column("Lots", justify="right")
    table.add_column("Net P&L", justify="right")
    table.add_column("Return", justify="right")
    table.add_column("Days", justify="right")
    table.add_column("Reason")

    sorted_trades = sorted(trades, key=lambda t: abs(t.net_pnl), reverse=True)
    for t in sorted_trades[:top_n]:
        color = "green" if t.net_pnl > 0 else "red"
        table.add_row(
            t.ticker,
            str(t.entry_date.date()),
            str(t.exit_date.date()),
            f"{t.entry_price:,.0f}",
            f"{t.exit_price:,.0f}",
            str(t.lots),
            f"[{color}]{t.net_pnl:,.0f}[/{color}]",
            f"[{color}]{t.return_pct:.2%}[/{color}]",
            str(t.holding_days),
            t.exit_reason,
        )
    return table


@click.group()
def cli():
    """PIT Backtester — Point-in-Time Strategy Backtesting Engine."""
    pass


@cli.command()
@click.option("--strategy", required=True, type=click.Path(exists=True), help="Path to strategy JSON file.")
@click.option("--prices", required=True, type=click.Path(exists=True), help="Path to prices CSV.")
@click.option("--corporate-actions", type=click.Path(exists=True), default=None, help="Path to corporate actions CSV.")
@click.option("--universe", type=click.Path(exists=True), default=None, help="Path to universe CSV.")
@click.option("--benchmark", type=click.Path(exists=True), default=None, help="Path to benchmark CSV.")
@click.option("--output-dir", default="./runs", help="Directory to save run results.")
def run(strategy, prices, corporate_actions, universe, benchmark, output_dir):
    """Run a backtest."""
    console.print(Panel("[bold cyan]PIT Backtester — Running Backtest[/bold cyan]"))

    # Step 1: Load and validate data
    console.print("\n[bold]Loading and validating data...[/bold]")

    prices_df, prices_vr = load_prices(prices)
    _show_validation("prices.csv", prices_vr)
    if prices_vr.has_errors:
        console.print("[red]Aborting: prices validation failed.[/red]")
        sys.exit(1)

    ca_df = None
    if corporate_actions:
        ca_df, ca_vr = load_corporate_actions(corporate_actions)
        _show_validation("corporate_actions.csv", ca_vr)
        if ca_vr.has_errors:
            console.print("[red]Aborting: corporate actions validation failed.[/red]")
            sys.exit(1)

    universe_df = None
    if universe:
        universe_df, uni_vr = load_universe(universe)
        _show_validation("universe.csv", uni_vr)
        if uni_vr.has_errors:
            console.print("[red]Aborting: universe validation failed.[/red]")
            sys.exit(1)

    benchmark_df = None
    benchmark_returns = None
    if benchmark:
        benchmark_df, bm_vr = load_benchmark(benchmark)
        _show_validation("benchmark.csv", bm_vr)
        if bm_vr.has_errors:
            console.print("[red]Aborting: benchmark validation failed.[/red]")
            sys.exit(1)
        benchmark_df = benchmark_df.set_index("date")
        benchmark_returns = benchmark_df["close"].pct_change().dropna()

    # Step 2: Parse strategy JSON
    console.print("\n[bold]Parsing strategy config...[/bold]")
    with open(strategy) as f:
        strategy_dict = json.load(f)
    config = StrategyConfig(**strategy_dict)
    console.print(f"  Strategy: [cyan]{config.name}[/cyan]")
    console.print(f"  Universe: {config.universe}")
    console.print(f"  Period: {config.start_date} → {config.end_date}")
    console.print(f"  Capital: {config.initial_capital:,.0f} {config.currency}")

    # Step 3: Build engine and run
    console.print("\n[bold]Running backtest...[/bold]")
    import warnings
    with warnings.catch_warnings(record=True) as caught_warnings:
        warnings.simplefilter("always")
        engine = BacktestEngine(config, prices_df, ca_df, universe_df, benchmark_df)
        portfolio = engine.run()

    for w in caught_warnings:
        console.print(f"  [yellow]WARN[/yellow] {w.message}")

    # Step 4: Compute metrics
    metrics = compute_metrics(portfolio, config.risk_free_rate)
    benchmark_metrics = None
    if benchmark_returns is not None:
        equity_df = portfolio.get_equity_df()
        portfolio_returns = equity_df["equity"].pct_change().dropna()
        benchmark_metrics = compute_benchmark_metrics(
            portfolio_returns, benchmark_returns, config.risk_free_rate
        )

    # Step 5: Display metrics table
    console.print()
    console.print(_metrics_table(metrics, benchmark_metrics))

    # Step 6: Display top trades
    trades = portfolio.closed_trades
    if trades:
        console.print()
        console.print(_trades_table(trades, top_n=10))
    else:
        console.print("\n[yellow]No closed trades in the period.[/yellow]")

    # Step 7: Save results
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + config.name.replace(" ", "_")[:20]
    results = serialize_results(portfolio, metrics, config, benchmark_metrics)
    save_results(results, output_dir, run_id)
    console.print(f"\n[green]Results saved to: {os.path.join(output_dir, run_id)}[/green]")


@cli.command()
@click.argument("run_id")
@click.option("--output-dir", default="./runs", help="Directory containing run results.")
def show(run_id, output_dir):
    """Show results of a saved run."""
    run_dir = os.path.join(output_dir, run_id)
    results_path = os.path.join(run_dir, "results.json")

    if not os.path.exists(results_path):
        console.print(f"[red]Run not found: {results_path}[/red]")
        sys.exit(1)

    with open(results_path) as f:
        results = json.load(f)

    config_info = results.get("config", {})
    console.print(Panel(
        f"[bold cyan]Backtest Results: {config_info.get('name', run_id)}[/bold cyan]\n"
        f"Period: {config_info.get('start_date')} → {config_info.get('end_date')}\n"
        f"Capital: {config_info.get('initial_capital', 0):,.0f} {config_info.get('currency', '')}"
    ))

    metrics = results.get("metrics", {})
    if metrics:
        table = Table(title="Performance Metrics", header_style="bold cyan")
        table.add_column("Metric", style="bold")
        table.add_column("Value", justify="right")
        for k, v in metrics.items():
            if v is not None:
                table.add_row(k, _fmt_metric(k, v))
        console.print(table)

    trade_log = results.get("trade_log", [])
    if trade_log:
        console.print(f"\n[cyan]Total trades: {len(trade_log)}[/cyan]")


if __name__ == "__main__":
    cli()
