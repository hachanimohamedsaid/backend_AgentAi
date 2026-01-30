# Fiche Flutter – Consommation de l’API Auth (NestJS)

Guide pour connecter l’app Flutter à l’API d’authentification backend.

---

## 1. Base URL

```dart
const String baseUrl = 'http://localhost:3000';  // Dev local
// ou
const String baseUrl = 'https://ton-app.up.railway.app';  // Production (Railway)
```

---

## 2. Modèle User (côté Flutter)

Aligné sur la réponse API : `{ "id", "name", "email" }`.

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
      id: json['id'] as String? ?? json['_id'] as String? ?? '',
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

---

## 3. Réponse Auth (user + token)

Toutes les routes d’auth renvoient :

```json
{
  "user": { "id": "...", "name": "...", "email": "..." },
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

```dart
class AuthResponse {
  final UserModel user;
  final String accessToken;

  AuthResponse({ required this.user, required this.accessToken });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      user: UserModel.fromJson(json['user'] as Map<String, dynamic>),
      accessToken: json['accessToken'] as String? ?? '',
    );
  }
}
```

---

## 4. Endpoints et appels HTTP

### 4.1 Inscription – `POST /auth/register`

**Body :** `name`, `email`, `password`

```dart
Future<AuthResponse> register({
  required String name,
  required String email,
  required String password,
}) async {
  final response = await http.post(
    Uri.parse('$baseUrl/auth/register'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'name': name,
      'email': email,
      'password': password,
    }),
  );

  if (response.statusCode == 201) {
    return AuthResponse.fromJson(jsonDecode(response.body));
  }
  if (response.statusCode == 409) {
    throw Exception('Email already registered');
  }
  final err = jsonDecode(response.body);
  throw Exception(err['message'] ?? 'Registration failed');
}
```

---

### 4.2 Connexion – `POST /auth/login`

**Body :** `email`, `password`

```dart
Future<AuthResponse> login({
  required String email,
  required String password,
}) async {
  final response = await http.post(
    Uri.parse('$baseUrl/auth/login'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'email': email,
      'password': password,
    }),
  );

  if (response.statusCode == 200) {
    return AuthResponse.fromJson(jsonDecode(response.body));
  }
  if (response.statusCode == 401) {
    throw Exception('Invalid email or password');
  }
  final err = jsonDecode(response.body);
  throw Exception(err['message'] ?? 'Login failed');
}
```

---

### 4.3 Réinitialisation mot de passe – `POST /auth/reset-password`

**Body :** `email`

```dart
Future<void> resetPassword({ required String email }) async {
  final response = await http.post(
    Uri.parse('$baseUrl/auth/reset-password'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email}),
  );

  if (response.statusCode != 200) {
    final err = jsonDecode(response.body);
    throw Exception(err['message'] ?? 'Reset failed');
  }
}
```

---

### 4.4 Connexion Google – `POST /auth/google`

**Body :** `idToken` (token Google côté client)

```dart
Future<AuthResponse> loginWithGoogle({ required String idToken }) async {
  final response = await http.post(
    Uri.parse('$baseUrl/auth/google'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'idToken': idToken}),
  );

  if (response.statusCode == 200) {
    return AuthResponse.fromJson(jsonDecode(response.body));
  }
  if (response.statusCode == 401) {
    throw Exception('Invalid Google token');
  }
  final err = jsonDecode(response.body);
  throw Exception(err['message'] ?? 'Google login failed');
}
```

---

### 4.5 Connexion Apple – `POST /auth/apple`

**Body :** `identityToken`, optionnellement `user` (JSON string Apple)

```dart
Future<AuthResponse> loginWithApple({
  required String identityToken,
  String? user,
}) async {
  final body = <String, dynamic>{'identityToken': identityToken};
  if (user != null) body['user'] = user;

  final response = await http.post(
    Uri.parse('$baseUrl/auth/apple'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode(body),
  );

  if (response.statusCode == 200) {
    return AuthResponse.fromJson(jsonDecode(response.body));
  }
  if (response.statusCode == 401) {
    throw Exception('Invalid Apple token');
  }
  final err = jsonDecode(response.body);
  throw Exception(err['message'] ?? 'Apple login failed');
}
```

---

### 4.6 Utilisateur connecté – `GET /auth/me` (protégé JWT)

**Header :** `Authorization: Bearer <accessToken>`

```dart
Future<UserModel> getMe({ required String accessToken }) async {
  final response = await http.get(
    Uri.parse('$baseUrl/auth/me'),
    headers: {
      'Authorization': 'Bearer $accessToken',
      'Content-Type': 'application/json',
    },
  );

  if (response.statusCode == 200) {
    return UserModel.fromJson(jsonDecode(response.body));
  }
  if (response.statusCode == 401) {
    throw Exception('Unauthorized');
  }
  throw Exception('Failed to load user');
}
```

---

## 5. Stocker le token et l’envoyer

Après un `register` ou `login` réussi :

1. Stocker `accessToken` (et éventuellement `user`) :
   - **shared_preferences** ou **flutter_secure_storage**.

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
```

2. Pour chaque requête protégée, envoyer le header :

```dart
final token = await getToken();
headers['Authorization'] = 'Bearer $token';
```

---

## 6. Récap des routes

| Action Flutter   | Méthode | Route                | Body / Header                    |
|------------------|--------|----------------------|----------------------------------|
| Inscription      | POST   | `/auth/register`     | name, email, password            |
| Connexion        | POST   | `/auth/login`       | email, password                  |
| Reset password   | POST   | `/auth/reset-password` | email                         |
| Connexion Google | POST   | `/auth/google`      | idToken                          |
| Connexion Apple  | POST   | `/auth/apple`       | identityToken, user?             |
| Profil (moi)     | GET    | `/auth/me`          | Header: `Authorization: Bearer <token>` |

---

## 7. Codes d’erreur courants

| Code | Signification |
|------|----------------|
| 200 / 201 | Succès |
| 400 | Données invalides (validation) – voir `message` dans le body |
| 401 | Identifiants incorrects ou token invalide/expiré |
| 409 | Email déjà utilisé (inscription) |

---

## 8. Exemple dans un Bloc/Cubit (inscription)

```dart
// Dans ton AuthBloc ou AuthCubit
Future<void> register(String name, String email, String password) async {
  try {
    final authResponse = await api.register(
      name: name,
      email: email,
      password: password,
    );
    await saveToken(authResponse.accessToken);
    emit(AuthAuthenticated(authResponse.user));
  } on Exception catch (e) {
    emit(AuthError(e.toString()));
  }
}
```

---

## 9. CORS et émulateur

- Backend : CORS est activé (`origin: true` en dev).
- Émulateur Android : utiliser `http://10.0.2.2:3000` au lieu de `localhost:3000`.
- iOS Simulator : `http://localhost:3000` fonctionne.
- App physique : utiliser l’IP de ta machine (ex. `http://192.168.1.x:3000`) ou l’URL Railway en prod.

Tu peux copier ce fichier dans ton projet Flutter ou l’utiliser comme référence pour ton `AuthRemoteDataSource` / services HTTP.
