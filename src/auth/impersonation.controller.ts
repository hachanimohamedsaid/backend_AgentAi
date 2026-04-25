import {
  Body,
  Controller,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

class ImpersonateDto {
  userId?: string;
  id?: string;
  targetUserId?: string;
  user?: { id?: string; _id?: string } | string;
}

@Controller()
export class ImpersonationController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Post('api/auth/impersonate')
  async impersonateFromApiAuth(@Req() req: Request, @Body() dto: ImpersonateDto) {
    return this.impersonate(req, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/impersonate')
  async impersonateFromAuth(@Req() req: Request, @Body() dto: ImpersonateDto) {
    return this.impersonate(req, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api/admin/impersonate')
  async impersonateFromApiAdmin(@Req() req: Request, @Body() dto: ImpersonateDto) {
    return this.impersonate(req, dto);
  }

  private resolveTargetUserId(dto: ImpersonateDto): string | null {
    const nestedUserId =
      typeof dto?.user === 'string'
        ? dto.user
        : dto?.user?.id ?? dto?.user?._id ?? null;

    const candidate =
      dto?.userId ?? dto?.targetUserId ?? dto?.id ?? nestedUserId ?? null;

    if (typeof candidate !== 'string') {
      return null;
    }

    const normalized = candidate.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private async impersonate(req: Request, dto: ImpersonateDto) {
    const targetUserId = this.resolveTargetUserId(dto);

    if (!targetUserId || !Types.ObjectId.isValid(targetUserId)) {
      throw new UnprocessableEntityException({
        message:
          'A valid target user id is required (accepted: userId, targetUserId, id, user.id, user._id).',
        code: 'INVALID_IMPERSONATION_PAYLOAD',
      });
    }

    const result = await this.authService.impersonateUser(req.user as any, targetUserId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });

    return {
      data: {
        token: result.token,
        accessToken: result.token,
        jwt: result.token,
        user: result.user,
        account: result.user,
        profile: result.user,
      },
    };
  }
}
