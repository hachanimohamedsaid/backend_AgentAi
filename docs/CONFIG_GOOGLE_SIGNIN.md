# Configuration pour la connexion Google (Google Sign-In)

Ce backend utilise **Google Sign-In** : l’app Flutter envoie un **idToken** Google au backend, qui le vérifie avec ton **Client ID** puis crée ou connecte l’utilisateur. Voici comment configurer Google Cloud et le backend.

---

## 1. Créer un projet Google Cloud (ou en utiliser un)

1. Va sur **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Connecte-toi avec ton compte Google.
3. **Sélecteur de projet** (en haut) → **Nouveau projet**.
4. Donne un nom (ex. `Mon App Auth`) → **Créer**.

---

## 2. Activer l’API nécessaires

1. Dans le menu : **APIs et services** → **Bibliothèque**.
2. Recherche **Google+ API** ou **Google Identity** – pour le login avec idToken, l’**OAuth 2.0** est géré via les **Identifiants** (étape 3). Tu n’as pas besoin d’activer une API supplémentaire pour le flux **idToken** (Sign-In avec `google_sign_in` en Flutter).
3. Si tu utilises d’autres APIs Google plus tard, active-les ici. Pour uniquement **Connexion avec Google**, passe à l’étape 3.

---

## 3. Créer les identifiants OAuth 2.0 (Client ID)

Le backend vérifie l’**idToken** avec un **Client ID**. Il faut créer un (ou plusieurs) **Client ID OAuth 2.0** selon tes plateformes.

### Écran des identifiants

1. **APIs et services** → **Identifiants**.
2. **+ Créer des identifiants** → **ID de client OAuth**.

Si on te demande de configurer l’**écran de consentement OAuth** :

- **Type d’application** : **Externe** (ou Interne si c’est un compte Google Workspace).
- **Nom de l’application** : ex. `Mon App`.
- **E-mail d’assistance** : ton email.
- **Domaines autorisés** : optionnel pour mobile.
- **Enregistrer** puis revenir à **Identifiants** → **Créer des identifiants** → **ID de client OAuth**.

### Pour une app Flutter

Tu peux avoir **un Client ID par plateforme** (Android, iOS, éventuellement Web). Le backend utilise **un seul** `GOOGLE_CLIENT_ID` ; il doit être celui pour lequel l’**idToken** est émis (même plateforme que l’app qui envoie le token).

#### Option A – Android (Flutter Android)

1. **Type d’application** : **Android**.
2. **Nom** : ex. `Mon App Android`.
3. **Nom du package** : même que dans ton `android/app/build.gradle` (ex. `com.example.mon_app`).
4. **Empreinte du certificat SHA-1** :
   - En local :  
     `cd android && ./gradlew signingReport`  
     ou (macOS/Linux) :  
     `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`  
     Copie la ligne **SHA-1**.
5. **Créer** → copie l’**ID client** (ex. `123456789-xxxx.apps.googleusercontent.com`).  
→ C’est ce que tu mettras dans **GOOGLE_CLIENT_ID** si tu n’utilises que Android.

#### Option B – iOS (Flutter iOS)

1. **Type d’application** : **iOS**.
2. **Nom** : ex. `Mon App iOS`.
3. **ID de bundle** : même que dans Xcode / `ios/Runner/Info.plist` (ex. `com.example.monApp`).
4. **Créer** → copie l’**ID client**.  
→ C’est ce que tu mettras dans **GOOGLE_CLIENT_ID** si tu n’utilises que iOS.

#### Option C – Web (pour tests ou Flutter Web)

1. **Type d’application** : **Application Web**.
2. **Nom** : ex. `Mon App Web`.
3. **URIs de redirection autorisés** : optionnel pour le flux idToken seul.
4. **Créer** → copie l’**ID client**.  
→ Utile si ton Flutter Web ou un front web envoie l’idToken ; tu peux alors utiliser cet ID dans **GOOGLE_CLIENT_ID**.

### Quel Client ID mettre dans le backend ?

- **Une seule plateforme** : utilise le Client ID (Android, iOS ou Web) de cette plateforme dans `GOOGLE_CLIENT_ID`.
- **Android et iOS** : le backend n’accepte qu’**un** `GOOGLE_CLIENT_ID`. Soit tu utilises une seule plateforme pour l’instant, soit il faudra adapter le code backend pour accepter plusieurs Client IDs (Android + iOS). En attendant, mets par exemple le Client ID **Android** si l’app est surtout utilisée sur Android.

---

## 4. Configurer le backend (.env)

Dans le fichier **`.env`** à la racine du projet backend :

```env
# Google Sign-In – obligatoire pour que POST /auth/google fonctionne
GOOGLE_CLIENT_ID=123456789012-xxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
```

Remplace par **ton** ID client (celui copié à l’étape 3).

- Si **GOOGLE_CLIENT_ID** est absent ou vide : **POST /auth/google** renverra **401** avec le message *"Google sign-in is not configured"*.
- Le backend n’a pas besoin du **Client Secret** pour ce flux : il vérifie seulement l’**idToken** avec le Client ID.

---

## 5. Redémarrer le backend

Après modification de `.env` :

```bash
npm run start:dev
```

---

## 6. Côté Flutter (rappel)

Pour que la connexion Google fonctionne de bout en bout :

1. **Package** : `google_sign_in` dans `pubspec.yaml`.
2. **Configuration** :  
   - **Android** : même **package name** et **SHA-1** que le Client ID Android créé dans Google Cloud.  
   - **iOS** : même **bundle ID** que le Client ID iOS, et éventuellement l’URL scheme dans `Info.plist`.
3. **Flux** : après connexion Google côté Flutter, récupérer l’**idToken** (ex. `GoogleSignInAccount` → `authentication.idToken`), puis appeler **POST /auth/google** avec le body :  
   `{ "idToken": "<idToken>" }`.

Le backend vérifie ce token avec **GOOGLE_CLIENT_ID** et renvoie `user` + `accessToken`.

---

## Récapitulatif

| Étape | Action |
|-------|--------|
| 1 | Créer un projet (ou en choisir un) dans Google Cloud Console |
| 2 | Pas d’API à activer obligatoirement pour le flux idToken |
| 3 | **Identifiants** → **Créer des identifiants** → **ID de client OAuth** (Android, iOS ou Web) ; copier l’**ID client** |
| 4 | Dans **.env** : `GOOGLE_CLIENT_ID=<ton-client-id>.apps.googleusercontent.com` |
| 5 | Redémarrer le backend |
| 6 | Côté Flutter : même package/bundle + SHA-1 (Android), envoyer **idToken** vers **POST /auth/google** |

---

*Référence dans le code : `src/auth/auth.service.ts` (constructor + `loginWithGoogle`), variable d’environnement utilisée : `GOOGLE_CLIENT_ID`.*
