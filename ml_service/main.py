import os

from fastapi import FastAPI, HTTPException

# ── Friend's assistant ML ─────────────────────────────────────────────────────
from database import Database
from predictor import SuggestionEngine
from repository import UserHistoryRepository
from schemas import PredictRequest, PredictResponse

# ── Spending prediction ML ────────────────────────────────────────────────────
from spending_database import Database as SpendingDatabase
from spending_predictor import SpendingPredictor
from spending_schemas import SpendingPredictionResponse

# ── Shared setup ──────────────────────────────────────────────────────────────
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")

# Assistant ML
db = Database(MONGO_URI)
repo = UserHistoryRepository(MONGO_URI)
engine = SuggestionEngine(database=db, repository=repo)

# Spending ML
spending_db = SpendingDatabase(MONGO_URI)
spending_predictor = SpendingPredictor(db=spending_db)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Agent AI — ML Service", version="2.0.0")


# ── Root & health ─────────────────────────────────────────────────────────────

@app.get("/")
def root() -> dict:
    return {
        "service": "Agent AI — ML Service",
        "routes": {
            "POST /predict": "AI assistant suggestions",
            "POST /retrain/{user_id}": "Retrain assistant model for a user",
            "GET  /spending-prediction": "Next-month finance spending prediction",
            "GET  /health": "Service health check",
        },
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "assistant_db": db.client is not None,
        "spending_db": spending_db.available,
    }


# ── Assistant ML routes (friend's) ────────────────────────────────────────────

@app.post("/predict", response_model=PredictResponse)
async def predict(body: PredictRequest) -> PredictResponse:
    try:
        return PredictResponse(suggestions=engine.generate_suggestions(body))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/retrain/{user_id}")
async def retrain(user_id: str) -> dict:
    try:
        ok = engine.retrain_user(user_id)
        return {"user_id": user_id, "trained": ok}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Spending prediction ML routes (ours) ──────────────────────────────────────

@app.get("/spending-prediction", response_model=SpendingPredictionResponse)
def spending_prediction() -> SpendingPredictionResponse:
    """
    Returns next-month spending prediction per category using simple linear
    regression (scikit-learn) over 6 months of Google Sheets data via n8n.
    Results cached in MongoDB for 24 h.
    """
    try:
        return spending_predictor.get_prediction()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/spending-prediction/cache")
def clear_spending_cache() -> dict:
    """Force-clear the MongoDB prediction cache so the next GET recomputes fresh."""
    deleted = spending_db.clear_cache()
    return {"deleted": deleted, "message": "Cache cleared. Next request will recompute."}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
