# Code NestJS : vérification email avec lien (Resend)

Même principe que le reset password : envoi d'un email via **Resend** avec un lien contenant un token. Au clic, l'utilisateur est redirigé vers l'app qui appelle le backend pour confirmer et passer `emailVerified` à `true`.

---

## 1. Variables d'environnement

Même config que le reset password (Resend) :

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=onboarding@resend.dev
```

Ajouter une URL pour le lien de vérification (page Flutter / web) :

```env
# Lien de vérification email : l'app ouvrira cette URL + ?token=...
FRONTEND_VERIFY_EMAIL_URL=https://ton-app.web.app/verify-email/confirm
# En dev : http://localhost:8080/verify-email/confirm  ou  myapp://verify-email/confirm
```

---

## 2. Schéma User (MongoDB)

Champs pour le token de vérification (sur le schéma User) :

```typescript
// src/users/schemas/user.schema.ts
@Prop({ type: Boolean, default: false })
emailVerified: boolean;

@Prop({ type: String, default: null })
emailVerificationToken: string | null;

@Prop({ type: Date, default: null })
emailVerificationExpires: Date | null;
```

- À l'inscription (register) : `emailVerified: false`, token et expires générés puis email envoyé.
- Après envoi de l'email de vérification : `emailVerificationToken` et `emailVerificationExpires` (ex. 24 h).
- Après confirmation (lien cliqué, POST /auth/verify-email/confirm) : `emailVerified: true`, token et expires à `null`.
- Pour Google Sign-In : à la création du user, mettre `emailVerified: true`.

---

## 3. AuthService – envoi email + confirmation

Utiliser le même client **Resend** que pour le reset password.

**Envoi pour l'utilisateur connecté (JWT) – POST /auth/verify-email :**

```typescript
async sendVerificationEmailForCurrentUser(userId: string): Promise<void> {
  const user = await this.usersService.findById(userId);
  if (!user || (user as any).emailVerified) return;
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  (user as any).emailVerificationToken = token;
  (user as any).emailVerificationExpires = expires;
  await user.save();
  await this.sendVerificationEmailToUser(user, token);
}
```

**Confirmation – POST /auth/verify-email/confirm (token dans le body) :**

```typescript
async verifyEmail(token: string): Promise<void> {
  const user = await this.usersService.findByEmailVerificationToken(token);
  if (!user) throw new BadRequestException('Invalid or expired verification token');
  (user as any).emailVerified = true;
  (user as any).emailVerificationToken = null;
  (user as any).emailVerificationExpires = null;
  await user.save();
}
```

Méthode privée d'envoi (sujet et lien) :

```typescript
private async sendVerificationEmailToUser(user: UserDocument, token: string): Promise<void> {
  const verifyUrl = this.configService.get<string>('FRONTEND_VERIFY_EMAIL_URL') ?? '...';
  const link = `${verifyUrl.replace(/\/$/, '')}?token=${token}`;
  // Resend.emails.send({ from, to: user.email, subject: 'Vérifiez votre adresse email', html: ... })
}
```

---

## 4. Routes

| Méthode | Route | Body / Headers | Effet |
|--------|--------|----------------|--------|
| POST | `/auth/verify-email` | Header `Authorization: Bearer <accessToken>` | Envoi de l'email avec lien (Resend) |
| POST | `/auth/verify-email/confirm` | `{ "token": "..." }` | Confirmation et passage à `emailVerified: true` |

- **POST /auth/verify-email** : extraire le `userId` du JWT, appeler `sendVerificationEmailForCurrentUser(userId)`.
- **POST /auth/verify-email/confirm** : lire `token` dans le body, appeler `verifyEmail(token)`.

Optionnel : **POST /auth/send-verification-email** avec `{ "email": "..." }` pour renvoyer le lien sans être connecté.

---

## 5. GET /auth/me

Inclure `emailVerified` dans la réponse pour que l'app affiche « Verified » après confirmation.

---

## 6. Flutter

- L'app appelle **POST /auth/verify-email** avec le JWT quand l'utilisateur tape « Verify » (Privacy & Security).
- Le lien dans l'email pointe vers **FRONTEND_VERIFY_EMAIL_URL?token=...** (ex. `/verify-email/confirm?token=...`). L'app ouvre cette route, envoie le token à **POST /auth/verify-email/confirm**, puis affiche un succès et recharge le profil.
