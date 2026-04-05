import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { GuestTokenPayload } from '../guest-token.service';

export const GUEST_INTERVIEW_STRATEGY = 'interview-guest';

/**
 * Stratégie Passport dédiée aux candidats invités.
 * Secret : GUEST_INTERVIEW_JWT_SECRET > GUEST_INVITE_SECRET > JWT_SECRET (fallback dev).
 * Discriminant obligatoire : payload.type === 'guest-interview'.
 * Séparée de la stratégie 'jwt' recruteur — les deux ne se croisent jamais.
 */
@Injectable()
export class GuestInterviewStrategy extends PassportStrategy(
  Strategy,
  GUEST_INTERVIEW_STRATEGY,
) {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('GUEST_INTERVIEW_JWT_SECRET') ??
        config.get<string>('GUEST_INVITE_SECRET') ??
        config.get<string>('JWT_SECRET') ??
        'unsafe-fallback-change-in-production',
    });
  }

  /** Appelé par Passport après vérification signature + expiration. */
  validate(payload: GuestTokenPayload): GuestTokenPayload {
    if (payload.type !== 'guest-interview') {
      throw new UnauthorizedException(
        'Token invalide : type attendu "guest-interview".',
      );
    }
    if (!payload.sub) {
      throw new UnauthorizedException('Token malformé : champ sub manquant.');
    }
    return payload; // injecté dans req.user
  }
}
