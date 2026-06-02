#!/usr/bin/env python3
"""Generate realistic IDX-like sample data for the pit-backtester."""
from __future__ import annotations

import json
import os
import numpy as np
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SCRIPT_DIR, "..", "sample_data")


def generate_correlated_gbm(
    n_days: int,
    mus: list[float],
    sigmas: list[float],
    corr_matrix: np.ndarray,
    seed: int = 42,
) -> np.ndarray:
    """Generate correlated GBM returns. Returns shape (n_days, n_assets)."""
    rng = np.random.default_rng(seed)
    n_assets = len(mus)
    # Cholesky decomposition for correlated normals
    L = np.linalg.cholesky(corr_matrix)
    z = rng.standard_normal((n_days, n_assets))
    correlated_z = z @ L.T
    # Scale to per-asset sigma
    returns = np.zeros_like(correlated_z)
    for i in range(n_assets):
        returns[:, i] = mus[i] + sigmas[i] * correlated_z[:, i]
    return returns


def make_prices_csv(out_path: str) -> None:
    """Generate prices.csv for BBCA, BBRI, TLKM from 2019-01-02 to 2023-12-29."""
    tickers = ["BBCA", "BBRI", "TLKM"]
    starts = {"BBCA": 8000.0, "BBRI": 4500.0, "TLKM": 3800.0}
    # Annual parameters
    annual_mus = {"BBCA": 0.08, "BBRI": 0.10, "TLKM": 0.05}
    annual_sigmas = {"BBCA": 0.18, "BBRI": 0.22, "TLKM": 0.16}

    # Trading dates
    all_dates = pd.bdate_range("2019-01-02", "2023-12-29")
    n = len(all_dates)

    # Daily parameters
    mus = [annual_mus[t] / 252 for t in tickers]
    sigmas = [annual_sigmas[t] / np.sqrt(252) for t in tickers]

    # Correlation matrix (~0.6 between all pairs)
    corr = np.array([
        [1.0, 0.6, 0.6],
        [0.6, 1.0, 0.6],
        [0.6, 0.6, 1.0],
    ])

    returns = generate_correlated_gbm(n, mus, sigmas, corr, seed=42)

    rng = np.random.default_rng(99)
    rows = []
    for j, ticker in enumerate(tickers):
        price = starts[ticker]
        for i in range(n):
            r = returns[i, j]
            prev_close = price
            close = prev_close * np.exp(r)

            noise = rng.normal(0, sigmas[j] * 0.3)
            open_price = prev_close * np.exp(r * 0.3 + noise)

            abs_noise = abs(rng.normal(0, sigmas[j]))
            high = max(open_price, close) * np.exp(abs_noise)
            low = min(open_price, close) * np.exp(-abs_noise)

            # Round to nearest 10 (IDX tick size)
            close_r = round(close / 10) * 10
            open_r = round(open_price / 10) * 10
            high_r = round(high / 10) * 10
            low_r = round(low / 10) * 10

            # OHLC sanity fix
            low_r = min(low_r, open_r, close_r)
            high_r = max(high_r, open_r, close_r)
            if low_r <= 0:
                low_r = 10

            # Volume: log-normal around 10M shares
            volume = int(np.exp(rng.normal(np.log(10_000_000), 0.5)))
            volume = max(volume, 100)

            rows.append({
                "date": all_dates[i].date().isoformat(),
                "ticker": ticker,
                "open": open_r,
                "high": high_r,
                "low": low_r,
                "close": close_r,
                "volume": volume,
            })

            price = close  # use unrounded for next day's calc

    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)
    print(f"Written {len(df)} rows to {out_path}")


def make_corporate_actions_csv(out_path: str) -> None:
    rows = [
        {
            "ticker": "BBCA",
            "type": "cash_dividend",
            "ex_date": "2021-05-03",
            "announce_date": "2021-04-15",
            "amount": 150,
            "ratio": "",
        },
        {
            "ticker": "BBRI",
            "type": "split",
            "ex_date": "2021-12-10",
            "announce_date": "2021-11-25",
            "amount": "",
            "ratio": 2.0,
        },
        {
            "ticker": "TLKM",
            "type": "cash_dividend",
            "ex_date": "2022-06-01",
            "announce_date": "2022-05-10",
            "amount": 200,
            "ratio": "",
        },
    ]
    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)
    print(f"Written {len(df)} rows to {out_path}")


def make_universe_csv(out_path: str) -> None:
    rows = [
        {"ticker": "BBCA", "start_date": "2019-01-02", "end_date": ""},
        {"ticker": "BBRI", "start_date": "2019-01-02", "end_date": ""},
        {"ticker": "TLKM", "start_date": "2019-01-02", "end_date": ""},
    ]
    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)
    print(f"Written {len(df)} rows to {out_path}")


def make_golden_cross_json(out_path: str) -> None:
    config = {
        "name": "Golden Cross + RSI Filter",
        "universe": ["BBCA", "BBRI", "TLKM"],
        "start_date": "2020-01-01",
        "end_date": "2023-12-31",
        "initial_capital": 100000000,
        "currency": "IDR",
        "entry": {
            "all": [
                {
                    "indicator": "sma",
                    "period": 50,
                    "op": "cross_above",
                    "target": {"indicator": "sma", "period": 200}
                },
                {
                    "indicator": "rsi",
                    "period": 14,
                    "op": "<",
                    "value": 70
                }
            ]
        },
        "exit": {
            "any": [
                {
                    "indicator": "sma",
                    "period": 50,
                    "op": "cross_below",
                    "target": {"indicator": "sma", "period": 200}
                },
                {"type": "stop_loss", "pct": 0.08},
                {"type": "take_profit", "pct": 0.25}
            ]
        },
        "sizing": {"method": "equal_weight", "max_positions": 3},
        "execution": {"signal_on": "close", "fill_on": "next_open"},
        "costs": {
            "commission_buy_pct": 0.0015,
            "commission_sell_pct": 0.0025,
            "sell_tax_pct": 0.001,
            "slippage_bps": 5
        },
        "lot_size": 100
    }
    with open(out_path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"Written {out_path}")


def make_buy_and_hold_json(out_path: str) -> None:
    config = {
        "name": "Buy and Hold BBCA",
        "universe": ["BBCA"],
        "start_date": "2020-01-01",
        "end_date": "2023-12-31",
        "initial_capital": 100000000,
        "currency": "IDR",
        "entry": {
            "indicator": "sma",
            "period": 5,
            "op": ">",
            "value": 0
        },
        "exit": {
            "type": "time_stop",
            "days": 999
        },
        "sizing": {"method": "equal_weight", "max_positions": 1},
        "execution": {"signal_on": "close", "fill_on": "next_open"},
        "costs": {
            "commission_buy_pct": 0.0015,
            "commission_sell_pct": 0.0025,
            "sell_tax_pct": 0.001,
            "slippage_bps": 5
        },
        "lot_size": 100
    }
    with open(out_path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"Written {out_path}")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.join(OUT_DIR, "strategies"), exist_ok=True)

    make_prices_csv(os.path.join(OUT_DIR, "prices.csv"))
    make_corporate_actions_csv(os.path.join(OUT_DIR, "corporate_actions.csv"))
    make_universe_csv(os.path.join(OUT_DIR, "universe.csv"))
    make_golden_cross_json(os.path.join(OUT_DIR, "strategies", "golden_cross.json"))
    make_buy_and_hold_json(os.path.join(OUT_DIR, "strategies", "buy_and_hold.json"))

    print("\nSample data generation complete.")
