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
  userId!: string;
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

  private async impersonate(req: Request, dto: ImpersonateDto) {
    if (!dto?.userId || !Types.ObjectId.isValid(dto.userId)) {
      throw new UnprocessableEntityException({
        message: 'userId is required and must be a valid ObjectId',
        code: 'INVALID_IMPERSONATION_PAYLOAD',
      });
    }

    const result = await this.authService.impersonateUser(req.user as any, dto.userId, {
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
