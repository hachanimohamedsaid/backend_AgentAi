import os

from fastapi import FastAPI, HTTPException

from database import Database
from predictor import SpendingPredictor
from schemas import SpendingPredictionResponse

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")

db = Database(MONGO_URI)
predictor = SpendingPredictor(db=db)

app = FastAPI(title="Spending ML Service", version="1.0.0")


@app.get("/")
def root() -> dict:
    return {
        "service": "Spending ML Service",
        "endpoint": "GET /spending-prediction",
        "description": "Linear regression prediction of next-month spending by category",
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "db_connected": db.available}


@app.get("/spending-prediction", response_model=SpendingPredictionResponse)
def spending_prediction() -> SpendingPredictionResponse:
    """
    Returns next-month spending prediction per category using simple linear
    regression (scikit-learn) over the last 6 months of Google Sheets data
    fetched via n8n webhook /webhook/ml-predict.

    Results are cached in MongoDB for 24 h (TTL index).
    """
    try:
        return predictor.get_prediction()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8081"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
