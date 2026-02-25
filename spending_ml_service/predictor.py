from __future__ import annotations

from calendar import month_name
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
import numpy as np
from sklearn.linear_model import LinearRegression

from database import Database
from schemas import CategoryPrediction, SpendingPredictionResponse

N8N_WEBHOOK = "https://n8n-production-1e13.up.railway.app/webhook/ml-predict"


class SpendingPredictor:
    """
    Fetches the last 6 months of transaction history from n8n, groups
    spending by category, and fits a simple linear regression (scikit-learn)
    to predict next month's spend per category.

    Linear regression principle:
      X = month index  [0, 1, 2, 3, 4, 5]
      y = spending amount that month for the category
      Model: y = a + b·x  (ordinary least squares)
      Prediction: y_hat at x = 6  (next month)
    """

    def __init__(self, db: Database) -> None:
        self._db = db

    # ── Public ────────────────────────────────────────────────────────────────

    def get_prediction(self) -> SpendingPredictionResponse:
        # Return cached prediction if still fresh (< 24 h, TTL handled by MongoDB)
        cached = self._db.get_latest_prediction()
        if cached:
            return self._doc_to_response(cached)

        return self._compute_and_cache()

    # ── n8n fetch ─────────────────────────────────────────────────────────────

    def _fetch_history(self) -> List[Dict[str, Any]]:
        """Call n8n webhook and return list of {month, category, total} rows."""
        with httpx.Client(timeout=15) as client:
            resp = client.get(N8N_WEBHOOK)
            resp.raise_for_status()

        raw = resp.json()
        rows: List[Dict[str, Any]] = (
            raw if isinstance(raw, list)
            else raw.get("history") or raw.get("data") or []
        )

        result = []
        for r in rows:
            try:
                result.append({
                    "month": str(r["month"]),
                    "category": str(r["category"]),
                    "total": float(r["total"]),
                })
            except (KeyError, ValueError, TypeError):
                continue
        return result

    # ── Linear regression ─────────────────────────────────────────────────────

    @staticmethod
    def _predict_next(values: List[float]) -> float:
        """Fit y = a + b·x on the given values and predict the next point."""
        n = len(values)
        if n == 0:
            return 0.0
        if n == 1:
            return round(values[0], 2)

        X = np.arange(n).reshape(-1, 1)  # [[0],[1],[2],...]
        y = np.array(values)

        model = LinearRegression()
        model.fit(X, y)

        next_x = np.array([[n]])
        predicted = float(model.predict(next_x)[0])
        return round(max(0.0, predicted), 2)

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _next_month_key() -> str:
        now = datetime.now(timezone.utc)
        month = now.month % 12 + 1
        year = now.year + (1 if now.month == 12 else 0)
        return f"{year}-{month:02d}"

    @staticmethod
    def _month_key_to_label(key: str) -> str:
        year, month = key.split("-")
        return f"{month_name[int(month)]} {year}"

    # ── Compute ───────────────────────────────────────────────────────────────

    def _compute_and_cache(self) -> SpendingPredictionResponse:
        history = self._fetch_history()

        # Group by category → sorted list of monthly totals
        by_category: Dict[str, List[dict]] = {}
        for row in history:
            cat = row["category"]
            by_category.setdefault(cat, []).append(row)

        predictions: List[CategoryPrediction] = []
        for category, rows in by_category.items():
            rows.sort(key=lambda r: r["month"])
            values = [r["total"] for r in rows]

            predicted = self._predict_next(values)

            # Budget = average of last 3 months × 1.05 (5 % tolerance)
            recent = values[-3:] if len(values) >= 3 else values
            avg_recent = float(np.mean(recent))
            budget = round(avg_recent * 1.05, 2)

            last = values[-1] if values else 0.0
            if predicted > last * 1.02:
                trend = "up"
            elif predicted < last * 0.98:
                trend = "down"
            else:
                trend = "stable"

            predictions.append(CategoryPrediction(
                category=category,
                predicted=predicted,
                budget=budget,
                over_budget=predicted > budget,
                trend=trend,
                history=values,
            ))

        next_month = self._next_month_key()
        next_month_label = self._month_key_to_label(next_month)
        over_budget_count = sum(1 for p in predictions if p.over_budget)

        result = SpendingPredictionResponse(
            next_month=next_month,
            next_month_label=next_month_label,
            predictions=predictions,
            over_budget_count=over_budget_count,
        )

        # Cache in MongoDB
        self._db.save_prediction(result.model_dump())

        return result

    # ── Cache → model ─────────────────────────────────────────────────────────

    @staticmethod
    def _doc_to_response(doc: Dict[str, Any]) -> SpendingPredictionResponse:
        return SpendingPredictionResponse(
            next_month=doc["next_month"],
            next_month_label=doc["next_month_label"],
            predictions=[CategoryPrediction(**p) for p in doc["predictions"]],
            over_budget_count=doc["over_budget_count"],
        )
