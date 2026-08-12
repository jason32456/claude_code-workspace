"""Pydantic v2 models for strategy configuration."""
from __future__ import annotations

from datetime import date
from typing import List, Literal, Optional, Union

from pydantic import BaseModel, model_validator


class IndicatorRef(BaseModel):
    indicator: str
    period: Optional[int] = None
    # macd sub-field: macd/signal/hist; bollinger: upper/lower/middle
    field: Optional[str] = None


class Condition(BaseModel):
    model_config = {"extra": "allow"}

    # Indicator condition
    indicator: Optional[str] = None
    period: Optional[int] = None
    field: Optional[str] = None
    op: Optional[str] = None  # <, <=, >, >=, ==, cross_above, cross_below
    value: Optional[float] = None
    target: Optional[Union[IndicatorRef, float]] = None

    # Exit primitives
    type: Optional[str] = None  # stop_loss, take_profit, trailing_stop, time_stop
    pct: Optional[float] = None
    days: Optional[int] = None

    # Combinators
    all: Optional[List["Condition"]] = None
    any: Optional[List["Condition"]] = None


class SizingConfig(BaseModel):
    method: Literal["equal_weight", "fixed_fraction", "fixed_lots"] = "equal_weight"
    max_positions: int = 5
    fraction: Optional[float] = None
    lots: Optional[int] = None


class ExecutionConfig(BaseModel):
    signal_on: Literal["close"] = "close"
    fill_on: Literal["next_open", "same_close"] = "next_open"


class CostsConfig(BaseModel):
    commission_buy_pct: float = 0.0015
    commission_sell_pct: float = 0.0025
    sell_tax_pct: float = 0.001
    slippage_bps: float = 5.0


class StrategyConfig(BaseModel):
    name: str
    universe: List[str]
    start_date: date
    end_date: date
    initial_capital: float = 100_000_000
    currency: str = "IDR"
    entry: Condition
    exit: Condition
    sizing: SizingConfig = SizingConfig()
    execution: ExecutionConfig = ExecutionConfig()
    costs: CostsConfig = CostsConfig()
    lot_size: int = 100
    risk_free_rate: float = 0.0
