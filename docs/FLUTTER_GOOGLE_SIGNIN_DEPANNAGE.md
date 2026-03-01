# Dépannage : "Connexion Google annulée ou échouée" (Flutter)

Si ton app Flutter affiche **"Connexion Google annulée ou échouée. Réessaie si tu veux te connecter."** ou des erreurs liées au token OAuth / gapi.client, vérifie les points suivants.

---

## 1. Vérifier le backend

- **GOOGLE_CLIENT_ID** est bien défini dans le **.env** du backend (et sur Railway en prod).
- Le backend a été redémarré après l’ajout de la variable.
- **POST /auth/google** répond 200 quand tu envoies un **idToken** valide (test avec Postman si besoin).

---

## 2. Flutter : même Client ID que le backend

Le **Client ID** utilisé côté Flutter pour obtenir l’**idToken** doit être **le même** que celui configuré dans le backend (GOOGLE_CLIENT_ID).

- Si tu as créé un client **Application Web** dans Google Cloud → utilise ce Client ID dans le backend **et** dans Flutter (ex. `serverClientId` pour `google_sign_in` sur le Web).
- Si tu as créé un client **Android** → le backend doit avoir ce Client ID dans GOOGLE_CLIENT_ID ; Flutter Android utilise le même projet (package name + SHA-1).
- Si tu as créé un client **iOS** → idem avec le Client ID iOS.

En résumé : **un seul** Client ID pour une plateforme donnée, et le backend doit utiliser **ce même** Client ID.

---

## 3. Flutter Web : gapi / "library is not loaded"

Si tu lances l’app en **Flutter Web** et vois des erreurs du type **gapi.client** ou **"library is not loaded"** :

- Google Sign-In pour le Web charge des scripts (gapi). Il faut souvent configurer le **Client ID Web** dans `google_sign_in` :
  - Utilise le **Client ID** du client **Application Web** (pas Android/iOS).
  - Dans ton code Flutter, tu peux passer le **serverClientId** (Client ID Web) si le package le demande pour le Web.
- Vérifie que dans Google Cloud le client **Application Web** a les **Origines JavaScript autorisées** qui correspondent à l’URL de ton app (ex. `http://localhost:xxxx` en dev, `https://ton-domaine.com` en prod).

---

## 4. Flutter Android

- **Package name** dans `android/app/build.gradle` = celui du client OAuth **Android** dans Google Cloud.
- **SHA-1** du keystore (debug ou release) ajouté dans le client Android sur Google Cloud.
- Commande pour le SHA-1 debug :  
  `cd android && ./gradlew signingReport`  
  ou :  
  `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`

---

## 5. Flutter iOS

- **Bundle ID** dans Xcode / `ios/Runner/Info.plist` = celui du client OAuth **iOS** dans Google Cloud.
- Si besoin, configurer l’URL scheme pour Google Sign-In dans `Info.plist` (voir la doc du package `google_sign_in`).

---

## 6. Annulation par l’utilisateur

Le message "Connexion Google annulée ou échouée" peut aussi apparaître si :

- L’utilisateur ferme la fenêtre / la popup Google sans se connecter.
- En Web : la popup est bloquée ou fermée trop tôt.

Dans ce cas, pas de bug : demander à l’utilisateur de réessayer et de terminer le flux jusqu’au bout.

---

## 7. Checklist rapide

| Où | À vérifier |
|----|------------|
| **Backend** | GOOGLE_CLIENT_ID dans .env (et Railway), backend redémarré |
| **Google Cloud** | Client créé (Web, Android ou iOS), mêmes infos (package/bundle, SHA-1, origines) que l’app |
| **Flutter** | Même Client ID que le backend pour la plateforme utilisée ; pour le Web : origines autorisées + serverClientId si besoin |
| **Flutter Web** | Origines JavaScript autorisées dans le client Web ; pas de blocage popup |

---

*Si le problème continue, vérifier les logs Flutter (console / `debugPrint`) et les logs du backend au moment de **POST /auth/google** (erreur 401 = token invalide ou mauvais Client ID).*
