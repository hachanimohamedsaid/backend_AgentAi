# NESTJS Google Auth - Railway Setup Guide

## Objectif
Ce document explique la configuration backend Google Sign-In pour NestJS deploye sur Railway, avec support multi-clients (Web + iOS).

Contexte:
- Front Web utilise un client OAuth de type `Web`.
- Front iOS utilise un client OAuth de type `iOS`.
- Le backend doit accepter les deux `aud` (audience) des idToken Google.

---

## 1. Variables d'environnement Railway

Configurer ces variables dans Railway:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_IDS`

### Valeurs recommandees

- `GOOGLE_CLIENT_ID`: client principal (souvent Web).
- `GOOGLE_CLIENT_IDS`: liste complete des clients autorises, separes par des virgules.

Exemple:

```env
GOOGLE_CLIENT_ID=1089...webclient.apps.googleusercontent.com
GOOGLE_CLIENT_IDS=1089...webclient.apps.googleusercontent.com,1089...iosclient.apps.googleusercontent.com
```

Important:
- Pas d'espaces inutiles autour des virgules.
- Les IDs doivent etre exacts.
- Faire un redeploy apres modification.

---

## 2. Verification backend attendue

Le endpoint backend doit verifier le token Google avec audience autorisee:

- route: `POST /auth/google`
- body: `{ "idToken": "..." }`

La verification doit accepter:
- `GOOGLE_CLIENT_ID`
- et toutes les valeurs de `GOOGLE_CLIENT_IDS`

Si ton code ne lit qu'un seul client ID, il faut l'etendre pour accepter une liste.

---

## 3. Check-list rapide

1. Le frontend iOS a un client OAuth iOS valide.
2. Le frontend web a son client OAuth Web valide.
3. Railway contient les deux IDs dans `GOOGLE_CLIENT_IDS`.
4. Backend redeploye apres mise a jour env.
5. Test manuel de `POST /auth/google` depuis app.

---

## 4. Diagnostic des erreurs

### Cas A - Aucun appel backend
Symptome:
- Pas de trace `POST /auth/google` dans Railway.

Cause probable:
- Probleme frontend Google Sign-In (config iOS/Web, URL scheme, client type).

### Cas B - `POST /auth/google` present mais `401`
Symptome:
- Railway log montre appel puis refus.

Cause probable:
- `aud` du token ne correspond pas aux clients autorises backend.
- `GOOGLE_CLIENT_IDS` incomplet ou incorrect.

### Cas C - `invalid_request` cote Google avant backend
Symptome:
- Erreur Google OAuth du type `WEB client type` / `custom scheme`.

Cause probable:
- Client OAuth Web utilise dans un flow iOS natif.

---

## 5. Log minimal recommande (backend)

Ajouter un log non sensible pour debug:

- route appelee
- provider: google
- resultat verification token: success/fail
- audience token (`aud`) recue

Ne jamais logger le token complet.

---

## 6. Procedure de validation finale

1. Lancer app iOS, login Google.
2. Verifier Railway logs:
   - appel `POST /auth/google` present.
3. Si 200:
   - authentification backend OK.
4. Si 401:
   - comparer `aud` du token avec `GOOGLE_CLIENT_IDS`.
5. Corriger env, redeployer, retester.

---

## 7. Valeurs a conserver

Documenter dans ton gestionnaire secret:
- Web Client ID
- iOS Client ID
- Date de rotation
- Projet Google Cloud associe

Cela evite les regressions lors des prochains deploys.

---

## 8. Snippet NestJS pret a copier

Utilise ce pattern pour verifier un idToken Google avec plusieurs audiences (Web + iOS).

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

@Injectable()
export class GoogleTokenVerifierService {
   private readonly oauthClient = new OAuth2Client();

   constructor(private readonly configService: ConfigService) {}

   private getAllowedGoogleClientIds(): string[] {
      const single = (this.configService.get<string>('GOOGLE_CLIENT_ID') ?? '').trim();
      const multiRaw = this.configService.get<string>('GOOGLE_CLIENT_IDS') ?? '';

      const fromMulti = multiRaw
         .split(',')
         .map((v) => v.trim())
         .filter(Boolean);

      // Dedup + keep non-empty only
      return Array.from(new Set([single, ...fromMulti].filter(Boolean)));
   }

   async verifyIdToken(idToken: string): Promise<TokenPayload> {
      const audiences = this.getAllowedGoogleClientIds();
      if (!audiences.length) {
         throw new UnauthorizedException('Google auth backend not configured (no client ids).');
      }

      try {
         const ticket = await this.oauthClient.verifyIdToken({
            idToken,
            audience: audiences,
         });

         const payload = ticket.getPayload();
         if (!payload) {
            throw new UnauthorizedException('Google token payload is empty.');
         }

         return payload;
      } catch (e) {
         throw new UnauthorizedException('Invalid Google idToken');
      }
   }
}
```

Exemple d'utilisation dans `POST /auth/google`:

```ts
// dto: { idToken: string }
const payload = await this.googleTokenVerifierService.verifyIdToken(dto.idToken);
const email = payload.email;
const sub = payload.sub; // google user id
```

---

## 9. Logs Railway conseilles

Ajoute des logs backend non sensibles pour diagnostiquer vite:

1. Nombre de clients OAuth charges (`audiences.length`).
2. Valeur `aud` du token decode (pas le token complet).
3. Resultat verification (`success` / `invalid`).

Exemple:

```ts
this.logger.log(`Google auth audiences loaded: ${audiences.length}`);
this.logger.log(`Google token aud: ${String(payload?.aud ?? 'n/a')}`);
```

---

## 10. Erreur actuelle: Invalid Google idToken

Si le frontend iOS ouvre bien Google puis retourne `Invalid Google idToken`, alors:

1. Frontend iOS est globalement OK.
2. Le backend refuse l'audience du token.

Actions immediates:

1. Verifier `GOOGLE_CLIENT_IDS` contient Web + iOS.
2. Redeployer Railway.
3. Verifier que le code backend passe bien un tableau `audience` (pas une seule valeur).
