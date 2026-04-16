import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class RhRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { role?: string | null } }>();
    const role = request.user?.role?.toLowerCase?.().trim?.() ?? '';
    if (role === 'rh' || role === 'hr' || role === 'admin') {
      return true;
    }
    throw new ForbiddenException('RH access required');
  }
}
