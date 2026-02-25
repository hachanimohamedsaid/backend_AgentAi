# Méthode de test complète – Vérifier que tout le travail est bon

Ce document décrit comment vérifier de A à Z que le backend Nest, le service ML et l’intégration fonctionnent (en local et en production).

---

## Prérequis

- Node.js et `npm install` déjà faits à la racine du projet.
- Fichier `.env` à la racine (copie de `.env.example`) avec au moins **MONGO_URI** renseigné (MongoDB Atlas).
- Python 3.9+ disponible (`python3 --version`).

---

## Phase 1 : Vérification des variables d’environnement

À la racine du projet :

```bash
npm run verify:env
```

**Résultat attendu :** `OK: variables MongoDB présentes dans .env`  
**Si erreur :** Créer ou compléter `.env` avec `MONGO_URI=mongodb+srv://...` (voir `.env.example`).

---

## Phase 2 : Test du service ML seul

### 2.1 Démarrer le service ML

Dans un **premier terminal** (depuis la racine) :

```bash
cd ml_service && export MONGO_URI="$(grep '^MONGO_URI=' ../.env | cut -d= -f2- | head -1)" && python3 -m pip install -r requirements.txt && python3 -m uvicorn main:app --host 0.0.0.0 --port 5001
```

Si ton `.env` contient des caractères spéciaux dans l’URI, utilise plutôt une commande qui charge uniquement `MONGO_URI` (voir README).  
**Résultat attendu :** `Uvicorn running on http://0.0.0.0:5001` et `Application startup complete`.

### 2.2 Tester l’API de prédiction

Dans un **second terminal** (à la racine) :

```bash
npm run verify:ml
```

**Résultat attendu :** une ligne JSON du type `{"probability":0.5}` (ou une valeur entre 0.1 et 0.9).  
**Si erreur :** le service ML n’est pas démarré ou pas sur le port 5001.

Test manuel équivalent :

```bash
curl -s -X POST http://127.0.0.1:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"timeOfDay":10,"dayOfWeek":1,"suggestionType":"coffee"}'
```

### 2.3 Test que le ML « apprend » (café)

Le ML **n’a pas de modèle entraîné** : il utilise uniquement la collection **interaction_logs** dans MongoDB.

- **Sans données** (ou aucune interaction café enregistrée) → la probabilité renvoyée est **0.5** (valeur par défaut).
- **Avec des données** (utilisateur a accepté/refusé des suggestions café) → la probabilité = proportion d’acceptations (ex. 3 acceptés / 5 total → 0.6).

Pour vérifier que **ça marche et que ça « apprend »** (utilise bien les données) :

1. **Sans données** (optionnel) : appeler `/predict` pour coffee → tu dois avoir `{"probability":0.5}`.
2. **Insérer des données de test** (depuis la racine du projet, avec `MONGO_URI` défini) :

```bash
cd ml_service && export MONGO_URI="$(grep '^MONGO_URI=' ../.env | cut -d= -f2- | head -1)" && python3 scripts/seed_test_coffee.py
```

Le script insère 5 interactions café (3 acceptées, 2 refusées) pour 10h, lundi. La probabilité attendue devient **0.6** (3/5).

3. **Recall /predict** (service ML toujours lancé) :

```bash
curl -s -X POST http://127.0.0.1:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"timeOfDay":10,"dayOfWeek":1,"suggestionType":"coffee"}'
```

**Résultat attendu :** `{"probability":0.6}` (ou une valeur entre 0.1 et 0.9). Si tu obtiens 0.6 au lieu de 0.5, le ML **ya5dem** et **yat3lem** (il utilise bien les logs pour le café).

En production, les données viennent de l’app (quand l’utilisateur accepte ou refuse une suggestion) ; plus il y a d’interactions, plus la probabilité reflète le comportement.

---

## Phase 3 : Test du backend Nest seul

### 3.1 Démarrer le backend

Dans un terminal (le service ML peut rester lancé dans l’autre) :

```bash
npm run start:dev
```

**Résultat attendu dans les logs :**
- `[Mongoose] Successfully connected to MongoDB Atlas.`
- `Nest application successfully started`
- écoute sur le port 3000 (ou `PORT` si défini).

### 3.2 Tester l’API racine

Dans un **autre terminal** :

```bash
curl -s http://localhost:3000/
```

**Résultat attendu :** `Hello World!` (ou la réponse configurée pour `/`).

```bash
npm run verify:backend
```

**Résultat attendu :** sortie du curl sans erreur (code 200).

---

## Phase 4 : Test d’intégration Backend → ML

Conditions :
- Service ML en marche sur le port 5001 **ou** variable **ML_SERVICE_URL** pointant vers l’URL du service ML.
- Backend Nest en marche.

Selon ton code, un endpoint (ex. assistant/suggestions) appelle le service ML. Tester cet endpoint (via curl, Postman ou l’app Flutter) et vérifier :
- pas d’erreur 500 ;
- dans les logs Nest, pas d’erreur type « ML predict error » ou « ECONNREFUSED ».

Exemple si tu as un endpoint qui déclenche une prédiction :

```bash
# Exemple (adapter l’URL et le body selon ton API)
curl -s -X POST http://localhost:3000/assistant/suggestions \
  -H "Content-Type: application/json" \
  -d '{"timeOfDay":10,"dayOfWeek":1,"suggestionType":"coffee"}'
```

Vérifier la réponse et les logs du backend.

---

## Phase 5 : Tests automatisés (Jest)

À la racine :

```bash
npm run test
```

**Résultat attendu :** tous les tests unitaires passent.

```bash
npm run test:e2e
```

**Résultat attendu :** tous les tests e2e passent.  
**Note :** les tests e2e utilisent la base MongoDB définie par `MONGO_URI` dans `.env`. Assure-toi que c’est une base de test (ou une base dédiée) pour ne pas modifier la prod.

---

## Phase 6 : Vérification rapide (tout déjà lancé)

Si le **service ML** et le **backend Nest** sont déjà démarrés, tu peux enchaîner :

```bash
npm run verify:env && npm run verify:ml && npm run verify:backend
```

Cela vérifie : .env → ML /predict → Nest `/`.

---

## Phase 7 : Tests en production (Railway)

### 7.1 Service ML (ex. incredible-determination)

1. Railway → service ML → **Variables** : **MONGO_URI** (ou MONGODB_URI) défini avec l’URI Atlas.
2. **Networking** : générer un domaine public si besoin.
3. Tester depuis ta machine :

```bash
curl -s -X POST https://<TON-URL-ML>.railway.app/predict \
  -H "Content-Type: application/json" \
  -d '{"timeOfDay":10,"dayOfWeek":1,"suggestionType":"coffee"}'
```

**Résultat attendu :** `{"probability":0.5}` ou similaire.

### 7.2 Backend Nest sur Railway

1. Variables : **MONGO_URI**, **JWT_SECRET**, et optionnellement **ML_SERVICE_URL** = URL publique du service ML.
2. Tester :

```bash
curl -s https://<TON-URL-BACKEND>.railway.app/
```

**Résultat attendu :** la même réponse que en local (ex. `Hello World!`).

### 7.3 Intégration en prod

Appeler depuis l’app (ou curl) un endpoint qui utilise le ML et vérifier qu’il n’y a pas d’erreur (logs Railway du service Nest).

---

## Récapitulatif des commandes

| Objectif | Commande |
|----------|----------|
| Vérifier .env | `npm run verify:env` |
| Tester le service ML (doit être lancé) | `npm run verify:ml` |
| Tester le backend Nest (doit être lancé) | `npm run verify:backend` |
| Tout vérifier (ML + Nest lancés) | `npm run verify:all` |
| Tests unitaires | `npm run test` |
| Tests e2e | `npm run test:e2e` |
| Démarrer le ML | Voir Phase 2.1 |
| Démarrer le backend | `npm run start:dev` |

---

## Checklist finale « tout est bon »

- [ ] `npm run verify:env` → OK  
- [ ] Service ML démarré → `npm run verify:ml` → JSON avec `probability`  
- [ ] Backend Nest démarré → `npm run verify:backend` ou `curl localhost:3000/` → 200  
- [ ] Un appel qui passe par le ML (backend ou Flutter) → pas d’erreur  
- [ ] `npm run test` → vert  
- [ ] `npm run test:e2e` → vert (avec une base de test)  
- [ ] En prod (Railway) : ML et Backend répondent aux curl ci-dessus  

Si tous les points sont verts, le travail est vérifié de bout en bout.
