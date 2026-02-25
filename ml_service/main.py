import os

from fastapi import FastAPI, HTTPException

from database import Database
from predictor import SuggestionEngine
from schemas import PredictRequest, PredictResponse


MONGO_URI = os.getenv("MONGO_URI")
db = Database(MONGO_URI)

app = FastAPI(title="Assistant ML Service", version="1.0.0")
engine = SuggestionEngine(database=db)


@app.get("/")
def root() -> dict:
    return {"service": "Assistant ML Service", "predict": "POST /predict"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse)
async def predict(body: PredictRequest) -> PredictResponse:
    try:
        context = body
        suggestions = engine.generate_suggestions(context)
        return PredictResponse(suggestions=suggestions)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)

