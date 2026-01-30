# Contrat API Backend – pour le client Flutter

Base URL : `https://ton-backend.up.railway.app` ou `http://localhost:3000`

---

## Auth

### Inscription
- **POST** `/auth/register`
- Body : `{ "name": "string", "email": "string", "password": "string" }`
- Réponse 201 : `{ "user": { "id", "name", "email" }, "accessToken": "string" }`
- Erreur 409 : email déjà utilisé

### Connexion (email / mot de passe)
- **POST** `/auth/login` ou **POST** `/auth/signin`
- Body : `{ "email": "string", "password": "string" }`
- Réponse 200 : `{ "user": { "id", "name", "email" }, "accessToken": "string" }`
- Erreur 401 : identifiants incorrects

### Réinitialisation mot de passe (demande de lien)
- **POST** `/auth/reset-password`
- Body : `{ "email": "string" }`
- Réponse 200 : `{ "message": "string" }`
- Le backend envoie un email (SendGrid) avec un lien contenant `?token=xxx`. Lien valide 1h.

### Définir le nouveau mot de passe (après clic sur le lien)
- **POST** `/auth/reset-password/confirm`
- Body : `{ "token": "string", "newPassword": "string" }` (token = paramètre du lien reçu par email)
- Réponse 200 : `{ "message": "string" }`
- Erreur 400 : token invalide ou expiré

### Connexion Google
- **POST** `/auth/google`
- Body : `{ "idToken": "string" }`
- Réponse 200 : `{ "user": { "id", "name", "email" }, "accessToken": "string" }`

### Connexion Apple
- **POST** `/auth/apple`
- Body : `{ "identityToken": "string", "user"?: "string" }`
- Réponse 200 : `{ "user": { "id", "name", "email" }, "accessToken": "string" }`

### Profil utilisateur connecté (protégé JWT) – données dynamiques pour la page Profile
- **GET** `/auth/me`
- Header : `Authorization: Bearer <accessToken>`
- Réponse 200 :
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "role": "string | null",
  "location": "string | null",
  "phone": "string | null",
  "birthDate": "string | null",
  "bio": "string | null",
  "createdAt": "string | null",
  "conversationsCount": 0,
  "daysActive": 0,
  "hoursSaved": 0
}
```
- `role` : libellé affiché sous le nom (ex. "AI Enthusiast"). `null` si non renseigné.
- `location` : ville/région (ex. "San Francisco, CA"). `null` si non renseigné.
- `phone` : numéro de téléphone (ex. "+1 (555) 123-4567"). `null` si non renseigné.
- `birthDate` : date de naissance au format "YYYY-MM-DD". `null` si non renseigné.
- `bio` : bio / rôle (ex. "AI Enthusiast | Tech Explorer"). `null` si non renseigné.
- `createdAt` : date d’inscription au format ISO (ex. "2024-01-15T…"). À afficher en "Joined January 2024".
- `daysActive` : calculé côté backend (jours depuis l’inscription).
- `conversationsCount` et `hoursSaved` : valeurs stockées (mise à jour par l’app si besoin).
- Après login, appeler **GET** `/auth/me` avec le `accessToken` et afficher ces champs sur la page Profile (plus de données statiques).

### Mise à jour du profil (protégé JWT)
- **PATCH** `/auth/me`
- Header : `Authorization: Bearer <accessToken>`
- Body (tous les champs optionnels) : `{ "name"?, "role"?, "location"?, "phone"?, "birthDate"?, "bio"?, "conversationsCount"?, "hoursSaved"? }`
- Réponse 200 : `{ "message": "Profile updated" }`

### Changer le mot de passe (protégé JWT)
- **POST** `/auth/change-password`
- Header : `Authorization: Bearer <accessToken>`
- Body : `{ "currentPassword": "string", "newPassword": "string" }` (newPassword min. 8 caractères)
- Réponse 200 : `{ "message": "Password updated successfully" }`
- Erreur 401 : mot de passe actuel incorrect ou token invalide
- Erreur 400 : validation (ex. nouveau mot de passe trop court)

---

## Utilitaires

- **GET** `/health` → `{ "status": "ok", "mongodb": "connected" }`
- **GET** `/` → `"Hello World!"`

---

Toutes les réponses d’erreur ont la forme : `{ "statusCode": number, "message": string | string[], "error"?: string }`.
