import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { UsersModule } from '../users/users.module';
import { GoogleConnectController } from './google-connect.controller';
import { GoogleConnectService } from './google-connect.service';

@Module({
  imports: [
    HttpModule,
    UsersModule, // gives access to UsersService
  ],
  controllers: [GoogleConnectController],
  providers: [GoogleConnectService],
})
export class GoogleConnectModule {}
