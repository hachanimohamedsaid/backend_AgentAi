# Corriger le clic sur l’icône caméra (Edit Profile) – Flutter

Si **rien ne se passe** quand tu cliques sur l’icône caméra ou sur « Tap to change photo », c’est en général parce que :

1. La clé API ImgBB n’est pas configurée dans `lib/core/config/imgbb_config.dart`, **ou**
2. Le `onTap` de la zone photo ne déclenche pas l’ouverture du sélecteur d’image.

Suis les étapes ci‑dessous dans **ton projet Flutter** (Pi_Dev_Agent_Ai ou équivalent).

---

## 1. Créer le fichier de config ImgBB

Crée le fichier **`lib/core/config/imgbb_config.dart`** dans ton projet Flutter (ou remplace son contenu) :

```dart
/// Configuration ImgBB pour l'upload des photos de profil.
/// Ne pas commiter ce fichier si le repo est public (ajouter à .gitignore).
class ImgBBConfig {
  ImgBBConfig._();

  /// Clé API ImgBB (obtenue sur https://api.imgbb.com/)
  static const String apiKey = '9c78dd4d38eeed795d1ef908540d73e4';

  static const String uploadUrl = 'https://api.imgbb.com/1/upload';
}
```

Si le dossier n’existe pas : crée `lib/core/config/` puis le fichier `imgbb_config.dart`.

---

## 2. Vérifier que le clic ouvre bien le sélecteur

Sur l’écran **Edit Profile**, la zone photo (cercle + icône caméra + « Tap to change photo ») doit être dans un **GestureDetector** (ou **InkWell**) dont le **onTap** :

1. Ouvre le sélecteur d’image : `ImagePicker().pickImage(source: ImageSource.gallery)` (ou `ImageSource.camera`).
2. Si une image est choisie, l’envoie à ImgBB (base64 + POST vers l’URL ImgBB avec la clé).
3. Récupère l’URL dans la réponse ImgBB (`data.data.url`).
4. Envoie **PATCH /auth/me** avec `avatarUrl: url` et le token.

Exemple minimal pour le **onTap** (à adapter à ton code) :

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
// import de ta config : import 'package:ton_app/core/config/imgbb_config.dart';

Future<String?> _pickAndUploadAvatar() async {
  final picker = ImagePicker();
  final XFile? file = await picker.pickImage(
    source: ImageSource.gallery,
    maxWidth: 800,
    maxHeight: 800,
    imageQuality: 85,
  );
  if (file == null) return null;

  final bytes = await file.readAsBytes();
  final base64Image = base64Encode(bytes);

  final res = await http.post(
    Uri.parse('${ImgBBConfig.uploadUrl}?key=${ImgBBConfig.apiKey}'),
    body: {'image': base64Image},
  );

  if (res.statusCode != 200) return null;
  final data = jsonDecode(res.body);
  final url = data['data']?['url'] ?? data['data']?['display_url'];
  return url?.toString();
}

// Dans ton widget Edit Profile :
GestureDetector(
  onTap: () async {
    final url = await _pickAndUploadAvatar();
    if (url == null) return;
    final token = await getToken(); // ta fonction pour récupérer le token
    if (token == null) return;
    await updateProfile(accessToken: token, avatarUrl: url); // PATCH /auth/me
    setState(() => _avatarUrl = url); // ou recharger le profil
  },
  child: Stack(
    // ... ton CircleAvatar + icône caméra + texte "Tap to change photo"
  ),
)
```

Assure‑toi que **tout** le bloc (avatar + icône caméra + texte) est bien à l’intérieur du `GestureDetector`, pour que le clic sur l’icône caméra déclenche aussi le `onTap`.

---

## 3. Dépendances

Dans **`pubspec.yaml`** :

```yaml
dependencies:
  image_picker: ^1.0.7
  http: ^1.2.0
```

Puis `flutter pub get`.

---

## 4. Checklist

- [ ] Le fichier **`lib/core/config/imgbb_config.dart`** existe et contient la clé **`9c78dd4d38eeed795d1ef908540d73e4`** (et l’URL d’upload).
- [ ] La zone photo (avatar + icône caméra) est dans un **GestureDetector** (ou InkWell) avec un **onTap** qui appelle `pickImage` puis upload ImgBB puis PATCH /auth/me.
- [ ] `image_picker` et `http` sont dans `pubspec.yaml` et `flutter pub get` a été exécuté.
- [ ] Le backend expose bien **PATCH /auth/me** avec le champ **avatarUrl** (déjà en place côté NestJS).

Après ça, un clic sur l’icône caméra ou sur « Tap to change photo » doit ouvrir le sélecteur de photo, puis enregistrer l’URL dans le profil.

Pour plus de détail (modèles, PATCH /auth/me, affichage), voir **DOCUMENTATION_CONSOMMATION_FLUTTER.md**, section 10.
