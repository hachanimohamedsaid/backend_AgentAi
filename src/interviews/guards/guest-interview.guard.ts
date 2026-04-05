import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GUEST_INTERVIEW_STRATEGY } from '../strategies/guest-interview.strategy';

/**
 * Guard candidat invité — utilise la stratégie Passport 'interview-guest'.
 * → 401 si token absent, expiré ou signature invalide.
 * → 403 si le token ne correspond pas à la ressource (géré dans le service).
 * Ne pas mélanger avec JwtAuthGuard (recruteur).
 */
@Injectable()
export class GuestInterviewGuard extends AuthGuard(GUEST_INTERVIEW_STRATEGY) {}
