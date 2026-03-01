# Code NestJS – Connexion Google + JWT

Ce document décrit l’implémentation de **POST /auth/google** pour une app Flutter : vérification de l’idToken Google, findOrCreate utilisateur, génération JWT.

---

## Contrat API

| Côté | Détail |
|------|--------|
| **Requête** | `POST /auth/google` avec body `{ "idToken": "<idToken Google>" }` |
| **Réponse** | `{ "user": { "id", "name", "email" }, "accessToken": "<JWT>" }` |

---

## 1. Dépendances

```bash
npm install google-auth-library
# Déjà présents : @nestjs/jwt @nestjs/passport passport-jwt @nestjs/config
```

---

## 2. Variables d’environnement

Même **Client ID** que dans la console Google (Web application) et côté Flutter. Ne pas mettre le Client Secret dans le front ; on vérifie uniquement l’idToken avec le Client ID.

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
JWT_SECRET=ton_secret_jwt_fort_et_long
JWT_EXPIRES_IN=7d
```

Sur Railway : ajouter ces variables dans **Variables** du service.

---

## 3. DTO – Google Auth

**Fichier : `src/auth/dto/google-auth.dto.ts`**

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
```

---

## 4. AuthService – googleLogin

**Fichier : `src/auth/auth.service.ts`**

- Vérifier l’idToken avec `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`.
- Extraire du payload : `sub` (googleId), `email`, `name`, `picture`.
- Trouver ou créer l’utilisateur : `findByGoogleId` → sinon `findByEmail` + `linkGoogleId` → sinon `createFromGoogle`.
- Générer un JWT (`sub` = user.id, `email`) avec `JWT_SECRET` et `JWT_EXPIRES_IN`.
- Retourner `{ user: { id, name, email }, accessToken }`.

Extrait de la méthode :

```typescript
import { OAuth2Client } from 'google-auth-library';

async loginWithGoogle(dto: GoogleAuthDto): Promise<AuthResponse> {
  const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
  if (!clientId) {
    throw new UnauthorizedException('GOOGLE_CLIENT_ID not configured');
  }
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: dto.idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new UnauthorizedException('Google token missing email');
  }
  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const name = payload.name ?? payload.email.split('@')[0] ?? 'User';
  const picture = payload.picture ?? undefined;

  let user = await this.usersService.findByGoogleId(googleId);
  if (!user) {
    user = await this.usersService.findByEmail(email);
    if (user) {
      await this.usersService.linkGoogleId((user as any)._id.toString(), googleId);
    } else {
      user = await this.usersService.createFromGoogle({
        email,
        name,
        googleId,
        picture,
      });
    }
  }

  const accessToken = await this.signToken({
    sub: (user as any)._id.toString(),
    email: user.email,
  });
  return {
    user: this.toUserPayload(user),  // { id, name, email }
    accessToken,
  };
}
```

---

## 5. AuthController – POST /auth/google

**Fichier : `src/auth/auth.controller.ts`**

```typescript
@Post('google')
@HttpCode(HttpStatus.OK)
async loginWithGoogle(@Body() dto: GoogleAuthDto): Promise<AuthResponse> {
  return this.authService.loginWithGoogle(dto);
}
```

Le body est validé par le **ValidationPipe** global (`whitelist: true`).

---

## 6. Schéma User (Mongoose)

**Fichier : `src/users/schemas/user.schema.ts`**

Champs utiles pour Google :

- `name` (requis)
- `email` (requis, unique)
- `password` (optionnel)
- `googleId` (optionnel, sparse)
- `avatarUrl` (optionnel, rempli avec `picture` Google)

---

## 7. UsersService – méthodes Google

**Fichier : `src/users/users.service.ts`**

- `findByGoogleId(googleId: string)` : `findOne({ googleId })`
- `findByEmail(email: string)` : `findOne({ email: toLowerCase })`
- `linkGoogleId(userId: string, googleId: string)` : `updateOne({ _id: userId }, { googleId })`
- `createFromGoogle({ email, name, googleId, picture? })` : crée un user sans mot de passe, avec `avatarUrl: picture ?? null`

Exemple **createFromGoogle** :

```typescript
async createFromGoogle(data: {
  email: string;
  name: string;
  googleId: string;
  picture?: string;
}): Promise<UserDocument> {
  return this.createUser({
    email: data.email.toLowerCase(),
    name: data.name,
    password: null,
    googleId: data.googleId,
    avatarUrl: data.picture ?? null,
  });
}
```

---

## 8. Résumé du flux

| Étape | Côté Flutter | Côté NestJS |
|-------|--------------|-------------|
| 1 | Utilisateur clique « Google Account » | — |
| 2 | Google renvoie un idToken (JWT) | — |
| 3 | `POST /auth/google` avec `{ "idToken": "..." }` | Reçu par AuthController |
| 4 | — | `OAuth2Client.verifyIdToken(idToken, audience: GOOGLE_CLIENT_ID)` |
| 5 | — | Extraction email, name, sub (googleId), picture du payload |
| 6 | — | findOrCreate user (findByGoogleId → findByEmail + linkGoogleId → createFromGoogle) |
| 7 | — | Génération JWT (sub = user.id, email) |
| 8 | Réponse `{ user, accessToken }` | Envoi 200 + JSON |
| 9 | Stockage accessToken, redirection | — |

---

## 9. Module et config

- **ConfigModule** : `ConfigModule.forRoot({ isGlobal: true })` dans `AppModule` pour lire `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `JWT_EXPIRES_IN`.
- **AuthModule** : importe `JwtModule.registerAsync(...)` avec `ConfigService`, et `UsersModule`.
- **ValidationPipe** global : `whitelist: true` (et optionnellement `forbidNonWhitelisted: true`) dans `main.ts`.

---

## 10. Railway + Flutter

- **Backend (Railway)** : Variables `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `MONGO_URI`.
- **Flutter** : `baseUrl` / `apiBaseUrl` pointe vers l’URL Railway (ex. `https://xxx.up.railway.app`).
- **Google Console** : Origines JavaScript autorisées = localhost + URL de l’app Flutter web en prod. Le backend n’a pas besoin d’être ajouté aux origines.

Une fois ce code en place, le bouton « Google Account » dans Flutter envoie l’idToken au backend NestJS, qui le vérifie et renvoie `user` + `accessToken` au format attendu.
