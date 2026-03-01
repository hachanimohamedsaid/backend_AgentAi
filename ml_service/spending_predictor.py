from __future__ import annotations

from calendar import month_name
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
import numpy as np
from sklearn.linear_model import LinearRegression

from spending_database import Database
from spending_schemas import CategoryPrediction, SpendingPredictionResponse

N8N_WEBHOOK = "https://n8n-production-1e13.up.railway.app/webhook/ml-predict"


class SpendingPredictor:
    """
    Calls n8n to get raw expense rows, groups by category+month,
    then runs scikit-learn LinearRegression to predict next month.

    Linear regression principle:
      X = month index  [0, 1, 2, 3, 4, 5]
      y = total spending that month for the category
      Model: y = a + b·x  (ordinary least squares)
      Prediction: ŷ at x = n  (next month)
    """

    def __init__(self, db: Database) -> None:
        self._db = db

    # ── Public ────────────────────────────────────────────────────────────────

    def get_prediction(self) -> SpendingPredictionResponse:
        cached = self._db.get_latest_prediction()
        if cached:
            return self._doc_to_response(cached)
        return self._compute_and_cache()

    # ── n8n fetch ─────────────────────────────────────────────────────────────

    def _fetch_expenses(self) -> List[Dict[str, Any]]:
        """
        POST to n8n ml-predict webhook.
        n8n returns: { expenses: [{month, category, total}, ...], count: N }
        """
        with httpx.Client(timeout=20) as client:
            resp = client.post(N8N_WEBHOOK, json={})
            resp.raise_for_status()

        raw = resp.json()

        # n8n returns { expenses: [...], count: N }
        if isinstance(raw, dict) and "expenses" in raw:
            rows = raw["expenses"]
        elif isinstance(raw, list):
            rows = raw
        else:
            rows = []

        result = []
        for r in rows:
            try:
                month = str(r.get("month", "")).strip()
                category = str(r.get("category", "")).strip()
                total = float(r.get("total", 0))
                if month and category:
                    result.append({"month": month, "category": category, "total": total})
            except (ValueError, TypeError):
                continue

        return result

    # ── Linear regression (scikit-learn) ──────────────────────────────────────

    @staticmethod
    def _predict_next(values: List[float]) -> float:
        n = len(values)
        if n == 0:
            return 0.0
        if n == 1:
            return round(values[0], 2)

        X = np.arange(n).reshape(-1, 1)
        y = np.array(values)

        model = LinearRegression()
        model.fit(X, y)

        predicted = float(model.predict(np.array([[n]]))[0])
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

    # ── Main computation ──────────────────────────────────────────────────────

    def _compute_and_cache(self) -> SpendingPredictionResponse:
        rows = self._fetch_expenses()

        # Group individual rows by category → sum per month
        grouped: Dict[str, Dict[str, float]] = {}
        for row in rows:
            cat = row["category"]
            month = row["month"]
            grouped.setdefault(cat, {})
            grouped[cat][month] = grouped[cat].get(month, 0.0) + row["total"]

        predictions: List[CategoryPrediction] = []

        for category, month_map in grouped.items():
            sorted_months = sorted(month_map.keys())
            values = [month_map[m] for m in sorted_months]

            predicted = self._predict_next(values)

            # Budget = average of last 3 months × 1.05
            recent = values[-3:] if len(values) >= 3 else values
            budget = round(float(np.mean(recent)) * 1.05, 2)

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

        # Only cache if we have real predictions
        if predictions:
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
