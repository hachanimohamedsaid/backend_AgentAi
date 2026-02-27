# Assistant – Notifications intelligentes (documentation détaillée pour le frontend)

Ce document explique comment le frontend (Flutter, web, etc.) doit **appeler l’endpoint de notifications** de l’assistant.  
Objectif : transformer des **signaux** (données backend / ML / Mongo) en **notifications prêtes à afficher**, avec textes professionnels et actions.

---

## 1. Base URL

- **Prod :** `https://<ton-backend>.railway.app` (ou ton URL backend réelle)
- **Local :** `http://localhost:3000`

Tous les endpoints ci‑dessous sont préfixés par **`/assistant`**.  
Les endpoints protégés utilisent le header **`Authorization: Bearer <accessToken>`** (même logique que le reste de l’API).

---

## 2. Vue d’ensemble du flux

1. Le backend + ML agrègent des données utilisateur (meetings, mails, trafic, focus, etc.) et construisent une liste de **signaux normalisés**.
2. Le frontend appelle **`POST /assistant/notifications`** en envoyant ces `signals[]` (ou une partie).
3. Le backend:
   - appelle **OpenAI** si une clé `OPENAI_API_KEY` est configurée → génération de notifications intelligentes multilingues,
   - sinon génère des **notifications de fallback** basées sur des templates.
4. Le backend renvoie un **tableau de notifications** déjà formatées (`title`, `message`, `actions`, `priority`, etc.) que le front affiche sous forme de cartes.

Pour le frontend, **le contrat de réponse est le même** que OpenAI soit activé ou non.

---

## 3. Endpoint principal

### 3.1. `POST /assistant/notifications`

**But :** générer une liste de notifications à partir de signaux structurés.

#### Headers

- `Content-Type: application/json`
- `Authorization: Bearer <accessToken>` (recommandé si auth activée)

#### Body – structure générale

```json
{
  "userId": "USER_ID_OPTIONNEL",
  "locale": "fr-TN",
  "timezone": "Africa/Tunis",
  "tone": "professional",
  "maxItems": 5,
  "signals": [
    {
      "signalType": "MEETING_SOON",
      "payload": {
        "title": "Team standup",
        "startsInMin": 15,
        "location": "Conference Room A",
        "meetingId": "m_456"
      },
      "scores": {
        "priority": 0.92,
        "confidence": 0.88
      },
      "occurredAt": "2026-02-27T08:45:00Z",
      "source": "backend"
    }
  ]
}
```

#### 3.1.1. Détail des champs racine

| Champ      | Type    | Obligatoire | Description |
|-----------|---------|-------------|-------------|
| `userId`  | string  | **non**     | Identifiant utilisateur. Si absent, le backend essaie de le déduire du JWT (`userId` \| `id` \| `sub`). |
| `locale`  | string  | non         | Locale de l’utilisateur, ex. `fr-TN`, `fr-FR`, `en-US`, `ar-TN`. Sert à choisir la langue (`fr`, `en`, `ar`). Défaut : `fr-TN`. |
| `timezone`| string  | non         | Fuseau horaire IANA (ex. `Africa/Tunis`). Défaut : `Africa/Tunis`. |
| `tone`    | string  | non         | Ton du message : **`"professional"`** (défaut), `"friendly"`, `"concise"`. |
| `maxItems`| number  | non         | Nombre max de notifications retournées (entre 1 et 20). Défaut : 5. |
| `signals` | array   | **oui**     | Liste de signaux (voir ci‑dessous). |

#### 3.1.2. Structure d’un `signal`

```json
{
  "signalType": "MEETING_SOON",
  "payload": {
    "...": "..."
  },
  "scores": {
    "priority": 0.9,
    "confidence": 0.8
  },
  "occurredAt": "2026-02-27T08:45:00Z",
  "source": "backend"
}
```

| Champ        | Type   | Obligatoire | Description |
|-------------|--------|-------------|-------------|
| `signalType`| string | **oui**     | Type de signal (événement) connu par le backend / ML. Ex : `MEETING_SOON`, `EMAIL_REQUIRES_RESPONSE`, `TRAFFIC_ALERT`, `BREAK_SUGGESTED`, `WEEKLY_SUMMARY_READY`, etc. |
| `payload`   | object | non         | Données associées au signal (titre réunion, heure, route, etc.). Structure libre mais **stabilisée par type** (voir templates conseillés). |
| `scores`    | object | non         | Indicateurs du ML: `priority` (0–1), `confidence` (0–1). |
| `occurredAt`| string | non         | Date/heure de l’événement au format ISO‑8601. |
| `source`    | string | non         | Source du signal (`backend`, `ml`, `mongo`, etc.). |

---

## 4. SignalTypes supportés (templates de base)

Le backend contient des **templates de fallback** pour certains `signalType`.  
OpenAI peut enrichir ces textes, mais en cas d’erreur ou si `OPENAI_API_KEY` est absent, ces templates sont utilisés.

### 4.1. `MEETING_SOON`

Signal qu’une réunion va commencer bientôt.

**Payload recommandé :**

```json
{
  "title": "Team standup",
  "startsInMin": 15,
  "location": "Conference Room A",
  "meetingId": "m_456"
}
```

Exemple de notification (FR) :

```json
{
  "title": "Réunion imminente",
  "message": "Team standup dans 15 minutes. Lieu : Conference Room A.",
  "category": "Work",
  "priority": "high",
  "actions": [
    { "label": "Voir les détails", "action": "OPEN_MEETING", "data": { "meetingId": "m_456" } },
    { "label": "Rappeler plus tard", "action": "SNOOZE", "data": { "minutes": 10 } }
  ],
  "meta": {
    "dedupeKey": "sig:MEETING_SOON:...",
    "expiresAt": "2026-02-27T09:35:00+01:00"
  }
}
```

### 4.2. `EMAIL_REQUIRES_RESPONSE`

Signal qu’un email important attend une réponse.

**Payload recommandé :**

```json
{
  "subject": "Q1 report deadline",
  "from": "Sarah",
  "emailId": "e_123"
}
```

Exemple de notification :

```json
{
  "title": "Email nécessite une réponse",
  "message": "Q1 report deadline — De : Sarah",
  "category": "Work",
  "priority": "high",
  "actions": [
    { "label": "Répondre", "action": "REPLY_EMAIL", "data": { "emailId": "e_123" } }
  ],
  "meta": { "dedupeKey": "sig:EMAIL_REQUIRES_RESPONSE:..." }
}
```

### 4.3. `TRAFFIC_ALERT`

Signal trafic important sur le trajet de l’utilisateur.

**Payload recommandé :**

```json
{
  "route": "Home → Office",
  "destination": "Office",
  "etaMin": 35,
  "extraDelayMin": 15
}
```

Exemple de notification :

```json
{
  "title": "Alerte trafic",
  "message": "Trafic dense sur votre trajet Home → Office.",
  "category": "Travel",
  "priority": "medium",
  "actions": [
    { "label": "Voir le trajet", "action": "OPEN_ROUTE", "data": { "route": "Home → Office" } }
  ],
  "meta": { "dedupeKey": "sig:TRAFFIC_ALERT:..." }
}
```

### 4.4. `BREAK_SUGGESTED`

Signal que l’utilisateur a travaillé longtemps et devrait faire une pause.

**Payload recommandé :**

```json
{
  "focusHours": 4
}
```

Exemple :

```json
{
  "title": "Pause suggérée",
  "message": "Vous travaillez depuis 4 heures. Prenez une courte pause.",
  "category": "Personal",
  "priority": "low",
  "actions": [
    { "label": "Démarrer un minuteur", "action": "START_BREAK_TIMER", "data": { "minutes": 10 } }
  ],
  "meta": { "dedupeKey": "sig:BREAK_SUGGESTED:..." }
}
```

### 4.5. `WEEKLY_SUMMARY_READY`

Signal que le résumé hebdomadaire de productivité est disponible.

Payload minimal :

```json
{}
```

Exemple :

```json
{
  "title": "Résumé hebdomadaire prêt",
  "message": "Vos statistiques de productivité sont disponibles.",
  "category": "General",
  "priority": "low",
  "actions": [
    { "label": "Ouvrir le résumé", "action": "OPEN_WEEKLY_SUMMARY" }
  ],
  "meta": { "dedupeKey": "sig:WEEKLY_SUMMARY_READY:..." }
}
```

---

## 5. Format de la réponse

Le backend renvoie **toujours** un **tableau de notifications** :

```json
[
  {
    "id": "openai_f3b2c1d4-...",
    "title": "Réunion imminente",
    "message": "Team standup dans 15 minutes. Lieu : Conference Room A.",
    "category": "Work",
    "priority": "high",
    "actions": [
      { "label": "Voir les détails", "action": "OPEN_MEETING", "data": { "meetingId": "m_456" } },
      { "label": "Rappeler plus tard", "action": "SNOOZE", "data": { "minutes": 10 } }
    ],
    "meta": {
      "dedupeKey": "sig:MEETING_SOON:abcd1234ef56",
      "expiresAt": "2026-02-27T09:35:00+01:00"
    }
  }
]
```

### 5.1. Champs de `notification`

| Champ       | Type   | Description |
|------------|--------|-------------|
| `id`       | string | Identifiant unique de la notification. Peut commencer par `openai_` (généré par OpenAI) ou `fallback_`. |
| `title`    | string | Titre court de la notification (ligne principale de la carte). |
| `message`  | string | Texte descriptif (1–2 phrases). |
| `category` | string | Catégorie logique : `"Work"`, `"Personal"`, `"Travel"`, `"General"`. |
| `priority` | string | Niveau de priorité : `"low"`, `"medium"`, `"high"`, `"urgent"`. |
| `actions`  | array  | Liste de boutons possibles. Voir ci‑dessous. |
| `meta`     | object | Métadonnées : `dedupeKey`, `expiresAt`… |

### 5.2. `actions[]`

Chaque action représente un **bouton** dans l’UI.

```json
{
  "label": "Voir les détails",
  "action": "OPEN_MEETING",
  "data": {
    "meetingId": "m_456"
  }
}
```

| Champ   | Type   | Description |
|--------|--------|-------------|
| `label`| string | Texte du bouton (affiché tel quel). |
| `action`| string| Code technique manipulé par le frontend (`OPEN_MEETING`, `SNOOZE`, `REPLY_EMAIL`, `OPEN_ROUTE`, etc.). |
| `data` | object | Données optionnelles pour naviguer / exécuter l’action (ids, minutes, route…). |

### 5.3. `meta`

```json
{
  "dedupeKey": "sig:MEETING_SOON:abcd1234ef56",
  "expiresAt": "2026-02-27T09:35:00+01:00"
}
```

| Champ       | Type   | Description |
|------------|--------|-------------|
| `dedupeKey`| string | Clé **stable** utilisée pour éviter d’afficher plusieurs fois la même notification (voir §7). |
| `expiresAt`| string | Date/heure ISO où la notification n’a plus de sens (optionnel). Le front peut l’utiliser pour cacher les anciennes notifs. |

---

## 6. Comportement OpenAI vs Fallback

- Si **`OPENAI_API_KEY` est configuré côté backend** :
  - Le service appelle **OpenAI** via `OpenAiNotificationClient`.
  - OpenAI reçoit les `signals` + profil utilisateur + préférences ML, puis renvoie une liste de notifications au format JSON.
  - Le backend nettoie / valide le JSON et renvoie la liste au frontend.

- Si **OpenAI n’est pas disponible** (clé manquante ou erreur réseau) :
  - Le backend utilise les **templates de fallback** décrits dans la section 4.
  - Le format de réponse reste identique pour le frontend.

Le frontend n’a donc **pas besoin de gérer deux cas différents** : il affiche simplement la liste de notifications reçue.

---

## 7. Gestion des doublons côté frontend (dedupeKey)

Pour éviter de spammer l’utilisateur avec les mêmes cartes, le backend génère pour chaque notification un **`meta.dedupeKey`** stable :

- Exemple : `sig:MEETING_SOON:abcd1234ef56`
- Cette clé est dérivée de `signalType` + `payload` (hachés).

### Recommandation UI

1. Maintenir en mémoire (ou en cache disque) un **ensemble des `dedupeKey` déjà affichées**.
2. Au moment d’afficher les nouvelles notifications :
   - Pour chaque notification :
     - si `dedupeKey` est déjà connue → ignorer / ne pas réafficher,
     - sinon → afficher et ajouter la clé dans l’ensemble.
3. Optionnel : purger l’ensemble régulièrement (par ex. clés plus vieilles que X jours).

---

## 8. Exemple d’intégration Flutter (pseudo‑code)

```dart
class AssistantNotification {
  final String id;
  final String title;
  final String message;
  final String category;
  final String priority;
  final List<AssistantNotificationAction> actions;
  final String dedupeKey;
  final String? expiresAt;

  AssistantNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.category,
    required this.priority,
    required this.actions,
    required this.dedupeKey,
    this.expiresAt,
  });

  factory AssistantNotification.fromJson(Map<String, dynamic> json) {
    final meta = (json['meta'] as Map<String, dynamic>? ?? {});
    return AssistantNotification(
      id: json['id'] as String,
      title: json['title'] as String,
      message: json['message'] as String,
      category: json['category'] as String,
      priority: json['priority'] as String,
      actions: (json['actions'] as List<dynamic>? ?? [])
          .map((e) => AssistantNotificationAction.fromJson(e))
          .toList(),
      dedupeKey: meta['dedupeKey'] as String,
      expiresAt: meta['expiresAt'] as String?,
    );
  }
}

class AssistantNotificationAction {
  final String label;
  final String action;
  final Map<String, dynamic>? data;

  AssistantNotificationAction({
    required this.label,
    required this.action,
    this.data,
  });

  factory AssistantNotificationAction.fromJson(Map<String, dynamic> json) {
    return AssistantNotificationAction(
      label: json['label'] as String,
      action: json['action'] as String,
      data: json['data'] as Map<String, dynamic>?,
    );
  }
}

Future<List<AssistantNotification>> fetchAssistantNotifications() async {
  final uri = Uri.parse('$baseUrl/assistant/notifications');

  final response = await http.post(
    uri,
    headers: {
      'Content-Type': 'application/json',
      if (jwt != null) 'Authorization': 'Bearer $jwt',
    },
    body: jsonEncode({
      // userId peut être omis si déjà dans le JWT
      'locale': 'fr-TN',
      'timezone': 'Africa/Tunis',
      'tone': 'professional',
      'maxItems': 5,
      'signals': [
        {
          'signalType': 'MEETING_SOON',
          'payload': {
            'title': 'Team standup',
            'startsInMin': 15,
            'location': 'Conference Room A',
            'meetingId': 'm_456',
          },
        },
      ],
    }),
  );

  if (response.statusCode != 200 && response.statusCode != 201) {
    throw Exception('Failed to load assistant notifications');
  }

  final List<dynamic> jsonList = jsonDecode(response.body);
  return jsonList
      .map((e) => AssistantNotification.fromJson(e as Map<String, dynamic>))
      .toList();
}
```

---

## 9. Checklist intégration frontend

- [ ] Appeler **`POST /assistant/notifications`** avec `signals[]` pertinents (meeting, email, trafic, etc.).
- [ ] Passer `locale` correcte (`fr-TN`, `en-US`, `ar-TN`, …) pour obtenir la bonne langue.
- [ ] Utiliser `maxItems` pour limiter le nombre de cartes affichées.
- [ ] Mapper :
  - `title` → titre de la carte,
  - `message` → sous‑titre / description,
  - `category` / `priority` → couleur, icône, ordre.
- [ ] Afficher les boutons à partir de `actions[]` et router en fonction de `action` (`OPEN_MEETING`, `SNOOZE`, `REPLY_EMAIL`, `OPEN_ROUTE`, `OPEN_WEEKLY_SUMMARY`, etc.).
- [ ] Utiliser `meta.dedupeKey` pour éviter de réafficher plusieurs fois la même notification.
- [ ] (Optionnel) Tenir compte de `expiresAt` pour ne plus afficher les cartes périmées.

Si tous ces points sont respectés, le frontend bénéficiera de notifications **dynamiques, personnalisées et propres** générées à partir des données backend, ML et OpenAI, tout en restant robuste même en cas de panne ou d’absence de clé OpenAI.

