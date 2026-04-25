import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import * as Keycloak from 'keycloak-connect';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  private keycloak: Keycloak.Keycloak;

  constructor(private readonly configService: ConfigService) {
    const keycloakConfig: Keycloak.KeycloakConfig = {
      'realm': this.configService.get<string>('KEYCLOAK_REALM'),
      'auth-server-url': this.configService.get<string>('KEYCLOAK_AUTH_SERVER_URL'),
      'ssl-required': 'external',
      'resource': this.configService.get<string>('KEYCLOAK_CLIENT_ID'),
      'credentials': {
        'secret': this.configService.get<string>('KEYCLOAK_CLIENT_SECRET'),
      },
      'confidential-port': 0,
    };
    this.keycloak = new Keycloak({}, keycloakConfig);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    return new Promise((resolve, reject) => {
      this.keycloak.protect()(req, res, (err: any) => {
        if (err) {
          reject(new UnauthorizedException('Keycloak authentication failed'));
        } else {
          resolve(true);
        }
      });
    });
  }
}
