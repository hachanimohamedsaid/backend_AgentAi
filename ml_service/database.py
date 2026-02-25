from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from pymongo import MongoClient
from pymongo.errors import PyMongoError


@dataclass
class Database:
    uri: Optional[str]

    def __post_init__(self) -> None:
        self.client: Optional[MongoClient] = None
        self.db = None
        self.suggestions = None
        self.feedback = None
        self.contexts = None

        if not self.uri:
            return

        try:
            self.client = MongoClient(self.uri, serverSelectionTimeoutMS=3000)
            # Trigger a cheap server selection check but ignore failures
            try:
                self.client.admin.command("ping")
            except PyMongoError:
                # Keep running without DB
                self.client = None
                return

            self.db = self.client.get_default_database()
            self.suggestions = self.db.get_collection("suggestions")
            self.feedback = self.db.get_collection("feedback")
            self.contexts = self.db.get_collection("contexts")
        except PyMongoError:
            self.client = None
            self.db = None
            self.suggestions = None
            self.feedback = None
            self.contexts = None

    def _safe_insert(self, collection, doc: Dict[str, Any]) -> None:
        if not collection:
            return
        try:
            collection.insert_one(doc)
        except PyMongoError:
            # Never crash on DB errors
            return

    def log_context(self, context: Dict[str, Any]) -> None:
        self._safe_insert(self.contexts, context)

    def log_suggestions(
        self,
        context: Dict[str, Any],
        suggestions: Any,
    ) -> None:
        self._safe_insert(
            self.suggestions,
            {
                "context": context,
                "suggestions": suggestions,
            },
        )

    def log_feedback(self, feedback: Dict[str, Any]) -> None:
        self._safe_insert(self.feedback, feedback)

