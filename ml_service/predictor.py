from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Any

from database import Database
from repository import UserHistoryRepository
from schemas import Context, Suggestion
from user_model import UserPreferenceModel, MIN_SAMPLES

# In-memory cache: user_id -> fitted LogisticRegression model
models_cache: Dict[str, Any] = {}


@dataclass
class SuggestionEngine:
    database: Optional[Database] = None
    repository: Optional[UserHistoryRepository] = None

    def __post_init__(self) -> None:
        get_history = None
        if self.repository is not None:
            get_history = self.repository.get_user_history
        self._user_model = UserPreferenceModel(get_user_history=get_history)

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

    def _get_or_train_model(self, user_id: str) -> Optional[Any]:
        """Return model from cache, from disk, or train if enough history. Updates cache."""
        if user_id in models_cache:
            return models_cache[user_id]
        # Try load from disk
        loaded = self._user_model.load_model(user_id)
        if loaded is not None:
            models_cache[user_id] = loaded
            return loaded
        # Train if enough history
        if self.repository is None:
            return None
        history = self.repository.get_user_history(user_id)
        if len(history) < MIN_SAMPLES:
            return None
        fitted = self._user_model.train(user_id)
        if fitted is not None:
            models_cache[user_id] = fitted
            return fitted
        return None

    def retrain_user(self, user_id: str) -> bool:
        """Force retrain model for user from MongoDB history. Clears cache then trains."""
        models_cache.pop(user_id, None)
        fitted = self._user_model.train(user_id)
        if fitted is not None:
            models_cache[user_id] = fitted
            return True
        return False

    def generate_suggestions(self, context: Context) -> List[Suggestion]:
        ctx_dict = context.model_dump() if hasattr(context, "model_dump") else {}
        if self.database:
            self.database.log_context(ctx_dict)

        user_id = getattr(context, "userId", None)

        # User-specific ML path: enough history and model available
        if user_id and self.repository is not None:
            history = self.repository.get_user_history(user_id)
            if len(history) >= MIN_SAMPLES:
                model = self._get_or_train_model(user_id)
                if model is not None:
                    prob = self._user_model.predict_proba(context, user_id=user_id, model=model)
                    if prob is not None:
                        if prob < 0.35:
                            if self.database:
                                self.database.log_suggestions(ctx_dict, [])
                            return []
                        rule_based = self._rule_based(context)
                        message = rule_based[0].message if rule_based else "Stay hydrated and take a short stretch break."
                        suggestion = Suggestion(message=message, confidence=round(prob, 4))
                        if self.database:
                            self.database.log_suggestions(ctx_dict, [suggestion.model_dump()])
                        return [suggestion]

        # Fallback: rule-based
        suggestions = self._rule_based(context)
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
