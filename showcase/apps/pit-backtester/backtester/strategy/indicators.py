"""Pure indicator functions. All return a single float (or tuple for multi-output indicators)."""
from __future__ import annotations

import math
from typing import Optional, Tuple

import numpy as np
import pandas as pd


def sma(series: pd.Series, period: int) -> float:
    """Simple moving average of the last `period` values."""
    if len(series) < period:
        return float("nan")
    return float(series.iloc[-period:].mean())


def ema(series: pd.Series, period: int) -> float:
    """Exponential moving average using pandas ewm(span=period, adjust=False)."""
    if len(series) < 1:
        return float("nan")
    result = series.ewm(span=period, adjust=False).mean()
    return float(result.iloc[-1])


def rsi(series: pd.Series, period: int) -> float:
    """RSI using Wilder smoothing (ewm com=period-1, adjust=False)."""
    if len(series) < period + 1:
        return float("nan")
    delta = series.diff()
    gains = delta.clip(lower=0)
    losses = (-delta).clip(lower=0)
    avg_gain = gains.ewm(com=period - 1, adjust=False).mean().iloc[-1]
    avg_loss = losses.ewm(com=period - 1, adjust=False).mean().iloc[-1]
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return float(100.0 - (100.0 / (1.0 + rs)))


def macd(
    series: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> Tuple[float, float, float]:
    """MACD (macd_line, signal_line, histogram)."""
    if len(series) < slow:
        return float("nan"), float("nan"), float("nan")
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return float(macd_line.iloc[-1]), float(signal_line.iloc[-1]), float(histogram.iloc[-1])


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> float:
    """Average True Range using Wilder smoothing."""
    if len(close) < 2:
        return float("nan")
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    tr = tr.dropna()
    if len(tr) < period:
        return float("nan")
    result = tr.ewm(com=period - 1, adjust=False).mean()
    return float(result.iloc[-1])


def bollinger(
    series: pd.Series,
    period: int,
    std_dev: float = 2.0,
) -> Tuple[float, float, float]:
    """Bollinger Bands (upper, middle, lower)."""
    if len(series) < period:
        return float("nan"), float("nan"), float("nan")
    window = series.iloc[-period:]
    middle = float(window.mean())
    std = float(window.std(ddof=1))
    upper = middle + std_dev * std
    lower = middle - std_dev * std
    return upper, middle, lower


def compute_indicator(
    name: str,
    period: Optional[int],
    field: Optional[str],
    pit_view,
    ticker: str,
    lookback: int = 500,
) -> float:
    """Dispatcher: compute named indicator from PIT data view."""
    name = name.lower()

    if name == "sma":
        series = pit_view.history(ticker, "close", lookback)
        return sma(series, period or 20)

    if name == "ema":
        series = pit_view.history(ticker, "close", lookback)
        return ema(series, period or 20)

    if name == "rsi":
        series = pit_view.history(ticker, "close", lookback)
        return rsi(series, period or 14)

    if name == "macd":
        series = pit_view.history(ticker, "close", lookback)
        ml, sl, hist = macd(series)
        sub = (field or "macd").lower()
        if sub == "signal":
            return sl
        if sub in ("hist", "histogram"):
            return hist
        return ml  # default: macd line

    if name == "atr":
        high = pit_view.history(ticker, "high", lookback)
        low = pit_view.history(ticker, "low", lookback)
        close = pit_view.history(ticker, "close", lookback)
        return atr(high, low, close, period or 14)

    if name == "bollinger":
        series = pit_view.history(ticker, "close", lookback)
        upper, middle, lower = bollinger(series, period or 20)
        sub = (field or "middle").lower()
        if sub == "upper":
            return upper
        if sub == "lower":
            return lower
        return middle

    if name in ("close", "open", "high", "low", "volume"):
        bar = pit_view.current_bar(ticker)
        if bar is None:
            return float("nan")
        return float(bar.get(name, float("nan")))

    raise ValueError(f"Unknown indicator: {name!r}")


def _compute_indicator_prev(
    name: str,
    period: Optional[int],
    field: Optional[str],
    pit_view,
    ticker: str,
    lookback: int = 500,
) -> float:
    """Compute indicator on all-but-last bar (for cross detection)."""
    name = name.lower()

    if name == "sma":
        series = pit_view.history(ticker, "close", lookback)
        if len(series) < 2:
            return float("nan")
        return sma(series.iloc[:-1], period or 20)

    if name == "ema":
        series = pit_view.history(ticker, "close", lookback)
        if len(series) < 2:
            return float("nan")
        return ema(series.iloc[:-1], period or 20)

    if name == "rsi":
        series = pit_view.history(ticker, "close", lookback)
        if len(series) < 2:
            return float("nan")
        return rsi(series.iloc[:-1], period or 14)

    if name == "macd":
        series = pit_view.history(ticker, "close", lookback)
        if len(series) < 2:
            return float("nan"), float("nan"), float("nan")
        ml, sl, hist = macd(series.iloc[:-1])
        sub = (field or "macd").lower()
        if sub == "signal":
            return sl
        if sub in ("hist", "histogram"):
            return hist
        return ml

    if name == "atr":
        high = pit_view.history(ticker, "high", lookback)
        low = pit_view.history(ticker, "low", lookback)
        close = pit_view.history(ticker, "close", lookback)
        if len(close) < 2:
            return float("nan")
        return atr(high.iloc[:-1], low.iloc[:-1], close.iloc[:-1], period or 14)

    if name == "bollinger":
        series = pit_view.history(ticker, "close", lookback)
        if len(series) < 2:
            return float("nan")
        upper, middle, lower = bollinger(series.iloc[:-1], period or 20)
        sub = (field or "middle").lower()
        if sub == "upper":
            return upper
        if sub == "lower":
            return lower
        return middle

    # For raw price fields, use second-to-last bar
    if name in ("close", "open", "high", "low", "volume"):
        series = pit_view.history(ticker, name, lookback)
        if len(series) < 2:
            return float("nan")
        return float(series.iloc[-2])

    raise ValueError(f"Unknown indicator: {name!r}")
