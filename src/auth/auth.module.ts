import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { ImpersonationController } from './impersonation.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_SECRET') ?? '7e6c26f44782b2b49cbf9e37fe77d013d41b43bcc9a47993e2024905ee04aad6',
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d',
        } as JwtModuleOptions['signOptions'],
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, ImpersonationController],
  providers: [AuthService, JwtStrategy, OptionalJwtAuthGuard, JwtAuthGuard],
  exports: [AuthService, OptionalJwtAuthGuard, JwtAuthGuard, PassportModule],
})
export class AuthModule {}
