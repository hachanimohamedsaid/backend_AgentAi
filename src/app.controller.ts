import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectConnection() private readonly mongo: Connection,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Vérifie que Nest est bien connecté à MongoDB (Mongoose). */
  @Get('health')
  health(): { status: string; mongodb: string } {
    const connected = this.mongo.readyState === 1; // 1 = connected
    return {
      status: connected ? 'ok' : 'degraded',
      mongodb: connected ? 'connected' : 'disconnected',
    };
  }
}
