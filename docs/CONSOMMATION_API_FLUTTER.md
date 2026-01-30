# Document de consommation API – Flutter

Référence pour connecter l’application Flutter au backend NestJS : auth, profil dynamique, reset password.

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

### Headers

- **Content-Type** : `application/json` pour les requêtes avec body.
- **Authorization** : `Bearer <accessToken>` pour les routes protégées (`GET /auth/me`, `PATCH /auth/me`).

---

## 2. Modèles Dart

### UserModel (réponse login/register)

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

### ProfileModel (réponse GET /auth/me – profil dynamique)

Utiliser ce modèle pour la page Profile après login.

```dart
class ProfileModel {
  final String id;
  final String name;
  final String email;
  final String? role;
  final String? location;
  final String? phone;
  final String? birthDate;
  final String? bio;
  final String? createdAt;
  final int conversationsCount;
  final int daysActive;
  final int hoursSaved;

  ProfileModel({
    required this.id,
    required this.name,
    required this.email,
    this.role,
    this.location,
    this.phone,
    this.birthDate,
    this.bio,
    this.createdAt,
    this.conversationsCount = 0,
    this.daysActive = 0,
    this.hoursSaved = 0,
  });

  factory ProfileModel.fromJson(Map<String, dynamic> json) {
    return ProfileModel(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
      role: json['role'] as String?,
      location: json['location'] as String?,
      phone: json['phone'] as String?,
      birthDate: json['birthDate'] as String?,
      bio: json['bio'] as String?,
      createdAt: json['createdAt'] as String?,
      conversationsCount: (json['conversationsCount'] as num?)?.toInt() ?? 0,
      daysActive: (json['daysActive'] as num?)?.toInt() ?? 0,
      hoursSaved: (json['hoursSaved'] as num?)?.toInt() ?? 0,
    );
  }

  /// Exemple : "Joined January 2024"
  String get joinedLabel {
    if (createdAt == null) return '';
    final date = DateTime.tryParse(createdAt!);
    if (date == null) return '';
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return 'Joined ${months[date.month - 1]} ${date.year}';
  }
}
```

### AuthResponse (login, register, Google, Apple)

```dart
class AuthResponse {
  final UserModel user;
  final String accessToken;

  AuthResponse({required this.user, required this.accessToken});

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

| Élément | Valeur |
|--------|--------|
| Méthode | POST |
| URL | `$baseUrl/auth/register` |
| Body | `{ "name", "email", "password" }` |
| Succès | 201 → `AuthResponse` |
| Erreur | 409 = email déjà utilisé ; 400 = validation |

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

| Élément | Valeur |
|--------|--------|
| Méthode | POST |
| URL | `$baseUrl/auth/login` ou `$baseUrl/auth/signin` |
| Body | `{ "email", "password" }` |
| Succès | 200 → `AuthResponse` |
| Erreur | 401 = identifiants incorrects |

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

### 3.3 Réinitialisation mot de passe – POST /auth/reset-password

| Élément | Valeur |
|--------|--------|
| Méthode | POST |
| URL | `$baseUrl/auth/reset-password` |
| Body | `{ "email" }` |
| Succès | 200 → `{ "message" }` |

```dart
Future<void> requestResetPassword({required String email}) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/reset-password'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email}),
  );
  if (res.statusCode != 200) throw _parseError(res);
}
```

---

### 3.4 Nouveau mot de passe (lien email) – POST /auth/reset-password/confirm

| Élément | Valeur |
|--------|--------|
| Méthode | POST |
| URL | `$baseUrl/auth/reset-password/confirm` |
| Body | `{ "token", "newPassword" }` |
| Succès | 200 → `{ "message" }` |
| Erreur | 400 = token invalide ou expiré |

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

| Élément | Valeur |
|--------|--------|
| Méthode | POST |
| URL | `$baseUrl/auth/google` |
| Body | `{ "idToken" }` |
| Succès | 200 → `AuthResponse` |

```dart
Future<AuthResponse> loginWithGoogle({required String idToken}) async {
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

| Élément | Valeur |
|--------|--------|
| Méthode | POST |
| URL | `$baseUrl/auth/apple` |
| Body | `{ "identityToken", "user"?: "string" }` |
| Succès | 200 → `AuthResponse` |

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

### 3.7 Profil utilisateur (données dynamiques) – GET /auth/me

À appeler après login pour afficher la page Profile avec les vraies données (nom, email, rôle, localisation, date d’inscription, stats).

| Élément | Valeur |
|--------|--------|
| Méthode | GET |
| URL | `$baseUrl/auth/me` |
| Header | `Authorization: Bearer <accessToken>` |
| Succès | 200 → `ProfileModel` (id, name, email, role, location, createdAt, conversationsCount, daysActive, hoursSaved) |
| Erreur | 401 = non connecté ou token expiré |

```dart
Future<ProfileModel> getProfile({required String accessToken}) async {
  final res = await http.get(
    Uri.parse('$baseUrl/auth/me'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $accessToken',
    },
  );
  if (res.statusCode == 200) {
    return ProfileModel.fromJson(jsonDecode(res.body));
  }
  throw _parseError(res);
}
```

**Affichage page Profile :**

- `name` → nom affiché
- `email` → email
- `role` → sous-titre (ex. "AI Enthusiast") ; si `null`, afficher une valeur par défaut ou "—"
- `location` → lieu ; si `null`, masquer ou "—"
- `phone` → numéro de téléphone ; si `null`, afficher "—" ou placeholder
- `birthDate` → date de naissance (format "YYYY-MM-DD") ; si `null`, afficher "Select date" ou vide
- `bio` → bio / rôle ; si `null`, afficher "—"
- `profile.joinedLabel` ou formatage de `createdAt` → "Joined January 2024"
- `conversationsCount`, `daysActive`, `hoursSaved` → les trois cartes de statistiques

---

### 3.8 Mise à jour du profil – PATCH /auth/me

| Élément | Valeur |
|--------|--------|
| Méthode | PATCH |
| URL | `$baseUrl/auth/me` |
| Header | `Authorization: Bearer <accessToken>` |
| Body | Tous optionnels : `{ "name"?, "role"?, "location"?, "conversationsCount"?, "hoursSaved"? }` |
| Succès | 200 → `{ "message": "Profile updated" }` |

```dart
Future<void> updateProfile({
  required String accessToken,
  String? name,
  String? role,
  String? location,
  String? phone,
  String? birthDate,
  String? bio,
  int? conversationsCount,
  int? hoursSaved,
}) async {
  final body = <String, dynamic>{};
  if (name != null) body['name'] = name;
  if (role != null) body['role'] = role;
  if (location != null) body['location'] = location;
  if (phone != null) body['phone'] = phone;
  if (birthDate != null) body['birthDate'] = birthDate;
  if (bio != null) body['bio'] = bio;
  if (conversationsCount != null) body['conversationsCount'] = conversationsCount;
  if (hoursSaved != null) body['hoursSaved'] = hoursSaved;

  final res = await http.patch(
    Uri.parse('$baseUrl/auth/me'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $accessToken',
    },
    body: jsonEncode(body),
  );
  if (res.statusCode != 200) throw _parseError(res);
}
```

---

### 3.9 Santé backend – GET /health

| Élément | Valeur |
|--------|--------|
| Méthode | GET |
| URL | `$baseUrl/health` |
| Succès | 200 → `{ "status": "ok", "mongodb": "connected" }` |

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

| Code | Signification |
|------|----------------|
| 200 / 201 | Succès |
| 400 | Données invalides (validation) |
| 401 | Identifiants incorrects ou token invalide/expiré |
| 409 | Email déjà utilisé (inscription) |

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

## 6. Flux page Profile (données dynamiques)

1. Au login (ou au démarrage si déjà connecté), stocker `accessToken`.
2. Sur l’écran Profile, récupérer le token puis appeler **GET /auth/me**.
3. Mapper la réponse en **ProfileModel** et afficher :
   - Nom, email, rôle (ou défaut), localisation (ou défaut)
   - "Joined …" à partir de `createdAt` (ex. `profile.joinedLabel`)
   - Les 3 stats : `conversationsCount`, `daysActive`, `hoursSaved`
4. Pour l’édition du profil, appeler **PATCH /auth/me** avec les champs modifiés, puis recharger le profil (GET /auth/me) ou mettre à jour l’état local.

Exemple dans un Cubit/Bloc :

```dart
Future<void> loadProfile() async {
  final token = await getToken();
  if (token == null) return;
  try {
    final profile = await api.getProfile(accessToken: token);
    emit(ProfileLoaded(profile));
  } on Exception catch (e) {
    emit(ProfileError(e.toString()));
  }
}
```

---

## 7. Récapitulatif des routes

| Action Flutter       | Méthode | Route                           | Body / Header                    |
|----------------------|--------|----------------------------------|----------------------------------|
| Inscription          | POST   | `/auth/register`                | name, email, password            |
| Connexion            | POST   | `/auth/login` ou `/auth/signin` | email, password                  |
| Demande reset MDP    | POST   | `/auth/reset-password`          | email                            |
| Nouveau MDP (lien)   | POST   | `/auth/reset-password/confirm`  | token, newPassword               |
| Connexion Google     | POST   | `/auth/google`                  | idToken                          |
| Connexion Apple      | POST   | `/auth/apple`                  | identityToken, user?             |
| **Profil (données dynamiques)** | GET  | `/auth/me`                      | Header: `Authorization: Bearer <token>` |
| **Mise à jour profil** | PATCH | `/auth/me`                    | name?, role?, location?, phone?, birthDate?, bio?, conversationsCount?, hoursSaved? |
| Santé backend        | GET    | `/health`                       | —                                |

---

## 8. Dépendances Dart suggérées

```yaml
dependencies:
  http: ^1.2.0
  shared_preferences: ^2.2.2
  # ou flutter_secure_storage pour le token
```

---

## 9. CORS et environnements

- Backend : CORS activé en dev.
- Émulateur Android : préférer `http://10.0.2.2:3000` au lieu de `localhost`.
- iOS Simulator : `http://localhost:3000` fonctionne.
- App physique : utiliser l’IP de la machine (ex. `http://192.168.1.x:3000`) ou l’URL Railway en production.

Ce document sert de référence pour implémenter la consommation de l’API backend dans l’app Flutter, y compris la page Profile avec données dynamiques.
