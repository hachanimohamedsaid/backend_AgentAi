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

### Réinitialisation mot de passe
- **POST** `/auth/reset-password`
- Body : `{ "email": "string" }`
- Réponse 200 : `{ "message": "string" }`

### Connexion Google
- **POST** `/auth/google`
- Body : `{ "idToken": "string" }`
- Réponse 200 : `{ "user": { "id", "name", "email" }, "accessToken": "string" }`

### Connexion Apple
- **POST** `/auth/apple`
- Body : `{ "identityToken": "string", "user"?: "string" }`
- Réponse 200 : `{ "user": { "id", "name", "email" }, "accessToken": "string" }`

### Utilisateur connecté (protégé JWT)
- **GET** `/auth/me`
- Header : `Authorization: Bearer <accessToken>`
- Réponse 200 : `{ "id", "name", "email" }`

---

## Utilitaires

- **GET** `/health` → `{ "status": "ok", "mongodb": "connected" }`
- **GET** `/` → `"Hello World!"`

---

Toutes les réponses d’erreur ont la forme : `{ "statusCode": number, "message": string | string[], "error"?: string }`.
