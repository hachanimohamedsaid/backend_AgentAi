import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RealtimeVoiceGateway } from './realtime.gateway';

@Module({
  imports: [ConfigModule],
  providers: [RealtimeVoiceGateway],
})
export class RealtimeModule {}
