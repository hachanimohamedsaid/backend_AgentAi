import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Keycloak from 'keycloak-connect';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'KEYCLOAK_INSTANCE',
      useFactory: (configService: ConfigService) => {
        const keycloakConfig: Keycloak.KeycloakConfig = {
          'realm': configService.get<string>('KEYCLOAK_REALM'),
          'auth-server-url': configService.get<string>('KEYCLOAK_AUTH_SERVER_URL'),
          'ssl-required': 'external',
          'resource': configService.get<string>('KEYCLOAK_CLIENT_ID'),
          'credentials': {
            'secret': configService.get<string>('KEYCLOAK_CLIENT_SECRET'),
          },
          'confidential-port': 0,
        };
        return new Keycloak({}, keycloakConfig);
      },
      inject: [ConfigService],
    },
  ],
  exports: ['KEYCLOAK_INSTANCE'],
})
export class KeycloakProviderModule {}
