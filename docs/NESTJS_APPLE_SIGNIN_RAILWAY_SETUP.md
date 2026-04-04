# NESTJS Apple Sign-In - Fiche Complete (Premiere Integration)

## 1) Fiche Rapide (Checklist)

1. Apple Developer:
- Active Sign in with Apple pour ton App ID (bundle iOS).
- Bundle iOS doit etre identique a l'app Flutter iOS.

2. Front iOS:
- Le bouton Apple retourne un identityToken non vide.
- Le front envoie identityToken au backend sur POST /auth/apple.

3. Backend NestJS:
- Verifie identityToken avec la cle publique Apple (JWKS).
- Controle issuer et audience.
- Cree/connecte utilisateur.
- Retourne accessToken app (JWT backend).

4. Railway:
- Ajoute les variables d'environnement Apple (audience iOS).
- Redeploy apres modification.

5. Validation:
- Test login Apple sur iOS.
- Verifie logs backend (success, aud, sub).

---

## 2) Contexte et principe

Sur iOS natif, le SDK Apple du front retourne un identityToken (JWT signe par Apple).
Le backend doit verifier ce JWT contre les cles Apple:

- Issuer attendu: https://appleid.apple.com
- Audience attendue: bundle id iOS de ton app (ex: com.pidevagentia.ava)

Si la verification passe:
- Lire sub (Apple user id stable)
- Lire email (souvent fourni seulement la premiere fois)
- Creer ou retrouver l'utilisateur
- Retourner token de session backend

---

## 3) Variables Railway a ajouter

Exemple minimal:

```env
APPLE_AUDIENCE_IOS=com.pidevagentia.ava
APPLE_AUDIENCES=com.pidevagentia.ava
```

Option multi-audience (si besoin futur web/service id):

```env
APPLE_AUDIENCES=com.pidevagentia.ava,com.pidevagentia.web
```

Important:
- Pas d'espaces autour des virgules.
- Redeploy obligatoire apres update.

---

## 4) DTO backend

```ts
import { IsOptional, IsString } from 'class-validator';

export class AppleLoginDto {
  @IsString()
  identityToken!: string;

  @IsOptional()
  @IsString()
  user?: string; // JSON user from iOS first authorization (optional)
}
```

---

## 5) Service de verification Apple (NestJS)

Dependance:

- npm install jose

Service:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

@Injectable()
export class AppleTokenVerifierService {
  private readonly appleIssuer = 'https://appleid.apple.com';
  private readonly appleJwks = createRemoteJWKSet(
    new URL('https://appleid.apple.com/auth/keys'),
  );

  constructor(private readonly config: ConfigService) {}

  private getAllowedAudiences(): string[] {
    const single = (this.config.get<string>('APPLE_AUDIENCE_IOS') ?? '').trim();
    const multi = (this.config.get<string>('APPLE_AUDIENCES') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    return Array.from(new Set([single, ...multi].filter(Boolean)));
  }

  async verifyIdentityToken(identityToken: string): Promise<JWTPayload> {
    const audiences = this.getAllowedAudiences();
    if (!audiences.length) {
      throw new UnauthorizedException('Apple auth backend not configured');
    }

    try {
      const { payload } = await jwtVerify(identityToken, this.appleJwks, {
        issuer: this.appleIssuer,
        audience: audiences,
      });
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid Apple identityToken');
    }
  }
}
```

---

## 6) Route POST /auth/apple (exemple)

```ts
import { Body, Controller, Post } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly appleVerifier: AppleTokenVerifierService,
    // private readonly usersService: UsersService,
    // private readonly authService: AuthService,
  ) {}

  @Post('apple')
  async loginWithApple(@Body() dto: AppleLoginDto) {
    const payload = await this.appleVerifier.verifyIdentityToken(dto.identityToken);

    const appleSub = String(payload.sub ?? '');
    const emailFromToken = payload.email ? String(payload.email) : null;

    if (!appleSub) {
      throw new Error('Missing Apple sub');
    }

    // 1) Retrouver user par appleSub
    // 2) Sinon creer user (email si present)
    // 3) Generer JWT backend

    return {
      ok: true,
      provider: 'apple',
      appleSub,
      email: emailFromToken,
      // accessToken: '...'
    };
  }
}
```

---

## 7) Points importants (Apple specifique)

1. Email Apple:
- Apple peut fournir email seulement lors de la premiere autorisation.
- Ensuite, il faut se baser sur sub comme identifiant principal.

2. Identifiant stable:
- payload.sub est la cle stable par app Apple.

3. Erreurs frequentes:
- Invalid audience: bundle id backend/env ne correspond pas a l'app iOS.
- Invalid token: token vide, token altere, mauvais issuer.

---

## 8) Logs backend recommandes

Ne jamais logger le token complet.
Logger seulement:

1. route appelee: POST /auth/apple
2. resultat verify: success/fail
3. aud recu (payload.aud)
4. sub present ou non

Exemple:

```ts
logger.log(`Apple auth verify success: aud=${String(payload.aud)} sub=${String(payload.sub)}`);
```

---

## 9) Procedure de test complete

1. iOS app -> bouton Apple.
2. Front envoie identityToken a POST /auth/apple.
3. Backend verify JWT Apple.
4. Backend retourne 200 + token app.

Si echec:

1. Pas de hit backend:
- Probleme frontend Apple flow.

2. 401 Invalid Apple identityToken:
- Verifier APPLE_AUDIENCE_IOS / APPLE_AUDIENCES.
- Verifier bundle id iOS.

3. 500 interne:
- Erreur creation user/session backend.

---

## 10) Valeurs a conserver (secret management)

Documenter:

1. Bundle iOS
2. APPLE_AUDIENCE_IOS
3. APPLE_AUDIENCES
4. Date des changements
5. Projet Apple Developer associe

Cela evite les regressions sur les prochains deploys.
