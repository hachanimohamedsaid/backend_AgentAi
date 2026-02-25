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

    def _fetch_n8n(self) -> Dict[str, Any]:
        """POST to n8n ml-predict webhook and return the raw JSON response."""
        with httpx.Client(timeout=15) as client:
            resp = client.post(N8N_WEBHOOK, json={})
            resp.raise_for_status()
        return resp.json() if isinstance(resp.json(), dict) else {"data": resp.json()}

    def _parse_history_rows(self, raw: Any) -> List[Dict[str, Any]]:
        """
        Parse flat list of transaction rows: [{month, category, total}, ...].
        Used when n8n returns raw rows and Python does the regression.
        """
        rows: List[Dict[str, Any]] = raw if isinstance(raw, list) else []
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

    def _parse_by_category(
        self,
        by_category: Dict[str, Any],
        historical_data: Optional[Dict[str, Any]] = None,
    ) -> List[CategoryPrediction]:
        """
        Parse n8n Code-node output:
          by_category = {
            "Food": {
              "predicted_next_month": 432.5,
              "trend": "increasing" | "decreasing" | "stable",
              "average_monthly": 410.0,
              "last_month_amount": 421.0,
              ...
            }, ...
          }
          historical_data = {
            "Food": [{"month": "2025-09", "amount": 380}, ...], ...
          }
        """
        # n8n trend labels → our schema labels
        trend_map = {"increasing": "up", "decreasing": "down", "stable": "stable"}

        predictions = []
        for category, data in by_category.items():
            try:
                if isinstance(data, dict):
                    # Rich format from n8n Code node
                    predicted = round(float(data.get("predicted_next_month", 0)), 2)
                    raw_trend = data.get("trend", "stable")
                    avg = float(data.get("average_monthly", predicted))
                else:
                    # Simple {category: number} fallback
                    predicted = round(float(data), 2)
                    raw_trend = "stable"
                    avg = predicted
            except (ValueError, TypeError):
                continue

            trend = trend_map.get(raw_trend, "stable")
            # Budget = average monthly × 1.05 (5 % tolerance)
            budget = round(avg * 1.05, 2)

            # Extract history array from historical_data if available
            history: List[float] = []
            if historical_data and category in historical_data:
                for entry in historical_data[category]:
                    try:
                        history.append(float(entry.get("amount", 0)))
                    except (ValueError, TypeError):
                        pass

            predictions.append(CategoryPrediction(
                category=category,
                predicted=predicted,
                budget=budget,
                over_budget=predicted > budget,
                trend=trend,
                history=history or [predicted],
            ))
        return predictions

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
        n8n_response = self._fetch_n8n()

        # n8n may return pre-computed by_category OR raw transaction rows
        n8n_by_category = n8n_response.get("by_category") or {}
        n8n_raw_rows = (
            n8n_response.get("data")
            or n8n_response.get("history")
            or (n8n_response if isinstance(n8n_response, list) else [])
        )

        predictions: List[CategoryPrediction] = []

        if n8n_by_category and isinstance(n8n_by_category, dict):
            # n8n Code node already ran the regression → use its output
            n8n_historical = n8n_response.get("historical_data") or {}
            predictions = self._parse_by_category(n8n_by_category, n8n_historical)

        elif n8n_raw_rows:
            # n8n returned raw rows → Python runs scikit-learn regression
            history = self._parse_history_rows(n8n_raw_rows)
            grouped: Dict[str, List[dict]] = {}
            for row in history:
                grouped.setdefault(row["category"], []).append(row)

            for category, rows in grouped.items():
                rows.sort(key=lambda r: r["month"])
                values = [r["total"] for r in rows]
                predicted = self._predict_next(values)
                recent = values[-3:] if len(values) >= 3 else values
                avg_recent = float(np.mean(recent))
                budget = round(avg_recent * 1.05, 2)
                last = values[-1] if values else 0.0
                trend = "up" if predicted > last * 1.02 else "down" if predicted < last * 0.98 else "stable"
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
