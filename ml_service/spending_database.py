from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from pymongo import MongoClient, DESCENDING
from pymongo.errors import PyMongoError


@dataclass
class Database:
    uri: Optional[str]

    def __post_init__(self) -> None:
        self.client: Optional[MongoClient] = None
        self._predictions_col = None

        if not self.uri:
            return

        try:
            self.client = MongoClient(self.uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command("ping")
            db = self.client.get_default_database()
            self._predictions_col = db.get_collection("spending_predictions_py")
            # TTL index: auto-delete documents older than 24 hours
            self._predictions_col.create_index(
                "generated_at",
                expireAfterSeconds=86400,
                background=True,
            )
        except PyMongoError as exc:
            print(f"[DB] MongoDB connection failed: {exc}")
            self.client = None
            self._predictions_col = None

    @property
    def available(self) -> bool:
        return self._predictions_col is not None

    def get_latest_prediction(self) -> Optional[Dict[str, Any]]:
        if not self.available:
            return None
        try:
            return self._predictions_col.find_one(
                {}, sort=[("generated_at", DESCENDING)]
            )
        except PyMongoError:
            return None

    def save_prediction(self, doc: Dict[str, Any]) -> None:
        if not self.available:
            return
        try:
            doc["generated_at"] = datetime.now(timezone.utc)
            self._predictions_col.insert_one(doc)
        except PyMongoError as exc:
            print(f"[DB] Failed to save prediction: {exc}")

    def clear_cache(self) -> int:
        """Delete all cached predictions. Returns count of deleted documents."""
        if not self.available:
            return 0
        try:
            result = self._predictions_col.delete_many({})
            return result.deleted_count
        except PyMongoError as exc:
            print(f"[DB] Failed to clear cache: {exc}")
            return 0
