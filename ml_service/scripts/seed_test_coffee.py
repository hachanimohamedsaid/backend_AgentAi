#!/usr/bin/env python3
"""
Insère des données de test dans interaction_logs pour la suggestion "coffee".
Permet de vérifier que le ML "apprend" : après ce script, POST /predict avec
suggestionType=coffee doit retourner une probabilité différente de 0.5 (ex. 0.6 = 3 acceptés / 5 total).
Utilisation (depuis ml_service, avec MONGO_URI défini) :
  python3 scripts/seed_test_coffee.py
"""
import os
import sys

# Ajouter le répertoire parent pour importer main (ou utiliser pymongo seul)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
if not MONGO_URI:
    print("ERREUR: MONGO_URI ou MONGODB_URI doit être défini.")
    sys.exit(1)

client = MongoClient(MONGO_URI)
db = client.get_default_database()
logs = db.get_collection("interaction_logs")

# Données de test pour "coffee" à 10h, jour 1 (lundi) : 3 acceptés, 2 refusés → proba = 3/5 = 0.6
TEST_USER = "test-user-ml"
TIME_OF_DAY = 10
DAY_OF_WEEK = 1

docs = [
    {"userId": TEST_USER, "suggestionType": "coffee", "action": "accepted", "timeOfDay": TIME_OF_DAY, "dayOfWeek": DAY_OF_WEEK},
    {"userId": TEST_USER, "suggestionType": "coffee", "action": "accepted", "timeOfDay": TIME_OF_DAY, "dayOfWeek": DAY_OF_WEEK},
    {"userId": TEST_USER, "suggestionType": "coffee", "action": "accepted", "timeOfDay": TIME_OF_DAY, "dayOfWeek": DAY_OF_WEEK},
    {"userId": TEST_USER, "suggestionType": "coffee", "action": "dismissed", "timeOfDay": TIME_OF_DAY, "dayOfWeek": DAY_OF_WEEK},
    {"userId": TEST_USER, "suggestionType": "coffee", "action": "dismissed", "timeOfDay": TIME_OF_DAY, "dayOfWeek": DAY_OF_WEEK},
]

# Éviter les doublons si on relance le script : supprimer les anciens docs test pour coffee à cette heure/jour
logs.delete_many({
    "userId": TEST_USER,
    "suggestionType": "coffee",
    "timeOfDay": TIME_OF_DAY,
    "dayOfWeek": DAY_OF_WEEK,
})
result = logs.insert_many(docs)
print(f"OK: {len(result.inserted_ids)} entrées de test insérées pour coffee (timeOfDay={TIME_OF_DAY}, dayOfWeek={DAY_OF_WEEK}).")
print("  → 3 accepted, 2 dismissed → probabilité attendue = 0.6")
print("Teste avec: curl -s -X POST http://127.0.0.1:5001/predict -H 'Content-Type: application/json' -d '{\"timeOfDay\":10,\"dayOfWeek\":1,\"suggestionType\":\"coffee\"}'")
