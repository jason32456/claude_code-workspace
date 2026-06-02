"""CSV loaders with validation for backtester input data."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple

import numpy as np
import pandas as pd


VALID_ACTION_TYPES = {"split", "reverse_split", "cash_dividend", "stock_dividend", "bonus", "rights"}


@dataclass
class ValidationResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0


def _parse_dates(df: pd.DataFrame, date_cols: list[str]) -> pd.DataFrame:
    for col in date_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col])
    return df


def load_prices(path: str) -> Tuple[pd.DataFrame, ValidationResult]:
    """Load and validate a prices CSV file."""
    vr = ValidationResult()

    try:
        df = pd.read_csv(path)
    except Exception as e:
        vr.errors.append(f"Cannot read file: {e}")
        return pd.DataFrame(), vr

    required_cols = {"date", "ticker", "open", "high", "low", "close", "volume"}
    missing = required_cols - set(df.columns)
    if missing:
        vr.errors.append(f"Missing required columns: {sorted(missing)}")
        return df, vr

    df = _parse_dates(df, ["date"])

    # Check for duplicate (date, ticker)
    dupes = df.duplicated(subset=["date", "ticker"])
    if dupes.any():
        n = dupes.sum()
        vr.errors.append(f"Found {n} duplicate (date, ticker) rows")

    # OHLC sanity
    price_cols = ["open", "high", "low", "close"]
    for col in price_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["volume"] = pd.to_numeric(df["volume"], errors="coerce")

    low_violation = df["low"] > df[["open", "close"]].min(axis=1)
    if low_violation.any():
        n = low_violation.sum()
        vr.errors.append(f"OHLC sanity: {n} rows where low > min(open, close)")

    high_violation = df["high"] < df[["open", "close"]].max(axis=1)
    if high_violation.any():
        n = high_violation.sum()
        vr.errors.append(f"OHLC sanity: {n} rows where high < max(open, close)")

    # Non-negative volume
    neg_vol = df["volume"] < 0
    if neg_vol.any():
        vr.errors.append(f"Found {neg_vol.sum()} rows with negative volume")

    # Sort by (date, ticker)
    df = df.sort_values(["date", "ticker"]).reset_index(drop=True)

    # Monotonic dates per ticker and gap detection
    for ticker, grp in df.groupby("ticker"):
        dates = grp["date"].sort_values()
        if len(dates) < 2:
            continue
        diffs = dates.diff().dropna()
        # Gap detection: warn if gap > 14 calendar days
        large_gaps = diffs[diffs > pd.Timedelta(days=14)]
        for idx, gap in large_gaps.items():
            gap_date = dates.loc[idx]
            vr.warnings.append(
                f"Large gap of {gap.days} days before {gap_date.date()} for ticker {ticker}"
            )

    return df, vr


def load_corporate_actions(path: str) -> Tuple[pd.DataFrame, ValidationResult]:
    """Load and validate a corporate actions CSV file."""
    vr = ValidationResult()

    try:
        df = pd.read_csv(path)
    except Exception as e:
        vr.errors.append(f"Cannot read file: {e}")
        return pd.DataFrame(), vr

    required_cols = {"ticker", "type", "ex_date", "announce_date"}
    missing = required_cols - set(df.columns)
    if missing:
        vr.errors.append(f"Missing required columns: {sorted(missing)}")
        return df, vr

    df = _parse_dates(df, ["ex_date", "announce_date"])

    invalid_types = df[~df["type"].isin(VALID_ACTION_TYPES)]
    if not invalid_types.empty:
        bad = invalid_types["type"].unique().tolist()
        vr.errors.append(f"Invalid action types: {bad}. Must be one of {sorted(VALID_ACTION_TYPES)}")

    return df, vr


def load_universe(path: str) -> Tuple[pd.DataFrame, ValidationResult]:
    """Load and validate a universe CSV file."""
    vr = ValidationResult()

    try:
        df = pd.read_csv(path)
    except Exception as e:
        vr.errors.append(f"Cannot read file: {e}")
        return pd.DataFrame(), vr

    required_cols = {"ticker", "start_date"}
    missing = required_cols - set(df.columns)
    if missing:
        vr.errors.append(f"Missing required columns: {sorted(missing)}")
        return df, vr

    df = _parse_dates(df, ["start_date"])
    if "end_date" in df.columns:
        df["end_date"] = pd.to_datetime(df["end_date"], errors="coerce")

    return df, vr


def load_benchmark(path: str) -> Tuple[pd.DataFrame, ValidationResult]:
    """Load and validate a benchmark CSV file."""
    vr = ValidationResult()

    try:
        df = pd.read_csv(path)
    except Exception as e:
        vr.errors.append(f"Cannot read file: {e}")
        return pd.DataFrame(), vr

    required_cols = {"date", "close"}
    missing = required_cols - set(df.columns)
    if missing:
        vr.errors.append(f"Missing required columns: {sorted(missing)}")
        return df, vr

    df = _parse_dates(df, ["date"])
    df = df.sort_values("date").reset_index(drop=True)

    return df, vr
