# Prompt Flutter – Consommation de l’API Auth Backend

**À copier-coller** pour un agent / développeur Flutter ou pour guider l’implémentation.

---

## Contexte

Une app Flutter a déjà les écrans **Sign Up** (Full Name, Email, Password, Confirm Password, Sign Up, Google, Apple, Sign In) et **Sign In / Welcome Back** (Email, Password, Sign In, Forgot Password?, Google, Apple, Sign Up).  
Ces écrans utilisent actuellement un **MockAuthRemoteDataSource** (ou équivalent).  
Il faut **remplacer le mock par la consommation réelle** d’un backend NestJS exposant une API REST d’authentification.

---

## Backend (déjà en place)

- **Base URL** : en dev `http://localhost:3000` (émulateur Android : `http://10.0.2.2:3000`), en prod l’URL du backend (ex. Railway).
- **CORS** : activé côté backend, pas de blocage pour Flutter.

### Routes à consommer

| Action Flutter | Méthode HTTP | Route | Body (JSON) | Réponse succès |
|----------------|--------------|--------|-------------|----------------|
| Inscription | POST | `/auth/register` | `name`, `email`, `password` | 201 : `{ "user": { "id", "name", "email" }, "accessToken": "..." }` |
| Connexion (email/mdp) | POST | `/auth/login` ou `/auth/signin` | `email`, `password` | 200 : même forme que ci‑dessus |
| Réinitialisation MDP | POST | `/auth/reset-password` | `email` | 200 : `{ "message": "..." }` |
| Connexion Google | POST | `/auth/google` | `idToken` (token Google côté client) | 200 : user + accessToken |
| Connexion Apple | POST | `/auth/apple` | `identityToken`, optionnel `user` (string JSON Apple) | 200 : user + accessToken |
| Profil (utilisateur connecté) | GET | `/auth/me` | — | 200 : `{ "id", "name", "email" }` |

- Pour **GET /auth/me** : envoyer le header **`Authorization: Bearer <accessToken>`**.
- Toutes les réponses d’erreur ont la forme : **`{ "statusCode": number, "message": string | string[] }`** (ex. 400, 401, 409).

---

## Modèle User côté Flutter

Le backend renvoie un objet **user** avec uniquement : **`id`**, **`name`**, **`email`** (pas de mot de passe, pas d’IDs sociaux).

```dart
// Exemple attendu
class UserModel {
  final String id;
  final String name;
  final String email;

  UserModel({ required this.id, required this.name, required this.email });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
    );
  }
}
```

---

## Réponse Auth (register / login / google / apple)

Format commun :

```json
{
  "user": { "id": "...", "name": "...", "email": "..." },
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

```dart
// Exemple
class AuthResponse {
  final UserModel user;
  final String accessToken;
  AuthResponse({ required this.user, required this.accessToken });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      user: UserModel.fromJson(Map<String, dynamic>.from(json['user'] ?? {})),
      accessToken: json['accessToken'] as String? ?? '',
    );
  }
}
```

---

## Objectifs à réaliser dans Flutter

1. **Créer ou adapter un `AuthRemoteDataSource`** (ou équivalent) qui :
   - Prend une **base URL** configurable (dev / prod).
   - Appelle les routes ci‑dessus avec **http** (ou **dio**) en **POST**/ **GET**.
   - Parse le JSON en `AuthResponse` ou `UserModel` selon la route.
   - En cas d’erreur HTTP (4xx/5xx), lire `message` dans le body et lever une exception lisible (ex. `Exception(message)` ou une `AuthException`).

2. **Après un register / login / google / apple réussi** :
   - Stocker **`accessToken`** (et éventuellement `user`) avec **shared_preferences** ou **flutter_secure_storage**.
   - Mettre à jour l’état d’auth (Bloc/Cubit/Provider) pour considérer l’utilisateur comme connecté.

3. **Pour les requêtes protégées** (ex. GET /auth/me) :
   - Récupérer le token stocké et l’envoyer dans le header **`Authorization: Bearer <accessToken>`**.

4. **Brancher les écrans existants** :
   - **Sign Up** : appel à `POST /auth/register` avec les champs du formulaire ; en cas de 409, afficher “Email déjà utilisé”.
   - **Sign In** : appel à `POST /auth/login` (ou `/auth/signin`) ; en cas de 401, afficher “Email ou mot de passe incorrect”.
   - **Forgot Password?** : appel à `POST /auth/reset-password` avec l’email ; afficher un message de succès (ex. “Si cet email est enregistré, vous recevrez des instructions”).
   - **Google Account** : après récupération de l’`idToken` Google côté Flutter, appel à `POST /auth/google` avec `{ "idToken": "..." }`.
   - **Apple Account** : après récupération de l’`identityToken` (et optionnellement `user`) côté Flutter, appel à `POST /auth/apple` avec `{ "identityToken": "...", "user"?: "..." }`.

5. **Gestion d’erreurs** :
   - Afficher les messages du backend quand ils sont disponibles (`message` dans la réponse JSON).
   - Pour les erreurs réseau (timeout, pas de connexion), afficher un message générique (ex. “Vérifiez votre connexion”).

---

## Récapitulatif en une phrase

**“Connecte l’app Flutter au backend NestJS : remplace le MockAuthRemoteDataSource par des appels HTTP réels vers POST /auth/register, /auth/login (ou /auth/signin), /auth/reset-password, /auth/google, /auth/apple et GET /auth/me (avec Authorization: Bearer &lt;token&gt;), en stockant l’accessToken après login/register et en utilisant les modèles User (id, name, email) et AuthResponse (user + accessToken).”**

---

Tu peux copier tout ce document (ou le résumé ci‑dessus) dans ton projet Flutter ou le donner comme prompt pour implémenter la consommation de l’API.
