import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { MobilityUberAuthService } from './mobility-uber-auth.service';

@Controller('mobility/providers/uber')
export class MobilityUberAuthController {
  constructor(private readonly uberAuthService: MobilityUberAuthService) {}

  @Get('connect')
  @UseGuards(JwtAuthGuard)
  connect(@CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    const url = this.uberAuthService.buildConnectUrl(userId);
    return { url };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.uberAuthService.getUberStatus(userId);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new BadRequestException({
        code: 'UBER_CALLBACK_INVALID',
        message: 'Missing code/state in Uber callback',
      });
    }

    await this.uberAuthService.exchangeCodeAndStore(code, state);

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <html>
        <head><title>Uber Connected</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Uber account connected</h2>
          <p>You can now return to the app and request real Uber rides.</p>
        </body>
      </html>
    `);
  }
}
