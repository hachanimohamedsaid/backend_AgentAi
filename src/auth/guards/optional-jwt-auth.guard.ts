import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT optionnel : si le client envoie Authorization: Bearer <token>, valide le token et attache l'utilisateur à la requête.
 * Si pas de token ou token invalide, n'attache pas d'utilisateur (request.user reste undefined) et ne rejette pas la requête.
 * Utile pour POST /ai/chat : utilisable sans connexion, mais le backend peut identifier l'utilisateur quand il est connecté.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: Error | null, user: TUser | false): TUser | undefined {
    if (err || user === false) {
      return undefined;
    }
    return user ?? undefined;
  }
}
