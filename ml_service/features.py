"""Feature engineering for user preference learning from suggestion feedback."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Tuple

import numpy as np


# Location encoding: home=1,0,0 | work=0,1,0 | outside=0,0,1 (campus treated as work)
_LOCATIONS = ("home", "work", "outside")
_WEATHERS = ("sunny", "cloudy", "rain")


def _hour_from_doc(doc: Dict[str, Any]) -> int:
    """Extract hour (0-23) from document: time "HH:MM" or createdAt."""
    t = doc.get("time")
    if isinstance(t, str) and len(t) >= 5 and t[2] == ":":
        return int(t[:2])
    created = doc.get("createdAt")
    if created is not None:
        if hasattr(created, "hour"):
            return created.hour
        if isinstance(created, (int, float)):
            from datetime import datetime
            dt = datetime.utcfromtimestamp(created)
            return dt.hour
    return 12


def _location_from_doc(doc: Dict[str, Any]) -> str:
    """Normalize location to home/work/outside."""
    loc = (doc.get("location") or doc.get("context", {}).get("location") or "home")
    if isinstance(loc, str):
        loc = loc.lower()
        if loc == "campus":
            return "work"
        if loc in _LOCATIONS:
            return loc
    return "home"


def _weather_from_doc(doc: Dict[str, Any]) -> str:
    """Normalize weather to sunny/cloudy/rain."""
    w = (doc.get("weather") or doc.get("context", {}).get("weather") or "sunny")
    if isinstance(w, str) and w.lower() in _WEATHERS:
        return w.lower()
    return "sunny"


def _focus_hours_from_doc(doc: Dict[str, Any]) -> int:
    """Extract focusHours (int)."""
    v = doc.get("focusHours") or doc.get("context", {}).get("focusHours")
    if v is not None:
        try:
            return int(float(v))
        except (TypeError, ValueError):
            pass
    return 0


def _meetings_from_doc(doc: Dict[str, Any]) -> int:
    """Extract meetings count (int)."""
    v = doc.get("meetingsCount") or doc.get("meetings") or doc.get("context", {}).get("meetings")
    if v is not None:
        try:
            if isinstance(v, list):
                return len(v)
            return int(float(v))
        except (TypeError, ValueError):
            pass
    return 0


def _doc_to_features(doc: Dict[str, Any]) -> np.ndarray:
    """Build feature vector from one suggestion document."""
    hour = _hour_from_doc(doc)
    is_morning = 1 if 5 <= hour <= 11 else 0
    is_afternoon = 1 if 12 <= hour <= 17 else 0
    is_evening = 1 if 18 <= hour <= 23 else 0

    loc = _location_from_doc(doc)
    location_home = 1 if loc == "home" else 0
    location_work = 1 if loc == "work" else 0
    location_outside = 1 if loc == "outside" else 0

    weather = _weather_from_doc(doc)
    weather_sunny = 1 if weather == "sunny" else 0
    weather_cloudy = 1 if weather == "cloudy" else 0
    weather_rain = 1 if weather == "rain" else 0

    focus_hours = _focus_hours_from_doc(doc)
    meetings_count = _meetings_from_doc(doc)

    return np.array(
        [
            hour,
            is_morning,
            is_afternoon,
            is_evening,
            location_home,
            location_work,
            location_outside,
            weather_sunny,
            weather_cloudy,
            weather_rain,
            focus_hours,
            meetings_count,
        ],
        dtype=np.float64,
    )


def build_training_dataset_from_history(
    history: List[Dict[str, Any]],
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build (X, y) from a list of suggestion documents (status accepted/dismissed).
    X: feature matrix; y: labels (accepted=1, dismissed=0).
    """
    if not history:
        return np.zeros((0, 12), dtype=np.float64), np.array([], dtype=np.float64)

    rows = []
    labels = []
    for doc in history:
        status = (doc.get("status") or "").lower()
        if status not in ("accepted", "dismissed"):
            continue
        label = 1 if status == "accepted" else 0
        rows.append(_doc_to_features(doc))
        labels.append(label)

    if not rows:
        return np.zeros((0, 12), dtype=np.float64), np.array([], dtype=np.float64)

    X = np.vstack(rows)
    y = np.array(labels, dtype=np.float64)
    return X, y


def build_training_dataset(
    user_id: str,
    get_user_history: Callable[[str], List[Dict[str, Any]]],
) -> Tuple[np.ndarray, np.ndarray]:
    """Load user history and return (X, y) for training."""
    history = get_user_history(user_id)
    return build_training_dataset_from_history(history)


def context_to_feature_vector(
    time: str,
    location: str,
    weather: str,
    focus_hours: float,
    meetings: int,
) -> np.ndarray:
    """Build the same 12-dim feature vector from current context (for prediction)."""
    if len(time) >= 5 and time[2] == ":":
        hour = int(time[:2])
    else:
        hour = 12
    is_morning = 1 if 5 <= hour <= 11 else 0
    is_afternoon = 1 if 12 <= hour <= 17 else 0
    is_evening = 1 if 18 <= hour <= 23 else 0

    loc = (location or "home").lower()
    if loc == "campus":
        loc = "work"
    location_home = 1 if loc == "home" else 0
    location_work = 1 if loc == "work" else 0
    location_outside = 1 if loc == "outside" else 0

    w = (weather or "sunny").lower()
    weather_sunny = 1 if w == "sunny" else 0
    weather_cloudy = 1 if w == "cloudy" else 0
    weather_rain = 1 if w == "rain" else 0

    fh = int(float(focus_hours)) if focus_hours is not None else 0
    if meetings is None:
        meet = 0
    elif isinstance(meetings, list):
        meet = len(meetings)
    else:
        meet = int(meetings)

    return np.array(
        [
            hour,
            is_morning,
            is_afternoon,
            is_evening,
            location_home,
            location_work,
            location_outside,
            weather_sunny,
            weather_cloudy,
            weather_rain,
            fh,
            meet,
        ],
        dtype=np.float64,
    ).reshape(1, -1)
