"""PIT-safe condition evaluator. All data comes through pit_view which is clock-bound."""
from __future__ import annotations

import math
from typing import Any, Optional

import pandas as pd

from .schema import Condition, IndicatorRef
from .indicators import compute_indicator, _compute_indicator_prev

OPS = {
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "==": lambda a, b: a == b,
}

EXIT_PRIMITIVE_TYPES = {"stop_loss", "take_profit", "trailing_stop", "time_stop"}


def _is_nan(v: Any) -> bool:
    try:
        return math.isnan(v)
    except (TypeError, ValueError):
        return True


def _resolve_rhs(target, period, field, pit_view, ticker) -> float:
    """Resolve the right-hand side of a condition — either a float or an indicator."""
    if target is None:
        return float("nan")
    if isinstance(target, (int, float)):
        return float(target)
    if isinstance(target, IndicatorRef):
        return compute_indicator(
            target.indicator, target.period, target.field, pit_view, ticker
        )
    # Fallback: treat as numeric
    try:
        return float(target)
    except (TypeError, ValueError):
        return float("nan")


def evaluate_condition(
    cond: Condition,
    pit_view,
    ticker: str,
    position=None,
) -> bool:
    """
    PIT-safe condition evaluator. All data comes through pit_view which is clock-bound.
    `position` is the current Position object (needed for exit primitives).
    Returns False on NaN inputs — never raises, never returns True on bad data.
    """

    # --- Combinators ---
    if cond.all is not None:
        return all(evaluate_condition(c, pit_view, ticker, position) for c in cond.all)

    if cond.any is not None:
        return any(evaluate_condition(c, pit_view, ticker, position) for c in cond.any)

    # --- Exit primitives ---
    if cond.type in EXIT_PRIMITIVE_TYPES:
        return _evaluate_exit_primitive(cond, pit_view, ticker, position)

    # --- Standard indicator condition ---
    if cond.indicator is not None:
        return _evaluate_indicator_condition(cond, pit_view, ticker)

    # Unknown condition form
    return False


def _evaluate_exit_primitive(
    cond: Condition,
    pit_view,
    ticker: str,
    position,
) -> bool:
    """Evaluate exit primitives that depend on position state."""
    if position is None:
        return False

    ptype = cond.type

    if ptype == "stop_loss":
        if _is_nan(cond.pct):
            return False
        bar = pit_view.current_bar(ticker)
        if bar is None:
            return False
        current_close = float(bar.get("close", float("nan")))
        if _is_nan(current_close):
            return False
        threshold = position.entry_price * (1.0 - cond.pct)
        return current_close <= threshold

    if ptype == "take_profit":
        if _is_nan(cond.pct):
            return False
        bar = pit_view.current_bar(ticker)
        if bar is None:
            return False
        current_close = float(bar.get("close", float("nan")))
        if _is_nan(current_close):
            return False
        threshold = position.entry_price * (1.0 + cond.pct)
        return current_close >= threshold

    if ptype == "trailing_stop":
        if _is_nan(cond.pct):
            return False
        bar = pit_view.current_bar(ticker)
        if bar is None:
            return False
        current_close = float(bar.get("close", float("nan")))
        if _is_nan(current_close):
            return False
        threshold = position.high_water_mark * (1.0 - cond.pct)
        return current_close <= threshold

    if ptype == "time_stop":
        if cond.days is None:
            return False
        elapsed = (pit_view._clock.now - position.entry_date).days
        return elapsed >= cond.days

    return False


def _evaluate_indicator_condition(cond: Condition, pit_view, ticker: str) -> bool:
    """Evaluate a standard indicator condition (lhs op rhs)."""
    op = cond.op
    if op is None:
        return False

    # Compute LHS
    lhs_curr = compute_indicator(cond.indicator, cond.period, cond.field, pit_view, ticker)
    if _is_nan(lhs_curr):
        return False

    # Cross operators need both current and previous bar
    if op in ("cross_above", "cross_below"):
        return _evaluate_cross(cond, pit_view, ticker, op)

    # Resolve RHS
    if cond.value is not None:
        rhs = float(cond.value)
    elif cond.target is not None:
        rhs = _resolve_rhs(cond.target, None, None, pit_view, ticker)
    else:
        return False

    if _is_nan(rhs):
        return False

    fn = OPS.get(op)
    if fn is None:
        return False

    return bool(fn(lhs_curr, rhs))


def _evaluate_cross(cond: Condition, pit_view, ticker: str, op: str) -> bool:
    """
    Cross detection. Checks current bar and previous bar.
    cross_above: prev_lhs <= prev_rhs AND curr_lhs > curr_rhs
    cross_below: prev_lhs >= prev_rhs AND curr_lhs < curr_rhs
    """
    # Current values
    lhs_curr = compute_indicator(cond.indicator, cond.period, cond.field, pit_view, ticker)
    if _is_nan(lhs_curr):
        return False

    # Resolve current RHS
    if cond.value is not None:
        rhs_curr = float(cond.value)
        rhs_prev = float(cond.value)
    elif cond.target is not None and isinstance(cond.target, IndicatorRef):
        rhs_curr = compute_indicator(
            cond.target.indicator, cond.target.period, cond.target.field, pit_view, ticker
        )
        rhs_prev = _compute_indicator_prev(
            cond.target.indicator, cond.target.period, cond.target.field, pit_view, ticker
        )
    elif cond.value is not None:
        rhs_curr = float(cond.value)
        rhs_prev = float(cond.value)
    else:
        return False

    if _is_nan(rhs_curr) or _is_nan(rhs_prev):
        return False

    # Previous LHS
    lhs_prev = _compute_indicator_prev(cond.indicator, cond.period, cond.field, pit_view, ticker)
    if _is_nan(lhs_prev):
        return False

    if op == "cross_above":
        return lhs_prev <= rhs_prev and lhs_curr > rhs_curr

    if op == "cross_below":
        return lhs_prev >= rhs_prev and lhs_curr < rhs_curr

    return False
