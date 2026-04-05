import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { GuestTokenPayload } from '../guest-token.service';

/**
 * Injecte le payload du guest JWT validé par GuestInterviewGuard.
 * Usage : @GuestPayload() payload: GuestTokenPayload
 */
export const GuestPayload = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): GuestTokenPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: GuestTokenPayload }>();
    return request.user;
  },
);
