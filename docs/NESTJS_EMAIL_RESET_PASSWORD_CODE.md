# Code NestJS – Reset Password (Resend)

Ce document décrit l’implémentation du **reset password** côté backend NestJS : token stocké sur le modèle User, envoi du lien par email via **Resend** (pas SendGrid).

---

## Contrat API

| Méthode | Route | Body | Effet |
|---------|--------|------|--------|
| POST | `/auth/reset-password` | `{ "email": "..." }` | 200 OK ; si l’email existe, envoi d’un email avec lien `FRONTEND_RESET_PASSWORD_URL?token=...` via Resend. |
| POST | `/auth/reset-password/confirm` | `{ "token": "...", "newPassword": "..." }` | 200 OK ; mot de passe mis à jour, token invalidé. |

---

## 1. Variables d’environnement

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=onboarding@resend.dev
FRONTEND_RESET_PASSWORD_URL=https://ton-app.web.app/reset-password/confirm
```

- **RESEND_API_KEY** : clé API Resend (dashboard Resend).
- **EMAIL_FROM** : expéditeur des emails (ex. `onboarding@resend.dev` ou domaine vérifié).
- **FRONTEND_RESET_PASSWORD_URL** : URL de la page « définir nouveau mot de passe » dans l’app Flutter. Le backend envoie dans l’email : cette URL + `?token=<token>`.

---

## 2. Schéma User (Mongoose) – champs reset

Le token et l’expiration sont stockés sur le modèle **User** (pas de schéma séparé `PasswordResetToken`) :

- `resetPasswordToken` (string, optionnel)
- `resetPasswordExpires` (Date, optionnel)

**Fichier : `src/users/schemas/user.schema.ts`**

```typescript
@Prop({ type: String, default: null })
resetPasswordToken: string | null;

@Prop({ type: Date, default: null })
resetPasswordExpires: Date | null;
```

---

## 3. AuthService – requestPasswordReset (POST /auth/reset-password)

1. Trouver l’utilisateur par email.
2. Générer un token aléatoire (ex. `crypto.randomBytes(32).toString('hex')`).
3. Stocker sur l’utilisateur : `resetPasswordToken`, `resetPasswordExpires` (ex. maintenant + 1h).
4. Construire le lien : `FRONTEND_RESET_PASSWORD_URL.replace(/\/$/, '') + '?token=' + token`.
5. Si `RESEND_API_KEY` est défini : envoyer l’email via Resend (`from`, `to`, `subject`, `text`, `html` avec le lien).
6. Toujours retourner 200 (ne pas révéler si l’email existe ou non).

Extrait (Resend) :

```typescript
import { Resend } from 'resend';

async resetPassword(email: string): Promise<void> {
  const user = await this.usersService.findByEmail(email);
  if (!user) return;

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1h
  (user as any).resetPasswordToken = token;
  (user as any).resetPasswordExpires = expires;
  await user.save();

  const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
  const emailFrom = this.configService.get<string>('EMAIL_FROM') ?? 'onboarding@resend.dev';
  const frontendResetUrl = this.configService.get<string>('FRONTEND_RESET_PASSWORD_URL')
    ?? 'https://yourapp.com/reset-password/confirm';
  const resetLink = `${frontendResetUrl.replace(/\/$/, '')}?token=${token}`;

  if (resendApiKey) {
    const resend = new Resend(resendApiKey);
    try {
      await resend.emails.send({
        from: emailFrom,
        to: user.email,
        subject: 'Reset your password',
        text: `Use this link to reset your password (valid 1h): ${resetLink}`,
        html: `<p>Use this link to reset your password (valid 1h):</p><p><a href="${resetLink}">${resetLink}</a></p>`,
      });
    } catch (err: any) {
      console.error('[Resend] Reset email failed:', err?.message);
    }
  }
}
```

---

## 4. AuthService – confirmResetPassword (POST /auth/reset-password/confirm)

1. Trouver l’utilisateur par `resetPasswordToken` et vérifier que `resetPasswordExpires > now`.
2. Si non trouvé ou expiré : `BadRequestException('Invalid or expired reset token')`.
3. Hasher le nouveau mot de passe, mettre à jour `password`, mettre `resetPasswordToken` et `resetPasswordExpires` à `null`.
4. Sauvegarder.

**UsersService** : `findByResetToken(token)` → `findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: new Date() } })`.

---

## 5. AuthController

```typescript
@Post('reset-password')
@HttpCode(HttpStatus.OK)
async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
  await this.authService.resetPassword(dto.email);
  return { message: 'If this email is registered, you will receive reset instructions.' };
}

@Post('reset-password/confirm')
@HttpCode(HttpStatus.OK)
async setNewPassword(@Body() dto: SetNewPasswordDto): Promise<{ message: string }> {
  await this.authService.setNewPassword(dto.token, dto.newPassword);
  return { message: 'Password has been reset. You can now sign in.' };
}
```

---

## 6. Résumé du flux

| Étape | Côté Flutter | Côté NestJS |
|-------|--------------|-------------|
| 1 | Utilisateur saisit son email, envoie POST /auth/reset-password | Reçu par AuthController |
| 2 | — | findUser by email, génère token, sauvegarde resetPasswordToken + resetPasswordExpires (1h) |
| 3 | — | Envoi email via Resend avec lien FRONTEND_RESET_PASSWORD_URL?token=... |
| 4 | Réponse 200 | — |
| 5 | Utilisateur clique sur le lien, arrive sur la page « nouveau mot de passe » avec ?token=... | — |
| 6 | Envoie POST /auth/reset-password/confirm avec { token, newPassword } | Reçu par AuthController |
| 7 | — | findByResetToken(token), vérifie expiration, met à jour password, invalide token |
| 8 | Réponse 200, redirection login | — |

---

## 7. Dépendance

```bash
npm install resend
```

Pas de SendGrid : ce projet utilise uniquement Resend pour l’envoi des emails de reset password.
