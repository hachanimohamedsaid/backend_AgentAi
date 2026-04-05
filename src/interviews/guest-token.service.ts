import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export interface GuestTokenPayload {
  /** evaluationId — identifiant de l'évaluation liée à la session */
  sub: string;
  candidateName?: string;
  jobTitle?: string;
  email?: string;
  /** Discriminant : rejette les access tokens recruteur utilisés comme guest token */
  type: 'guest-interview';
  iat?: number;
  exp?: number;
}

@Injectable()
export class GuestTokenService {
  private readonly logger = new Logger(GuestTokenService.name);

  constructor(private readonly config: ConfigService) {}

  /** Priorité : GUEST_INTERVIEW_JWT_SECRET > GUEST_INVITE_SECRET > JWT_SECRET */
  secret(): string {
    const s =
      this.config.get<string>('GUEST_INTERVIEW_JWT_SECRET') ??
      this.config.get<string>('GUEST_INVITE_SECRET') ??
      this.config.get<string>('JWT_SECRET');
    if (!s) {
      this.logger.warn(
        'Aucun secret guest configuré (GUEST_INTERVIEW_JWT_SECRET / GUEST_INVITE_SECRET / JWT_SECRET) — fallback non sécurisé utilisé.',
      );
      return 'unsafe-fallback-change-in-production';
    }
    return s;
  }

  /** Signe un guest JWT (défaut 7 jours). */
  sign(
    payload: Omit<GuestTokenPayload, 'type' | 'iat' | 'exp'>,
    ttlDays = 7,
  ): string {
    return jwt.sign(
      { ...payload, type: 'guest-interview' } as object,
      this.secret(),
      { expiresIn: `${ttlDays}d` },
    );
  }

  /** Vérifie manuellement (hors Passport) — utilisé par generate-invite avant redirection. */
  verify(token: string): GuestTokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret()) as GuestTokenPayload;
      if (decoded.type !== 'guest-interview') {
        throw new UnauthorizedException('Type de jeton invalide.');
      }
      if (!decoded.sub) {
        throw new UnauthorizedException('Jeton malformé : sub manquant.');
      }
      return decoded;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      if (e instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException("Le lien d'invitation a expiré.");
      }
      throw new UnauthorizedException("Jeton d'invitation invalide ou corrompu.");
    }
  }
}
