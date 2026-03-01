"""Per-user LogisticRegression preference model: train, predict, save/load with joblib."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

from features import (
    build_training_dataset_from_history,
    context_to_feature_vector,
)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
MIN_SAMPLES = 5


def _ensure_models_dir() -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)


def _model_path(user_id: str) -> str:
    return os.path.join(MODELS_DIR, f"{user_id}.pkl")


class UserPreferenceModel:
    """Per-user online learning model: train from history, predict probability, persist with joblib."""

    def __init__(
        self,
        get_user_history: Optional[Any] = None,
    ) -> None:
        self._get_user_history = get_user_history  # callable: user_id -> List[dict]
        _ensure_models_dir()

    def train(self, user_id: str) -> Optional[LogisticRegression]:
        """
        Train (or retrain) the model for user_id from MongoDB history.
        Returns the fitted model if trained and saved, None otherwise.
        Caller can cache the returned model.
        """
        if not self._get_user_history:
            return None
        history = self._get_user_history(user_id)
        X, y = build_training_dataset_from_history(history)
        if X.shape[0] < MIN_SAMPLES:
            return None
        model = LogisticRegression(max_iter=500, random_state=42)
        model.fit(X, y)
        self.save_model(user_id, model)
        return model

    def predict_proba(
        self,
        context: Any,
        user_id: Optional[str] = None,
        model: Optional[LogisticRegression] = None,
    ) -> Optional[float]:
        """
        Return P(accepted) for the given context, or None if no model.
        context: object with .time, .location, .weather, .focusHours, .meetings
        If model is provided (e.g. from cache), use it; else load by user_id.
        """
        try:
            vec = context_to_feature_vector(
                getattr(context, "time", ""),
                getattr(context, "location", ""),
                getattr(context, "weather", ""),
                getattr(context, "focusHours", 0),
                getattr(context, "meetings", 0),
            )
        except Exception:
            return None
        if model is None and user_id:
            model = self.load_model(user_id)
        if model is None or not hasattr(model, "predict_proba"):
            return None
        try:
            p = model.predict_proba(vec)[0][1]
            return float(np.clip(p, 0.0, 1.0))
        except Exception:
            return None

    def save_model(self, user_id: str, model: LogisticRegression) -> None:
        """Persist model to ./models/{user_id}.pkl."""
        _ensure_models_dir()
        path = _model_path(user_id)
        joblib.dump(model, path)

    def load_model(self, user_id: str) -> Optional[LogisticRegression]:
        """Load model from ./models/{user_id}.pkl if file exists."""
        path = _model_path(user_id)
        if not os.path.isfile(path):
            return None
        try:
            return joblib.load(path)
        except Exception:
            return None
