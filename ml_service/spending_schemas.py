from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field


class CategoryPrediction(BaseModel):
    category: str
    predicted: float = Field(..., ge=0)
    budget: float = Field(..., ge=0)
    over_budget: bool
    trend: Literal["up", "down", "stable"]
    history: List[float]


class SpendingPredictionResponse(BaseModel):
    next_month: str          # e.g. "2026-03"
    next_month_label: str    # e.g. "March 2026"
    predictions: List[CategoryPrediction]
    over_budget_count: int
