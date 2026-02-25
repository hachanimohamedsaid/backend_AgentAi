import os
from datetime import datetime
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from pymongo import MongoClient


class PredictRequest(BaseModel):
    timeOfDay: int = Field(ge=0, le=23)
    dayOfWeek: int = Field(ge=0, le=6)
    suggestionType: Literal["coffee", "leave_home", "umbrella", "break"]


class PredictResponse(BaseModel):
    probability: float


# MongoDB hébergé (Atlas, etc.) : toujours via variable d'environnement, pas de localhost en dur.
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
if not MONGO_URI:
    raise RuntimeError(
        "MONGO_URI or MONGODB_URI must be set. Use a hosted MongoDB (e.g. Atlas) and set the "
        "variable in .env (local) or in your deployment environment (e.g. Railway)."
    )
client = MongoClient(MONGO_URI)
db = client.get_default_database()
logs = db.get_collection("interaction_logs")

app = FastAPI(title="Assistant ML Service", version="1.0.0")


@app.get("/")
def root():
    return {"service": "Assistant ML Service", "predict": "POST /predict"}


def compute_probability(
    user_id: Optional[str],
    suggestion_type: str,
    time_of_day: int,
    day_of_week: int,
) -> float:
    """
    Very simple frequency-based model:
    - Look at interaction_logs filtered by suggestionType (+/- time window and dayOfWeek)
    - Probability = accepted / total
    - If no data → default 0.5
    """

    base_filter: dict = {
        "suggestionType": suggestion_type,
        "timeOfDay": {"$gte": max(0, time_of_day - 1), "$lte": min(23, time_of_day + 1)},
        "dayOfWeek": day_of_week,
    }

    # If you want per-user personalization, include userId filter when present
    if user_id:
        base_filter["userId"] = user_id

    cursor = logs.find(base_filter, {"action": 1})
    total = 0
    accepted = 0
    for doc in cursor:
        total += 1
        if doc.get("action") == "accepted":
            accepted += 1

    if total == 0:
        return 0.5

    prob = accepted / total
    # Clamp to [0.1, 0.9] to avoid extremes on small data
    return float(max(0.1, min(0.9, prob)))


@app.post("/predict", response_model=PredictResponse)
async def predict(body: PredictRequest) -> PredictResponse:
    try:
        # Optional: pass a fixed userId via env if you want per-user predictions
        user_id = os.getenv("ML_USER_ID")
        probability = compute_probability(
            user_id=user_id,
            suggestion_type=body.suggestionType,
            time_of_day=body.timeOfDay,
            day_of_week=body.dayOfWeek,
        )
        return PredictResponse(probability=probability)
    except Exception as exc:  # pragma: no cover - safety
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("ML_PORT", "5001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

