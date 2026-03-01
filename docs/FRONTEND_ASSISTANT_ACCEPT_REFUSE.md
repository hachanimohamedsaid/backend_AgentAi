# Assistant – Suggestions : Accepter / Refuser (document détaillé pour le frontend)

Ce document décrit tout ce que le frontend (Flutter ou autre) doit faire pour l’Assistant : envoyer le contexte, récupérer les suggestions, et **enregistrer quand l’utilisateur accepte ou refuse** une suggestion. Ces actions alimentent le ML pour personnaliser les futures suggestions (ex. café).

---

## Base URL

- **Prod :** `https://<ton-backend>.railway.app` (ou ton URL backend)
- **Local :** `http://localhost:3000`

Tous les endpoints ci‑dessous sont préfixés par **`/assistant`**.  
Les endpoints protégés nécessitent : **`Authorization: Bearer <accessToken>`**.

---

## 1. Flux global

1. **Envoyer le contexte** → **POST** `/assistant/context`  
   Le backend génère des suggestions (café, partir, parapluie, pause) selon l’heure, la météo, les réunions, etc., et les enregistre avec le statut **pending**.

2. **Récupérer les suggestions du jour en attente** → **GET** `/assistant/suggestions/:userId`  
   Le front affiche ces suggestions (cartes, boutons, etc.).

3. **Quand l’utilisateur accepte ou refuse une suggestion** → **POST** `/assistant/feedback`  
   Le front envoie **suggestionId** + **action** (`accepted` ou `dismissed`). Le backend :
   - met à jour le statut de la suggestion (accepted / dismissed),
   - met à jour les habitudes (successRate),
   - **enregistre une entrée dans `interaction_logs`** (utilisée par le service ML pour les prochaines prédictions).

Sans cet appel à **feedback**, le ML ne « apprend » pas : les prochaines suggestions resteront basées sur la valeur par défaut (0.5).

---

## 2. Envoyer le contexte et obtenir des suggestions

### **POST** `/assistant/context`

Envoie le contexte utilisateur (heure, lieu, météo, réunions, focus). Le backend génère des suggestions et les sauvegarde en **pending**.

**Headers (recommandé si auth) :**  
`Content-Type: application/json`  
`Authorization: Bearer <accessToken>`

**Body :**

| Champ        | Type   | Obligatoire | Description |
|-------------|--------|-------------|-------------|
| userId      | string | oui         | ID de l’utilisateur (ex. `user.id` après login). |
| time        | string | oui         | Heure actuelle au format **HH:mm** (ex. `"09:15"`). |
| location    | string | oui         | Lieu : **`"home"`** \| **`"work"`** \| **`"outside"`**. |
| weather     | string | oui         | Météo : **`"sunny"`** \| **`"cloudy"`** \| **`"rain"`**. |
| meetings    | array  | non         | Liste de réunions. Chaque élément : `{ "title": "string", "time": "HH:mm" }`. |
| focusHours  | number | oui         | Nombre d’heures de focus déjà fait (≥ 0). |

**Exemple de body :**

```json
{
  "userId": "507f1f77bcf86cd799439011",
  "time": "09:15",
  "location": "home",
  "weather": "sunny",
  "meetings": [
    { "title": "Daily", "time": "10:00" }
  ],
  "focusHours": 1
}
```

**Réponse 200 :**

```json
{
  "suggestions": [
    {
      "id": "674abc123...",
      "userId": "507f1f77bcf86cd799439011",
      "type": "coffee",
      "message": "Want your usual coffee?",
      "confidence": 0.72,
      "status": "pending",
      "createdAt": "2026-02-24T...",
      "updatedAt": "2026-02-24T..."
    }
  ]
}
```

- **id** : à conserver pour l’appel **feedback** (c’est le `suggestionId`).
- **type** : `"coffee"` | `"leave_home"` | `"umbrella"` | `"break"`.
- **status** : toujours `"pending"` à la création.
- **confidence** : entre 0 et 1 (utilisable pour l’affichage ou le tri).

---

## 3. Récupérer les suggestions en attente du jour

### **GET** `/assistant/suggestions/:userId`

Retourne les suggestions **pending** créées aujourd’hui pour cet utilisateur (ex. après ouverture de l’écran Assistant).

**Paramètre d’URL :**  
- **userId** : ID de l’utilisateur.

**Réponse 200 :** tableau de suggestions (même forme que dans `POST /assistant/context`), triées par confiance décroissante.

```json
[
  {
    "id": "674abc123...",
    "userId": "507f1f77bcf86cd799439011",
    "type": "coffee",
    "message": "Want your usual coffee?",
    "confidence": 0.72,
    "status": "pending",
    "createdAt": "2026-02-24T...",
    "updatedAt": "2026-02-24T..."
  }
]
```

Le front peut afficher une carte par suggestion avec deux actions : **Accepter** et **Refuser**.

---

## 4. Accepter ou refuser une suggestion (détail)

### **POST** `/assistant/feedback`

À appeler **dès que** l’utilisateur clique sur « Accepter » ou « Refuser » (ou équivalent). Un seul appel par suggestion (la première action est enregistrée, les suivantes pour la même suggestion sont ignorées).

**Headers :**  
`Content-Type: application/json`  
`Authorization: Bearer <accessToken>` (si l’API est protégée)

**Body :**

| Champ        | Type   | Obligatoire | Description |
|-------------|--------|-------------|-------------|
| suggestionId | string | oui        | **id** de la suggestion (celui reçu dans `suggestions[].id`). |
| action       | string | oui        | **`"accepted"`** ou **`"dismissed"`**. |

**Valeurs de `action` :**

| Valeur      | Signification côté produit | Côté backend |
|------------|----------------------------|--------------|
| **accepted**  | L’utilisateur a accepté la suggestion (ex. « Oui » au café). | La suggestion passe en statut `accepted`, une entrée `interaction_logs` avec `action: "accepted"` est créée, le modèle d’habitudes est mis à jour. |
| **dismissed**  | L’utilisateur a refusé / fermé / ignoré la suggestion. | La suggestion passe en statut `dismissed`, une entrée `interaction_logs` avec `action: "dismissed"` est créée, le modèle d’habitudes est mis à jour. |

**Exemple – Accepter :**

```json
{
  "suggestionId": "674abc123...",
  "action": "accepted"
}
```

**Exemple – Refuser :**

```json
{
  "suggestionId": "674abc123...",
  "action": "dismissed"
}
```

**Réponse 200 :**

```json
{
  "ok": true
}
```

**Erreurs possibles :**

- **404** : `suggestionId` invalide ou suggestion supprimée.  
- **400** : body invalide (ex. `action` différent de `"accepted"` ou `"dismissed"`).  

Si la suggestion a déjà été traitée (déjà accepted ou dismissed), le backend ne renvoie pas d’erreur : il fait un no-op et répond **200** avec `{ "ok": true }`. Le front peut donc envoyer au plus un feedback par suggestion.

---

## 5. Règles côté frontend (obligatoires pour que le ML « apprenne »)

1. **Toujours envoyer le feedback** dès que l’utilisateur choisit Accepter ou Refuser. Ne pas se contenter de masquer la carte sans appeler l’API.
2. **Utiliser exactement** `"accepted"` ou `"dismissed"` (minuscules). Aucune autre valeur n’est acceptée.
3. **Envoyer une seule fois** par suggestion (pas de double clic qui enverrait deux fois le même feedback).
4. **Utiliser l’`id`** renvoyé par le backend (`suggestions[].id`) comme `suggestionId`. Ne pas inventer d’ID côté front.

---

## 6. Résumé des types de suggestions

| type         | Exemple de message                          |
|-------------|---------------------------------------------|
| coffee      | "Want your usual coffee?"                   |
| leave_home  | "You should leave now to arrive on time."   |
| umbrella    | "Rain is expected. Bring an umbrella."      |
| break       | "You've been focused for X hours. Take a break." |

Le ML utilise les **interaction_logs** (accept / dismiss) pour ajuster la probabilité de proposer à nouveau chaque type (ex. café à 10h le lundi). Plus l’utilisateur accepte ou refuse via le front, plus les prochaines suggestions sont personnalisées.

---

## 7. Exemple de flux UI (Flutter / autre)

1. **Écran Assistant ouvert**  
   - Option A : Appeler **POST** `/assistant/context` avec le contexte actuel (heure, lieu, météo, etc.) → afficher les `suggestions` retournées.  
   - Option B : Appeler **GET** `/assistant/suggestions/:userId` pour afficher les suggestions déjà générées et encore **pending**.

2. **Pour chaque suggestion affichée**  
   - Bouton « Accepter » (ou équivalent) → **POST** `/assistant/feedback` avec `suggestionId: suggestion.id`, `action: "accepted"`.  
   - Bouton « Refuser » / « Non » / « Fermer » → **POST** `/assistant/feedback` avec `suggestionId: suggestion.id`, `action: "dismissed"`.

3. **Après envoi du feedback**  
   - Retirer la carte de la liste (ou la marquer comme traitée) pour éviter un second envoi.  
   - Pas besoin de rappeler GET suggestions pour mettre à jour le statut si tu gères l’état local.

---

## 8. Checklist intégration frontend

- [ ] **POST** `/assistant/context` : body avec `userId`, `time`, `location`, `weather`, `focusHours`, optionnellement `meetings`.
- [ ] **GET** `/assistant/suggestions/:userId` : afficher les suggestions **pending** (id, type, message, confidence).
- [ ] Pour chaque suggestion : deux actions claires (Accepter / Refuser).
- [ ] **POST** `/assistant/feedback` avec `suggestionId` = `suggestion.id` et `action` = `"accepted"` ou `"dismissed"` **dès** le clic.
- [ ] Un seul feedback par suggestion (désactiver le bouton ou retirer la carte après envoi).
- [ ] Gestion des erreurs 404/400 (suggestion introuvable ou body invalide).

Si tous les points sont respectés, le backend et le ML disposeront de toutes les données nécessaires pour personnaliser les suggestions (y compris le café) selon les acceptations et refus réels.
