from __future__ import annotations

import os
import pickle
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

from database import Database
from schemas import Context, Suggestion


@dataclass
class SuggestionEngine:
    database: Optional[Database] = None

    def __post_init__(self) -> None:
        self.model = None
        model_path = os.getenv("ML_MODEL_PATH", "model.pkl")
        if os.path.exists(model_path):
            try:
                with open(model_path, "rb") as f:
                    self.model = pickle.load(f)
            except Exception:
                self.model = None

    def _to_features(self, context: Context) -> np.ndarray:
        hh, mm = context.time.split(":")
        hour = int(hh)
        minute = int(mm)

        location_home = 1 if context.location == "home" else 0
        location_outside = 1 if context.location == "outside" else 0
        location_campus = 1 if context.location == "campus" else 0

        weather_sunny = 1 if context.weather == "sunny" else 0
        weather_cloudy = 1 if context.weather == "cloudy" else 0
        weather_rain = 1 if context.weather == "rain" else 0

        return np.array(
            [
                hour,
                minute,
                context.focusHours,
                context.meetings,
                location_home,
                location_outside,
                location_campus,
                weather_sunny,
                weather_cloudy,
                weather_rain,
            ],
            dtype=float,
        ).reshape(1, -1)

    def _rule_based(self, context: Context) -> List[Suggestion]:
        hh, _ = context.time.split(":")
        hour = int(hh)
        suggestions: List[Suggestion] = []

        if 6 <= hour <= 11 and context.location == "home":
            suggestions.append(
                Suggestion(
                    message="Start a focused work session with your usual routine.",
                    confidence=0.7,
                )
            )

        if context.meetings >= 3:
            suggestions.append(
                Suggestion(
                    message="You have many meetings today, plan regular short breaks.",
                    confidence=0.75,
                )
            )

        if hour >= 21 or hour < 6:
            suggestions.append(
                Suggestion(
                    message="It's late. Consider winding down and getting some rest.",
                    confidence=0.8,
                )
            )

        if not suggestions:
            suggestions.append(
                Suggestion(
                    message="Stay hydrated and take a short stretch break.",
                    confidence=0.6,
                )
            )

        return suggestions

    def generate_suggestions(self, context: Context) -> List[Suggestion]:
        ctx_dict = context.model_dump()

        if self.database:
            self.database.log_context(ctx_dict)

        suggestions = self._rule_based(context)

        if self.model is not None:
            try:
                features = self._to_features(context)
                proba = getattr(self.model, "predict_proba", None)
                if callable(proba):
                    p = float(proba(features)[0][1])
                    p = max(0.0, min(1.0, p))
                    for s in suggestions:
                        s.confidence = max(s.confidence, p)
            except Exception:
                pass

        if self.database:
            self.database.log_suggestions(ctx_dict, [s.model_dump() for s in suggestions])

        if not suggestions:
            return [
                Suggestion(
                    message="Keep going, you're doing great.",
                    confidence=0.5,
                )
            ]

        return suggestions

