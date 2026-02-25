from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field, validator


Location = Literal["home", "outside", "campus"]
Weather = Literal["sunny", "cloudy", "rain"]


class Context(BaseModel):
    time: str = Field(..., description="Current time in HH:MM format")
    location: Location
    weather: Weather
    focusHours: float = Field(..., ge=0)
    meetings: int = Field(..., ge=0)

    @validator("time")
    def validate_time(cls, v: str) -> str:
        if len(v) != 5 or v[2] != ":":
            raise ValueError("time must be in HH:MM format")
        hh, mm = v.split(":")
        if not (hh.isdigit() and mm.isdigit()):
            raise ValueError("time must be in HH:MM format")
        h = int(hh)
        m = int(mm)
        if h < 0 or h > 23 or m < 0 or m > 59:
            raise ValueError("time must be in HH:MM format")
        return v


class Suggestion(BaseModel):
    message: str
    confidence: float = Field(..., ge=0.0, le=1.0)


class PredictRequest(Context):
    pass


class PredictResponse(BaseModel):
    suggestions: List[Suggestion]

