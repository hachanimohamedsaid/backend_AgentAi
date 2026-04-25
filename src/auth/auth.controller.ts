import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller(['auth', 'api/auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('permissions')
  async permissionsFromAuth(@Req() req: Request) {
    return this.buildPermissionsResponse(req);
  }

  private buildPermissionsResponse(req: Request) {
    const user = req.user as any;
    const role = user?.role ?? null;
    const isAdmin = role === 'admin';
    const permissions = isAdmin
      ? ['users.read', 'users.write', 'users.delete', 'impersonate']
      : ['users.read'];

    return {
      data: {
        role,
        permissions,
        canImpersonate: isAdmin,
      },
    };
  }
}