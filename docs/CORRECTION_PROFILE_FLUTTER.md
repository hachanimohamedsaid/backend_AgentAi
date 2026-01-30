# Correction : page Profile – afficher les données dynamiques (mohamed said, etc.)

## Pourquoi la page Profile affiche des données statiques ?

Actuellement l’app Flutter **ne récupère pas** le profil depuis le backend après le login. Elle affiche des valeurs en dur :
- "User", "user@example.com", "San Francisco, CA", "January 2024", "0 Conversations", etc.

Pour afficher les **vraies données** (ex. mohamed said, son email, sa date d’inscription), il faut :

1. **Après le login** : enregistrer le `accessToken` renvoyé par l’API.
2. **Sur la page Profile** : appeler **GET /auth/me** avec ce token et afficher la réponse.
3. **Sur la page Edit Profile** : pré-remplir les champs avec le profil chargé, et à la sauvegarde appeler **PATCH /auth/me**.

---

## 1. Après le login : enregistrer le token

Dès que l’utilisateur se connecte (email/mot de passe, Google ou Apple), l’API renvoie :

```json
{ "user": { "id", "name", "email" }, "accessToken": "eyJhbGci..." }
```

Tu dois **stocker** `accessToken` (SharedPreferences ou flutter_secure_storage) et l’utiliser pour toutes les requêtes protégées.

Exemple après un login réussi :

```dart
// Après login réussi
final authResponse = await api.login(email: email, password: password);
await saveToken(authResponse.accessToken);  // SharedPreferences ou secure_storage
// Puis naviguer vers Home / Profile
```

---

## 2. Page Profile : charger et afficher le profil dynamique

Au chargement de la page Profile (ou au premier affichage), il faut :

1. Récupérer le token stocké.
2. Appeler **GET** `$baseUrl/auth/me` avec le header `Authorization: Bearer <token>`.
3. Mapper la réponse en un modèle (ex. `ProfileModel`) et mettre à jour l’état (State/Bloc/Cubit).
4. Afficher **ces données** au lieu des textes statiques.

### Exemple de modèle (réponse GET /auth/me)

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
      id: json['id']?.toString() ?? '',
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

  String get joinedLabel {
    if (createdAt == null) return '';
    final date = DateTime.tryParse(createdAt!);
    if (date == null) return '';
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return 'Joined ${months[date.month - 1]} ${date.year}';
  }
}
```

### Appel API GET /auth/me

```dart
Future<ProfileModel> getProfile(String accessToken) async {
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
  throw Exception('Failed to load profile');
}
```

### Dans ton écran Profile (StatefulWidget / Bloc / Cubit)

- Au **initState** (ou équivalent) : récupérer le token, appeler `getProfile(token)`, stocker le résultat dans ton state (ex. `_profile` ou `ProfileLoaded`).
- Dans le **build** : utiliser **uniquement** les champs du profil chargé, pas de chaînes en dur.

Exemple d’affichage :

```dart
// Au lieu de :
// Text('User')
// Text('user@example.com')
// Text('Joined January 2024')
// Text('San Francisco, CA')
// Text('127')  // Conversations
// Text('45')   // Days Active
// Text('23')   // Hours Saved

// Utiliser (après avoir chargé _profile) :
Text(_profile?.name ?? '')           // ex. "mohamed said"
Text(_profile?.email ?? '')          // son vrai email
Text(_profile?.joinedLabel ?? '')    // ex. "Joined January 2025"
Text(_profile?.location ?? '—')      // ou vide si non renseigné
Text(_profile?.phone ?? '—')         // numéro ajouté en base (récupéré ici)
Text(_profile?.birthDate ?? '')      // date de naissance (ex. "1990-01-15")
Text(_profile?.role ?? '—')         // ex. "AI Enthusiast" ou "—"
Text(_profile?.bio ?? '—')          // bio / rôle
Text('${_profile?.conversationsCount ?? 0}')  // Conversations
Text('${_profile?.daysActive ?? 0}')         // Days Active
Text('${_profile?.hoursSaved ?? 0}')          // Hours Saved
```

Si `_profile` est null (pas encore chargé ou erreur), afficher un loading ou un message, mais **jamais** "User" / "user@example.com" en dur.

---

## 3. Page Edit Profile : pré-remplir et sauvegarder

- **À l’ouverture** : utiliser le même `ProfileModel` que tu as chargé pour la page Profile (ou rappeler GET /auth/me). Pré-remplir **tous** les champs avec les données de la base :
  - Full Name ← `profile.name`
  - Email ← `profile.email` (en lecture seule si ton backend ne permet pas de le changer)
  - **Phone Number** ← `profile.phone ?? ''` (numéro récupéré de la base ; si l’utilisateur en a ajouté un, il s’affiche ici)
  - Location ← `profile.location ?? ''`
  - Birth Date ← `profile.birthDate ?? ''` (format "YYYY-MM-DD")
  - Bio / Rôle ← `profile.bio ?? profile.role ?? ''`
- **Ne pas** utiliser des valeurs statiques ("Enter your name", "Enter your phone", "San Francisco, CA", "1990-01-15", etc.) : tout doit venir du `ProfileModel` (GET /auth/me).
- **À la sauvegarde** : appeler **PATCH** `$baseUrl/auth/me` avec le header `Authorization: Bearer <token>` et le body contenant les champs modifiés : `name`, `phone`, `location`, `birthDate`, `bio` (et éventuellement `role`). Le numéro de téléphone saisi sera ainsi **ajouté/mis à jour dans la base** et réapparaîtra au prochain chargement du profil.

Exemple PATCH :

```dart
Future<void> updateProfile(String accessToken, {
  String? name,
  String? role,
  String? location,
  String? phone,
  String? birthDate,
  String? bio,
}) async {
  final body = <String, dynamic>{};
  if (name != null) body['name'] = name;
  if (role != null) body['role'] = role;
  if (location != null) body['location'] = location;
  if (phone != null) body['phone'] = phone;
  if (birthDate != null) body['birthDate'] = birthDate;
  if (bio != null) body['bio'] = bio;

  final res = await http.patch(
    Uri.parse('$baseUrl/auth/me'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $accessToken',
    },
    body: jsonEncode(body),
  );
  if (res.statusCode != 200) throw Exception('Update failed');
}
```

---

## 4. Checklist dans ton projet Flutter

- [ ] Après login (email, Google, Apple), tu enregistres bien `accessToken` (SharedPreferences ou secure storage).
- [ ] La page Profile appelle **GET /auth/me** au chargement (avec le token stocké).
- [ ] L’écran Profile affiche `profile.name`, `profile.email`, `profile.role`, `profile.location`, `profile.joinedLabel`, et les 3 stats à partir de la réponse (pas de "User", "user@example.com", "San Francisco, CA", "0" en dur).
- [ ] La page Edit Profile est pré-remplie avec les données du `ProfileModel` (nom, email, **téléphone**, localisation, date de naissance, bio) ; le numéro ajouté en base s’affiche dans le champ "Phone Number".
- [ ] À "Save Changes", tu envoies **PATCH /auth/me** avec `name`, `phone`, `location`, `birthDate`, `bio` ; le numéro saisi est enregistré en base et récupéré au prochain GET /auth/me.

Dès que ces points sont en place, la page Profile affichera les données correctes du compte connecté (ex. mohamed said) au lieu des données statiques.

Pour le détail des requêtes et modèles, voir **CONSOMMATION_API_FLUTTER.md**.
