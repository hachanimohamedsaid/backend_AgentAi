## 8. Assistant / suggestions (NestJS + Mongo + OpenAI)

> À copier/coller tel quel dans la doc backend (ou à envoyer au dev backend).

### 8.1. Variables d’environnement

À ajouter en plus de la config existante :

```bash
# Suggestions contextuelles (AVA)
OPENAI_API_KEY=sk-proj-...
OPENAI_SUGGESTION_MODEL=gpt-4o-mini   # optionnel, défaut gpt-4o-mini
```

---

### 8.2. Endpoint à exposer

- **Route** : `POST /assistant/context`
- **But** : générer 3 questions de suggestion personnalisées pour un utilisateur, à partir de ses données MongoDB + contexte (heure, météo, focus).

**Requête (envoyée par Flutter)** :

```json
{
  "userId": "USER_ID",
  "time": "04:07",              // HH:mm local
  "location": "home",           // "home" | "work" | "outside"
  "weather": "sunny",           // "sunny" | "cloudy" | "rain"
  "focusHours": 1,              // durée de focus approx en heures
  "meetings": [                 // optionnel
    { "title": "Daily standup", "time": "09:30" }
  ]
}
```

> Idéalement, le backend recalcule `userId` via le JWT si le header `Authorization: Bearer` est présent.

**Réponse (vers Flutter) – tableau de 0 à 3 questions** :

```json
[
  {
    "id": "ctx_1_finance",
    "type": "finance",          // "finance" | "email" | "project" | "focus" | "wellness" | "other"
    "message": "Would you like to review your February expenses and set a savings target?",
    "confidence": 0.9
  },
  {
    "id": "ctx_2_email",
    "type": "email",
    "message": "Do you want to clear the emails that require action now?",
    "confidence": 0.85
  },
  {
    "id": "ctx_3_project",
    "type": "project",
    "message": "Would you like to plan next steps for your accepted e‑commerce project?",
    "confidence": 0.88
  }
]
```

- `message` doit être une question (terminée par `?`), courte et professionnelle.
- `confidence` : score de `0.0` à `1.0`.

---

### 8.3. Ce que le backend doit faire (pipeline)

Pour chaque appel `POST /assistant/context` :

#### 1) Identifier l’utilisateur

- À partir de `userId` (et/ou du JWT).
- Charger son profil Mongo (`users` / `profiles`) : au minimum `name`, `role`, `bio`, `location`.

#### 2) Récupérer les données MongoDB de cet utilisateur

Lire les collections suivantes (ou équivalents) :

- **emails** :
  - derniers emails importants (ex. 10 derniers),
  - avec `tag = informational` ou `requires_action`.
- **transactions / finance** :
  - revenus et dépenses du mois courant,
  - `savingsRate`,
  - top 3 vendors par montant.
- **projects / proposals** :
  - nombre de propositions `pending`, `accepted`, `rejected`,
  - titres des projets récents (surtout ceux acceptés).
- **goals** :
  - objectifs actifs,
  - `%` d’avancement,
  - deadlines proches.
- **(Optionnel)** historique de feedback sur les suggestions (types souvent acceptés / refusés).

#### 3) Construire un résumé structuré

Construire un objet interne de ce type :

```json
{
  "profile": {
    "name": "Mohamed",
    "role": "Freelance web developer",
    "bio": "Travaille sur des projets e‑commerce et SaaS."
  },
  "appDataSummary": {
    "emailsSummary": "3 emails importants aujourd'hui, dont 1 'requires action' (KYC update).",
    "financeSummary": "Février 2026: 500$ de revenus, 690.5$ de dépenses, savings rate -38.1%. Top vendors: Shell, Sonelgaz, Amazon.",
    "projectsSummary": "3 propositions de travail acceptées (dont un site e‑commerce), 0 en attente, 0 rejetée.",
    "goalsSummary": "Objectifs: améliorer la situation financière, développer l'activité freelance, structurer les projets clients."
  },
  "behaviorSummary": {
    "timeOfDay": "04:07",
    "focusHours": 1,
    "location": "home",
    "weather": "sunny"
  },
  "learnedPreferences": "User tends to accept: focus, finance. User tends to refuse: late-night work."
}
```

- Chaque `...Summary` doit tenir en **1–2 phrases max** pour ne pas noyer le modèle.
- `learnedPreferences` peut venir :
  - de Mongo,
  - ou d’une autre source (log de feedback).

#### 4) Appeler OpenAI (depuis le backend, jamais depuis Flutter)

**System prompt (exemple à utiliser)** :

```text
You are AVA, a professional AI assistant that generates SHORT, ACTIONABLE QUESTIONS to help a single user make better decisions.
You ALWAYS respond with exactly 3 suggestions, each as a POLITE QUESTION (ending with "?"), in clear, simple language (French, English or Arabic/Tunisian, same as the input summaries).

CONTEXT YOU RECEIVE (JSON in the user message):
- profile: { name, role, bio }
- appDataSummary:
  - emailsSummary: key emails and whether they are informational or require action
  - financeSummary: income, expenses, savings rate, top vendors, recent anomalies
  - projectsSummary: ongoing / accepted / pending work proposals
  - goalsSummary: personal or business goals, deadlines, current progress
- behaviorSummary: focus time, time in app, time of day, location, weather
- learnedPreferences: what this user tends to accept or refuse in past suggestions

PERSONALIZATION:
- Use the user's profile (name, role, bio) to match their context and tone.
- If learnedPreferences is provided, favor suggestion types and themes the user has accepted before; avoid themes they usually refuse.
- Each question must cover a DIFFERENT angle (e.g. 1) focus / well-being, 2) finance / spending, 3) projects / emails / priorities).
- Be realistic: only propose actions that make sense right now given the data.
- You may use the user's first name sometimes if provided, but not in every question.

OUTPUT FORMAT:
Return ONLY a JSON array of exactly 3 objects, no extra text:
[
  {
    "type": "focus" | "finance" | "email" | "project" | "wellness" | "other",
    "message": "Your question here?",
    "confidence": 0.0-1.0
  },
  ...
]

Each "message" MUST be a single, professional question ending with "?".
```

**User message envoyé à OpenAI** :

```text
Here is the current user context as JSON:
{ ...objet profile/appDataSummary/behaviorSummary/learnedPreferences... }

Generate exactly 3 personalized suggestion questions as defined in the system prompt.
```

#### 5) Parser la réponse (JSON array)

- Parser la réponse OpenAI comme un tableau :
  - `[ { "type", "message", "confidence" }, ... ]`
- Forcer localement si besoin :
  - `message` finit bien par `?`.
  - `confidence` est borné entre `0.0` et `1.0`.

#### 6) Retourner les questions à Flutter

- Retourner tel quel le tableau :

```json
[
  { "id": "ctx_1_finance", "type": "finance", "message": "...?", "confidence": 0.9 },
  { "id": "ctx_2_email",   "type": "email",   "message": "...?", "confidence": 0.85 },
  { "id": "ctx_3_project", "type": "project", "message": "...?", "confidence": 0.88 }
]
```

- Optionnel : générer côté backend un `id` pour chaque suggestion (`ctx_1_finance`, etc.).
- En cas d’erreur, retourner un **tableau vide** `[]` (le front gère l’état “pas de suggestion”).

---

Avec cette doc, le dev backend sait exactement :

- quelles données Mongo charger,
- quel format de résumé construire,
- quel prompt utiliser,
- quel format renvoyer au front pour les suggestions sous forme de questions.

