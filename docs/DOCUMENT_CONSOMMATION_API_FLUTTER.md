# Document de consommation API – Flutter

Document de référence pour connecter l’application Flutter au backend NestJS (auth, reset password, etc.).

---

## 1. Configuration

### Base URL

```dart
// Développement
const String baseUrl = 'http://localhost:3000';

// Émulateur Android : utiliser 10.0.2.2 au lieu de localhost
// const String baseUrl = 'http://10.0.2.2:3000';

// Production (ex. Railway)
const String baseUrl = 'https://ton-backend.up.railway.app';
```

### Headers communs

- **Content-Type** : `application/json` pour les requêtes avec body.
- **Authorization** : `Bearer <accessToken>` pour les routes protégées (ex. `GET /auth/me`).

---

## 2. Modèles

### UserModel

Le backend renvoie un utilisateur avec **id**, **name**, **email** uniquement.

```dart
class UserModel {
  final String id;
  final String name;
  final String email;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
      };
}
```

### AuthResponse

Réponse des routes : register, login, google, apple.

```dart
class AuthResponse {
  final UserModel user;
  final String accessToken;

  AuthResponse({ required this.user, required this.accessToken });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      user: UserModel.fromJson(
        Map<String, dynamic>.from(json['user'] ?? {}),
      ),
      accessToken: json['accessToken'] as String? ?? '',
    );
  }
}
```

---

## 3. Endpoints et exemples Dart

### 3.1 Inscription – POST /auth/register

| Élément   | Valeur |
|----------|--------|
| Méthode  | POST   |
| URL      | `$baseUrl/auth/register` |
| Body     | `{ "name": "string", "email": "string", "password": "string" }` |
| Succès   | 201 → `AuthResponse` |
| Erreur   | 409 = email déjà utilisé ; 400 = validation |

```dart
Future<AuthResponse> register({
  required String name,
  required String email,
  required String password,
}) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/register'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'name': name,
      'email': email,
      'password': password,
    }),
  );
  if (res.statusCode == 201) {
    return AuthResponse.fromJson(jsonDecode(res.body));
  }
  throw _parseError(res);
}
```

---

### 3.2 Connexion – POST /auth/login ou /auth/signin

| Élément   | Valeur |
|----------|--------|
| Méthode  | POST   |
| URL      | `$baseUrl/auth/login` ou `$baseUrl/auth/signin` |
| Body     | `{ "email": "string", "password": "string" }` |
| Succès   | 200 → `AuthResponse` |
| Erreur   | 401 = identifiants incorrects |

```dart
Future<AuthResponse> login({
  required String email,
  required String password,
}) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/login'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email, 'password': password}),
  );
  if (res.statusCode == 200) {
    return AuthResponse.fromJson(jsonDecode(res.body));
  }
  throw _parseError(res);
}
```

---

### 3.3 Demande de réinitialisation – POST /auth/reset-password

| Élément   | Valeur |
|----------|--------|
| Méthode  | POST   |
| URL      | `$baseUrl/auth/reset-password` |
| Body     | `{ "email": "string" }` |
| Succès   | 200 → `{ "message": "string" }` |

Le backend envoie un email (SendGrid) avec un lien du type :  
`{RESET_LINK_BASE_URL}?token=xxx` (token valide 1h).

```dart
Future<void> requestResetPassword({ required String email }) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/reset-password'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email}),
  );
  if (res.statusCode != 200) throw _parseError(res);
}
```

---

### 3.4 Définir le nouveau mot de passe – POST /auth/reset-password/confirm

À appeler quand l’utilisateur a cliqué sur le lien reçu par email (récupérer `token` depuis l’URL : `?token=xxx`).

| Élément   | Valeur |
|----------|--------|
| Méthode  | POST   |
| URL      | `$baseUrl/auth/reset-password/confirm` |
| Body     | `{ "token": "string", "newPassword": "string" }` |
| Succès   | 200 → `{ "message": "string" }` |
| Erreur   | 400 = token invalide ou expiré |

```dart
Future<void> setNewPassword({
  required String token,
  required String newPassword,
}) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/reset-password/confirm'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'token': token,
      'newPassword': newPassword,
    }),
  );
  if (res.statusCode != 200) throw _parseError(res);
}
```

---

### 3.5 Connexion Google – POST /auth/google

| Élément   | Valeur |
|----------|--------|
| Méthode  | POST   |
| URL      | `$baseUrl/auth/google` |
| Body     | `{ "idToken": "string" }` (token Google côté client) |
| Succès   | 200 → `AuthResponse` |

```dart
Future<AuthResponse> loginWithGoogle({ required String idToken }) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/google'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'idToken': idToken}),
  );
  if (res.statusCode == 200) {
    return AuthResponse.fromJson(jsonDecode(res.body));
  }
  throw _parseError(res);
}
```

---

### 3.6 Connexion Apple – POST /auth/apple

| Élément   | Valeur |
|----------|--------|
| Méthode  | POST   |
| URL      | `$baseUrl/auth/apple` |
| Body     | `{ "identityToken": "string", "user"?: "string" }` |
| Succès   | 200 → `AuthResponse` |

```dart
Future<AuthResponse> loginWithApple({
  required String identityToken,
  String? user,
}) async {
  final body = <String, dynamic>{'identityToken': identityToken};
  if (user != null) body['user'] = user;

  final res = await http.post(
    Uri.parse('$baseUrl/auth/apple'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode(body),
  );
  if (res.statusCode == 200) {
    return AuthResponse.fromJson(jsonDecode(res.body));
  }
  throw _parseError(res);
}
```

---

### 3.7 Utilisateur connecté – GET /auth/me

| Élément   | Valeur |
|----------|--------|
| Méthode  | GET    |
| URL      | `$baseUrl/auth/me` |
| Header   | `Authorization: Bearer <accessToken>` |
| Succès   | 200 → `{ "id", "name", "email" }` |
| Erreur   | 401 = non connecté ou token expiré |

```dart
Future<UserModel> getMe({ required String accessToken }) async {
  final res = await http.get(
    Uri.parse('$baseUrl/auth/me'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $accessToken',
    },
  );
  if (res.statusCode == 200) {
    return UserModel.fromJson(jsonDecode(res.body));
  }
  throw _parseError(res);
}
```

---

### 3.8 Santé backend – GET /health

| Élément   | Valeur |
|----------|--------|
| Méthode  | GET    |
| URL      | `$baseUrl/health` |
| Succès   | 200 → `{ "status": "ok", "mongodb": "connected" }` |

```dart
Future<bool> checkHealth() async {
  final res = await http.get(Uri.parse('$baseUrl/health'));
  if (res.statusCode != 200) return false;
  final data = jsonDecode(res.body);
  return data['status'] == 'ok';
}
```

---

## 4. Gestion des erreurs

Réponses d’erreur du backend :  
`{ "statusCode": number, "message": string | string[], "error"?: string }`.

```dart
Exception _parseError(http.Response res) {
  try {
    final data = jsonDecode(res.body);
    final msg = data['message'];
    if (msg is List) return Exception(msg.join(', '));
    return Exception(msg?.toString() ?? 'Request failed');
  } catch (_) {
    return Exception('Request failed (${res.statusCode})');
  }
}
```

Codes courants : **400** = validation, **401** = non autorisé, **409** = conflit (ex. email déjà utilisé).

---

## 5. Stockage du token

Après un **register**, **login**, **google** ou **apple** réussi :

1. Récupérer **accessToken** depuis **AuthResponse**.
2. Stocker le token (ex. **shared_preferences** ou **flutter_secure_storage**).
3. Pour les requêtes protégées, envoyer **Authorization: Bearer &lt;accessToken&gt;**.

```dart
import 'package:shared_preferences/shared_preferences.dart';

Future<void> saveToken(String token) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('accessToken', token);
}

Future<String?> getToken() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString('accessToken');
}

Future<void> clearToken() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove('accessToken');
}
```

---

## 6. Parcours Reset Password (Flutter)

1. **Page “Reset Password”** (email uniquement)  
   - L’utilisateur saisit l’email et appuie sur **“Send Reset Link”**.  
   - Appel **POST /auth/reset-password** avec `{ "email": email }`.  
   - Afficher : *“Si cet email est enregistré, vous recevrez un lien pour réinitialiser votre mot de passe.”*

2. **Lien reçu par email**  
   - Format : `https://tonapp.com/reset-password?token=xxx` (ou deep link équivalent).  
   - Ouvrir une page “Nouveau mot de passe” et extraire **token** des query params.

3. **Page “Nouveau mot de passe”**  
   - Champs : nouveau mot de passe + confirmation.  
   - Au submit : appel **POST /auth/reset-password/confirm** avec  
     `{ "token": "<token du lien>", "newPassword": "<nouveau mot de passe>" }`.  
   - En cas de succès : message de confirmation et redirection vers **Sign In**.

---

## 7. Récapitulatif des routes

| Action Flutter        | Méthode | Route                          | Body / Header                    |
|-----------------------|--------|--------------------------------|----------------------------------|
| Inscription           | POST   | `/auth/register`               | name, email, password            |
| Connexion             | POST   | `/auth/login` ou `/auth/signin`| email, password                  |
| Demande reset MDP     | POST   | `/auth/reset-password`         | email                            |
| Nouveau MDP (lien)    | POST   | `/auth/reset-password/confirm`| token, newPassword               |
| Connexion Google      | POST   | `/auth/google`                 | idToken                          |
| Connexion Apple       | POST   | `/auth/apple`                  | identityToken, user?             |
| Profil (connecté)     | GET    | `/auth/me`                     | Header: `Authorization: Bearer <token>` |
| Santé backend         | GET    | `/health`                      | —                                |

---

## 8. Dépendances Dart suggérées

```yaml
dependencies:
  http: ^1.2.0
  shared_preferences: ^2.2.2
  # ou flutter_secure_storage pour le token
```

Ce document peut être utilisé tel quel par l’équipe Flutter pour implémenter la consommation de l’API backend.
