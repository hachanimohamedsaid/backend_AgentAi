# Corrections et configuration frontend

Ce document indique ce qu’il faut **corriger ou configurer côté frontend** (Flutter ou autre) pour que l’app parle correctement au backend et à l’Assistant en production et en local.

---

## 1. URL de base de l’API (obligatoire)

Le frontend doit appeler le **backend Nest**, pas le service ML. Une seule base URL pour toute l’API.

| Environnement | Base URL à utiliser |
|---------------|---------------------|
| **Production** | `https://backendagentai-production.up.railway.app` |
| **Local** | `http://localhost:3000` |

À faire dans le projet frontend :

- Définir une variable / constante **API_BASE_URL** (ou équivalent) selon l’environnement (build prod vs debug).
- **Ne pas** utiliser `http://127.0.0.1:5001` ni l’URL du service ML : le front n’appelle que le backend. C’est le backend qui appelle le ML.

Exemple (à adapter à ton stack) :

```dart
// Flutter – exemple
const String apiBaseUrl = kReleaseMode
    ? 'https://backendagentai-production.up.railway.app'
    : 'http://localhost:3000';
```

Ou via fichier de config / env :

```
# .env.production
API_BASE_URL=https://backendagentai-production.up.railway.app

# .env (dev)
API_BASE_URL=http://localhost:3000
```

---

## 2. Auth : en-tête Authorization

Pour les routes protégées (auth, assistant, etc.), envoyer le token JWT :

- **Header :** `Authorization: Bearer <accessToken>`
- `accessToken` = celui reçu au login (ex. `POST /auth/login` ou `/auth/google`).

Sans ce header, les endpoints protégés renverront **401 Unauthorized**.

---

## 3. Avoir des suggestions à l’ouverture (obligatoire)

Pour ne plus avoir « No new suggestions right now » quand l’utilisateur ouvre l’écran Suggestions, le frontend doit **envoyer le contexte actuel** au backend.

### Quand appeler

- **Dès l’ouverture** de l’écran Suggestions (ou au premier chargement de l’app si cet écran est visible).
- Optionnel : rappeler après un certain temps ou quand le contexte change (lieu, heure, météo).

### Appel à faire

**POST** `{API_BASE_URL}/assistant/context`

**Body (JSON) :**

| Champ       | Type   | Exemple / Valeurs possibles |
|------------|--------|-----------------------------|
| userId     | string | ID utilisateur connecté (ex. `user.id`) |
| time       | string | Heure au format **HH:mm** (ex. `"08:30"`) |
| location   | string | **`"home"`** \| **`"work"`** \| **`"outside"`** (pas "At home" en clair) |
| weather    | string | **`"sunny"`** \| **`"cloudy"`** \| **`"rain"`** (pas "Partly cloudy" en clair) |
| meetings   | array  | Optionnel. Ex. `[{ "title": "Daily", "time": "10:00" }]` (time en HH:mm) |
| focusHours | number | Nombre d’heures de focus (≥ 0). Ex. `0` ou `1` |

**Exemple pour ton écran (At home, 8:30 AM, Partly cloudy, 2 meetings) :**

```json
{
  "userId": "<id_utilisateur_connecté>",
  "time": "08:30",
  "location": "home",
  "weather": "cloudy",
  "meetings": [
    { "title": "Meeting 1", "time": "10:00" },
    { "title": "Meeting 2", "time": "14:00" }
  ],
  "focusHours": 0
}
```

**Réponse 200 :** `{ "suggestions": [ { "id": "...", "type": "coffee", "message": "Want your usual coffee?", "confidence": 0.5, "status": "pending" }, ... ] }`

- Afficher les éléments de **suggestions** (cartes avec Accepter / Refuser).
- Si **suggestions** est vide, afficher « No new suggestions right now ».

**Important :**  
- **location** doit être exactement `"home"`, `"work"` ou `"outside"` (valeurs API), pas le libellé affiché (« At home » → envoyer `"home"`).  
- **weather** doit être `"sunny"`, `"cloudy"` ou `"rain"` (« Partly cloudy » → envoyer `"cloudy"`).  
- **time** au format **HH:mm** (ex. 8h30 → `"08:30"`).

Sans cet appel à **POST /assistant/context**, le backend ne génère aucune suggestion → l’écran restera vide.

---

## 4. Assistant : Accepter / Refuser (obligatoire pour le ML)

Le backend et le ML sont configurés pour que les suggestions « apprennent » uniquement si le front envoie le **feedback** (accept / refuse).

À faire :

1. **Afficher** les suggestions renvoyées par `POST /assistant/context` ou `GET /assistant/suggestions/:userId`.
2. Pour **chaque** suggestion, proposer deux actions claires : **Accepter** et **Refuser** (ou Fermer / Ignorer).
3. **Dès** que l’utilisateur clique :
   - **Accepter** → `POST /assistant/feedback` avec `{ "suggestionId": "<id>", "action": "accepted" }`
   - **Refuser** → `POST /assistant/feedback` avec `{ "suggestionId": "<id>", "action": "dismissed" }`
4. Utiliser l’**`id`** de la suggestion (celui renvoyé par l’API), pas un ID généré côté front.
5. N’envoyer **qu’une seule fois** le feedback par suggestion (désactiver le bouton ou retirer la carte après envoi).

Document détaillé (body, réponses, erreurs) : **[FRONTEND_ASSISTANT_ACCEPT_REFUSE.md](FRONTEND_ASSISTANT_ACCEPT_REFUSE.md)**.

---

## 5. Checklist des corrections frontend

- [ ] **Base URL** : en prod, utiliser `https://backendagentai-production.up.railway.app` (sans slash final). En dev, `http://localhost:3000`.
- [ ] **Aucun appel direct** vers le service ML (pas d’URL type `incredible-determination-production-*.railway.app` dans le front). Tout passe par le backend.
- [ ] **Authorization** : header `Authorization: Bearer <accessToken>` sur les requêtes qui nécessitent un utilisateur connecté.
- [ ] **Assistant – feedback** : à chaque acceptation ou refus d’une suggestion, appeler `POST /assistant/feedback` avec `suggestionId` et `action` (`"accepted"` ou `"dismissed"`).
- [ ] **Assistant – id** : utiliser `suggestion.id` (réponse API) comme `suggestionId` dans le feedback.
- [ ] **Assistant – contexte à l’ouverture** : à l’ouverture de l’écran Suggestions, appeler **POST /assistant/context** avec `userId`, `time` (HH:mm), `location` (`"home"`|`"work"`|`"outside"`), `weather` (`"sunny"`|`"cloudy"`|`"rain"`), `focusHours`, et optionnellement `meetings`. Afficher les `suggestions` renvoyées. Sans cet appel, aucune suggestion n’apparaît.
- [ ] Gestion des erreurs : 401 → déconnecter ou renvoyer vers login ; 404/500 → afficher un message ou retry selon le cas.

---

## 6. Références

| Document | Contenu |
|----------|---------|
| [API_CONTRACT_FLUTTER.md](API_CONTRACT_FLUTTER.md) | Contrat API global (auth, users, etc.) |
| [FRONTEND_ASSISTANT_ACCEPT_REFUSE.md](FRONTEND_ASSISTANT_ACCEPT_REFUSE.md) | Assistant : contexte, suggestions, accept/refuse en détail |

---

## 7. Si l’URL backend change

Si tu déploies le backend sur un autre domaine Railway :

1. Récupérer la **nouvelle** URL publique (ex. Settings → Networking du service backend).
2. Mettre à jour **API_BASE_URL** (ou équivalent) côté frontend pour la prod.
3. Rebuilder / redéployer l’app frontend.

Le service ML est interne au backend ; le frontend n’a pas à connaître son URL.
