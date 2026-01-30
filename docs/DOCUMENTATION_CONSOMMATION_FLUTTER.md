# Documentation de consommation API – Code Flutter

Document de référence pour consommer l’API backend NestJS depuis une application Flutter : authentification, profil dynamique (nom, email, téléphone, localisation, date de naissance, bio), reset password.

**Backend** : NestJS + MongoDB  
**Base URL** : `https://ton-backend.up.railway.app` ou `http://localhost:3000`

---

## Sommaire

1. [Configuration](#1-configuration)
2. [Modèles Dart](#2-modèles-dart)
3. [Endpoints et exemples de code](#3-endpoints-et-exemples-de-code)
4. [Gestion des erreurs](#4-gestion-des-erreurs)
5. [Stockage du token](#5-stockage-du-token)
6. [Flux Profile et Edit Profile](#6-flux-profile-et-edit-profile)
7. [Récapitulatif des routes](#7-récapitulatif-des-routes)
8. [Dépendances et environnements](#8-dépendances-et-environnements)

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

| Header | Usage |
|--------|--------|
| `Content-Type: application/json` | Requêtes avec body (POST, PATCH) |
| `Authorization: Bearer <accessToken>` | Routes protégées : GET /auth/me, PATCH /auth/me |

---

## 2. Modèles Dart

### UserModel (réponse login / register / Google / Apple)

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

### ProfileModel (réponse GET /auth/me – page Profile et Edit Profile)

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

### AuthResponse (register, login, Google, Apple)

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

## 3. Endpoints et exemples de code

### 3.1 Inscription – POST /auth/register

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

- **Body** : `{ "name", "email", "password" }`
- **Succès** : 201 → `AuthResponse`
- **Erreur** : 409 = email déjà utilisé ; 400 = validation

---

### 3.2 Connexion – POST /auth/login ou /auth/signin

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

- **Body** : `{ "email", "password" }`
- **Succès** : 200 → `AuthResponse`
- **Erreur** : 401 = identifiants incorrects

---

### 3.3 Réinitialisation mot de passe – POST /auth/reset-password

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

- **Body** : `{ "email" }`
- **Succès** : 200 → `{ "message" }`

---

### 3.4 Nouveau mot de passe (lien email) – POST /auth/reset-password/confirm

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

- **Body** : `{ "token", "newPassword" }` (token = paramètre du lien reçu par email)
- **Succès** : 200 ; **Erreur** : 400 = token invalide ou expiré

---

### 3.5 Connexion Google – POST /auth/google

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

- **Body** : `{ "idToken" }`
- **Succès** : 200 → `AuthResponse`

---

### 3.6 Connexion Apple – POST /auth/apple

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

- **Body** : `{ "identityToken", "user"?: "string" }`
- **Succès** : 200 → `AuthResponse`

---

### 3.7 Profil utilisateur (données dynamiques) – GET /auth/me

À appeler après login pour la page **Profile** et pour pré-remplir la page **Edit Profile**.

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

- **Header** : `Authorization: Bearer <accessToken>`
- **Succès** : 200 → `ProfileModel` (id, name, email, role, location, **phone**, **birthDate**, **bio**, createdAt, conversationsCount, daysActive, hoursSaved)
- **Erreur** : 401 = non connecté ou token expiré

**Champs à afficher sur la page Profile :**

| Champ API | Affichage |
|-----------|-----------|
| `name` | Nom |
| `email` | Email |
| `role` | Sous-titre (ex. "AI Enthusiast") ; si null → "—" |
| `location` | Lieu ; si null → "—" |
| `phone` | Numéro de téléphone ; si null → "—" |
| `birthDate` | Date de naissance (YYYY-MM-DD) ; si null → vide |
| `bio` | Bio / rôle ; si null → "—" |
| `createdAt` | Ex. `profile.joinedLabel` → "Joined January 2024" |
| `conversationsCount`, `daysActive`, `hoursSaved` | Les 3 cartes de stats |

---

### 3.8 Mise à jour du profil – PATCH /auth/me

À appeler au clic sur **Save Changes** dans la page Edit Profile.

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

- **Header** : `Authorization: Bearer <accessToken>`
- **Body** (tous optionnels) : `name`, `role`, `location`, `phone`, `birthDate`, `bio`, `conversationsCount`, `hoursSaved`
- **Succès** : 200 → `{ "message": "Profile updated" }`

---

### 3.9 Santé backend – GET /health

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

Après **register**, **login**, **google** ou **apple** réussi :

1. Récupérer **accessToken** depuis **AuthResponse**.
2. Stocker le token (SharedPreferences ou flutter_secure_storage).
3. Pour GET /auth/me et PATCH /auth/me, envoyer **Authorization: Bearer &lt;accessToken&gt;**.

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

## 6. Flux Profile et Edit Profile

### Page Profile

1. Au chargement : récupérer le token → appeler **GET /auth/me**.
2. Mapper la réponse en **ProfileModel**.
3. Afficher tous les champs (name, email, role, location, phone, birthDate, bio, joinedLabel, stats) au lieu de données statiques.

### Page Edit Profile

1. À l’ouverture : utiliser le **ProfileModel** déjà chargé (ou rappeler GET /auth/me) et **pré-remplir** les champs :
   - Full Name ← `profile.name`
   - Email ← `profile.email`
   - Phone Number ← `profile.phone ?? ''`
   - Location ← `profile.location ?? ''`
   - Birth Date ← `profile.birthDate ?? ''`
   - Bio / Rôle ← `profile.bio ?? ''`
2. Au clic **Save Changes** : appeler **PATCH /auth/me** avec les champs modifiés (dont `phone`). Le numéro et les autres données sont enregistrés en base et récupérés au prochain GET /auth/me.

Exemple chargement profil (Cubit/Bloc) :

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

| Action | Méthode | Route | Body / Header |
|--------|--------|-------|----------------|
| Inscription | POST | `/auth/register` | name, email, password |
| Connexion | POST | `/auth/login` ou `/auth/signin` | email, password |
| Demande reset MDP | POST | `/auth/reset-password` | email |
| Nouveau MDP (lien) | POST | `/auth/reset-password/confirm` | token, newPassword |
| Connexion Google | POST | `/auth/google` | idToken |
| Connexion Apple | POST | `/auth/apple` | identityToken, user? |
| **Profil (données dynamiques)** | GET | `/auth/me` | Header: `Authorization: Bearer <token>` |
| **Mise à jour profil** | PATCH | `/auth/me` | name?, role?, location?, phone?, birthDate?, bio?, conversationsCount?, hoursSaved? |
| Santé backend | GET | `/health` | — |

---

## 8. Dépendances et environnements

### Dépendances Dart (pubspec.yaml)

```yaml
dependencies:
  http: ^1.2.0
  shared_preferences: ^2.2.2
  # ou flutter_secure_storage pour le token
```

### Environnements

| Contexte | Base URL recommandée |
|----------|----------------------|
| Dev (machine) | `http://localhost:3000` |
| Émulateur Android | `http://10.0.2.2:3000` |
| iOS Simulator | `http://localhost:3000` |
| App physique | IP de la machine ou URL Railway |
| Production | `https://ton-backend.up.railway.app` |

---

*Documentation de consommation API pour le code Flutter – Backend NestJS.*
