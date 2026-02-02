# Configuration nécessaire – Backend NestJS

Ce document récapitule **toute la configuration** à mettre en place dans le backend NestJS pour que l’app Flutter (login, register, Google Sign-In, reset password) fonctionne. Backend hébergé sur **Railway**.

---

## 1. Variables d’environnement (.env ou Railway)

À définir dans un fichier **`.env`** en local et dans **Railway → ton service → Variables**.

| Variable | Obligatoire | Description | Exemple |
|----------|-------------|-------------|--------|
| **GOOGLE_CLIENT_ID** | Oui (si Google) | Même Client ID que Flutter (Web application). Ne pas mettre le client secret dans le front. | `1089118476895-xxx.apps.googleusercontent.com` |
| **JWT_SECRET** | Oui | Secret pour signer les JWT (long, aléatoire). | `ton_secret_jwt_fort_et_long` |
| **JWT_EXPIRES_IN** | Non | Durée de vie du JWT. | `7d` |
| **MONGO_URI** ou **MONGODB_URI** | Oui (si MongoDB) | Chaîne de connexion MongoDB. | `mongodb+srv://...` ou `mongodb://localhost:27017/...` |
| **RESEND_API_KEY** | Oui (si reset password) | Clé API Resend (pas SendGrid). | `re_xxxxxxxxxxxx` |
| **EMAIL_FROM** | Oui (si reset password) | Expéditeur des emails. | `onboarding@resend.dev` ou `noreply@tondomaine.com` |
| **FRONTEND_RESET_PASSWORD_URL** | Oui (si reset password) | URL de la page « définir nouveau mot de passe » dans l’app Flutter. Le backend met dans l’email : cette URL + `?token=...` | En prod : `https://ton-app.web.app/reset-password/confirm` ; en dev : `http://localhost:8080/reset-password/confirm` |

**Exemple `.env` complet :**

```env
# Auth
GOOGLE_CLIENT_ID=1089118476895-xxx.apps.googleusercontent.com
JWT_SECRET=ton_secret_jwt_fort_et_long
JWT_EXPIRES_IN=7d

# Base de données (MONGO_URI ou MONGODB_URI)
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# Email – Reset Password (Resend, pas SendGrid)
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=onboarding@resend.dev
FRONTEND_RESET_PASSWORD_URL=https://ton-app.web.app/reset-password/confirm
```

---

## 2. Dépendances npm

À installer dans le projet NestJS :

```bash
# Google Sign-In (vérification idToken)
npm install google-auth-library

# JWT (généralement déjà présent)
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install -D @types/passport-jwt

# Reset Password – envoi email (Resend, pas SendGrid)
npm install resend
```

---

## 3. Module et Config (AppModule / AuthModule)

- **ConfigModule** : charger les variables d’environnement.

```typescript
// app.module.ts
ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })
```

- **AuthModule** : importer `JwtModule` (avec `JWT_SECRET`, `JWT_EXPIRES_IN` depuis `ConfigService`), `UsersModule`. Le token de reset est stocké sur le schéma **User** (`resetPasswordToken`, `resetPasswordExpires`).
- **ValidationPipe** global : pour valider les DTO (body) avec `whitelist: true` (dans `main.ts`).

---

## 4. Routes API attendues par Flutter

| Méthode | Route | Body (ex.) | Réponse / effet |
|---------|--------|------------|------------------|
| POST | `/auth/login` | `{ "email", "password" }` | `{ "user", "accessToken" }` |
| POST | `/auth/register` | `{ "name", "email", "password" }` | `{ "user", "accessToken" }` |
| POST | `/auth/google` | `{ "idToken": "..." }` | `{ "user": { "id", "name", "email" }, "accessToken" }` |
| POST | `/auth/reset-password` | `{ "email": "..." }` | 200 OK (email envoyé via Resend) |
| POST | `/auth/reset-password/confirm` | `{ "token": "...", "newPassword": "..." }` | 200 OK (mot de passe mis à jour, token invalidé) |
| GET | `/auth/me` | Header `Authorization: Bearer <accessToken>` | `{ "user" }` |
| POST | `/auth/change-password` | Header + `{ "currentPassword", "newPassword" }` | 200 OK |

---

## 5. Résumé par fonctionnalité

### Google Sign-In
- **Variables** : `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `JWT_EXPIRES_IN`.
- **Code** : voir `docs/NESTJS_GOOGLE_AUTH_CODE.md` (DTO, AuthService.googleLogin, AuthController, schéma User avec `googleId`).

### Reset Password (Resend)
- **Variables** : `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_RESET_PASSWORD_URL`.
- **Code** : voir `docs/NESTJS_EMAIL_RESET_PASSWORD_CODE.md` (schéma User avec `resetPasswordToken` / `resetPasswordExpires`, AuthService.resetPassword + setNewPassword, envoi email via Resend).

### Login / Register / JWT
- **Variables** : `JWT_SECRET`, `JWT_EXPIRES_IN`, `MONGO_URI` ou `MONGODB_URI`.
- **Config** : `ConfigModule.forRoot()`, `JwtModule.registerAsync(...)` avec `ConfigService`.

---

## 6. Railway

Dans **Railway** → ton service backend → **Variables**, ajoute toutes les variables listées au § 1 (sans les commiter en `.env` en prod ; Railway injecte les variables à l’exécution).

Après modification des variables, Railway redéploie automatiquement. Vérifier que l’URL du backend (ex. `https://backendagentai-production.up.railway.app`) est bien celle configurée dans Flutter (`lib/core/config/api_config.dart` → `baseUrl`).

---

## 7. Checklist

| # | Élément | Fait |
|---|---------|------|
| 1 | Variables d’environnement (env / Railway) | |
| 2 | `npm install google-auth-library resend @nestjs/jwt @nestjs/config` (etc.) | |
| 3 | `ConfigModule.forRoot()` dans AppModule | |
| 4 | JwtModule avec JWT_SECRET, JWT_EXPIRES_IN | |
| 5 | POST /auth/google (voir NESTJS_GOOGLE_AUTH_CODE.md) | |
| 6 | POST /auth/reset-password et /auth/reset-password/confirm (voir NESTJS_EMAIL_RESET_PASSWORD_CODE.md) | |
| 7 | ValidationPipe global (whitelist: true) | |
| 8 | Schéma User (googleId, resetPasswordToken, resetPasswordExpires) + UsersService (findByGoogleId, findByEmail, createFromGoogle, findByResetToken) | |
| 9 | Token reset stocké sur User avec TTL 1h | |

Une fois cette configuration en place, le backend NestJS (y compris sur Railway) est prêt pour le Flutter (login, register, Google Sign-In, reset password avec Resend).
