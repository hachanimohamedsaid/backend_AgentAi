# Étapes pour configurer SendGrid (Reset Password)

SendGrid est utilisé dans ce backend pour envoyer l’email de **réinitialisation de mot de passe** (lien avec token valide 1h). Voici les étapes pour le configurer.

---

## 1. Créer un compte SendGrid

1. Va sur **[https://sendgrid.com](https://sendgrid.com)**.
2. Clique sur **Sign Up** et crée un compte (gratuit jusqu’à un certain volume d’emails/mois).
3. Valide ton email si demandé.

---

## 2. Vérifier l’expéditeur (From Email)

SendGrid exige que l’adresse **From** soit vérifiée (ou un domaine vérifié).

### Option A : Single Sender Verification (simple pour tester)

1. Dans le dashboard SendGrid : **Settings** → **Sender Authentication**.
2. Clique sur **Verify a Single Sender**.
3. Renseigne :
   - **From Name** : ex. `Mon App`
   - **From Email** : l’email qui enverra les emails (ex. `noreply@ton-domaine.com` ou une adresse Gmail pour les tests).
   - Les autres champs demandés.
4. Clique sur **Create**.
5. Clique sur le lien reçu dans la boîte mail de cette adresse pour **vérifier** le sender.

Tu utiliseras exactement cette adresse dans `SENDGRID_FROM_EMAIL`.

### Option B : Domain Authentication (recommandé en prod)

1. **Settings** → **Sender Authentication** → **Authenticate Your Domain**.
2. Suis les instructions (enregistrement DNS : CNAME, etc.) pour ton domaine.
3. Une fois le domaine vérifié, tu peux utiliser n’importe quelle adresse `@ton-domaine.com` comme `SENDGRID_FROM_EMAIL`.

---

## 3. Créer une clé API (API Key)

1. Dans SendGrid : **Settings** → **API Keys**.
2. Clique sur **Create API Key**.
3. **Name** : ex. `Backend Reset Password`.
4. **Permissions** : choisis **Restricted Access**, puis active au minimum :
   - **Mail Send** → **Full Access** (ou au minimum **Mail Send**).
5. Clique sur **Create & View**.
6. **Copie la clé** immédiatement (elle ne sera plus affichée ensuite). Elle ressemble à :  
   `SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

Tu utiliseras cette valeur dans `SENDGRID_API_KEY`.

---

## 4. Configurer les variables d’environnement

Dans ton projet backend, crée ou édite le fichier **`.env`** (à la racine du projet, comme dans `.env.example`) :

```env
# SendGrid – envoi du lien "Reset Password" par email
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@ton-domaine.com
RESET_LINK_BASE_URL=https://ton-app.com/reset-password
```

| Variable | Description | Exemple |
|----------|-------------|--------|
| **SENDGRID_API_KEY** | Clé API SendGrid (étape 3) | `SG.xxxx...` |
| **SENDGRID_FROM_EMAIL** | Adresse expéditrice **vérifiée** (étape 2) | `noreply@ton-domaine.com` |
| **RESET_LINK_BASE_URL** | URL de base du lien dans l’email (page reset password côté app) | `https://ton-app.com/reset-password` ou `https://ton-app.com/auth/reset` |

- **RESET_LINK_BASE_URL** : l’email contiendra un lien du type :  
  `{RESET_LINK_BASE_URL}?token=xxx`  
  L’utilisateur clique dessus, ton app (Flutter ou web) récupère le `token` dans l’URL et appelle **POST /auth/reset-password/confirm** avec `token` et `newPassword`.

Si **SENDGRID_API_KEY** est absent ou vide, le backend ne plantera pas : il enregistrera quand même le token en base, mais **n’enverra pas d’email** (et ne loguera qu’une erreur côté serveur).

---

## 5. Redémarrer le backend

Après avoir modifié `.env` :

```bash
npm run start:dev
```

ou redémarre le processus en production.

---

## 6. Tester le flux Reset Password

1. Appelle **POST /auth/reset-password** avec le body : `{ "email": "une-adresse-verifiee@example.com" }`.
2. Vérifie la boîte mail de cette adresse : tu dois recevoir un email avec le lien de réinitialisation.
3. Le lien est de la forme : `{RESET_LINK_BASE_URL}?token=...`.
4. Dans ton app (Flutter), récupère le `token` depuis l’URL puis appelle **POST /auth/reset-password/confirm** avec `{ "token": "...", "newPassword": "nouveau_mot_de_passe" }`.

Si l’email n’arrive pas :

- Vérifie les **spams**.
- Vérifie que **SENDGRID_API_KEY** et **SENDGRID_FROM_EMAIL** sont corrects dans `.env`.
- Vérifie que l’expéditeur (From) est bien **vérifié** dans SendGrid.
- Regarde les logs du backend : en cas d’erreur SendGrid, un message du type `[SendGrid] Reset email failed:` est affiché.

---

## Récapitulatif

| Étape | Action |
|-------|--------|
| 1 | Créer un compte SendGrid |
| 2 | Vérifier l’expéditeur (Single Sender ou Domain Authentication) |
| 3 | Créer une API Key (Mail Send) et copier la clé |
| 4 | Ajouter dans `.env` : `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `RESET_LINK_BASE_URL` |
| 5 | Redémarrer le backend |
| 6 | Tester avec POST /auth/reset-password |

---

*SendGrid est utilisé uniquement pour l’envoi de l’email de réinitialisation de mot de passe (voir `src/auth/auth.service.ts`, méthode `resetPassword`).*
