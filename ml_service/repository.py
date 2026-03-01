"""User history repository: read feedback from MongoDB suggestions collection."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from pymongo import MongoClient
from pymongo.errors import PyMongoError


class UserHistoryRepository:
    """Reads suggestion feedback (accepted/dismissed) from MongoDB."""

    def __init__(self, mongo_uri: Optional[str] = None) -> None:
        self._uri = mongo_uri or os.getenv("MONGO_URI")
        self._client: Optional[MongoClient] = None
        self._collection = None
        self._connect()

    def _connect(self) -> None:
        if not self._uri:
            return
        try:
            self._client = MongoClient(self._uri, serverSelectionTimeoutMS=3000)
            self._client.admin.command("ping")
            db = self._client.get_default_database()
            # Use SUGGESTIONS_COLLECTION=assistant_suggestions if sharing DB with Nest
            collection_name = os.getenv("SUGGESTIONS_COLLECTION", "suggestions")
            self._collection = db.get_collection(collection_name)
        except PyMongoError:
            self._client = None
            self._collection = None

    def get_user_history(self, user_id: str) -> List[Dict[str, Any]]:
        """Load all non-pending suggestions for a user (accepted/dismissed only)."""
        if self._collection is None:
            return []
        try:
            cursor = self._collection.find(
                {"userId": user_id, "status": {"$in": ["accepted", "dismissed"]}},
                sort=[("createdAt", 1)],
            )
            return list(cursor)
        except PyMongoError:
            return []

    def get_all_history(self) -> List[Dict[str, Any]]:
        """Load all non-pending suggestions across users."""
        if self._collection is None:
            return []
        try:
            cursor = self._collection.find(
                {"status": {"$in": ["accepted", "dismissed"]}},
                sort=[("createdAt", 1)],
            )
            return list(cursor)
        except PyMongoError:
            return []
