import { Controller, Get, UseGuards } from '@nestjs/common';
import { KeycloakAuthGuard } from '../auth/keycloak-auth.guard';
import { ChallengesService } from './challenges.service';

@Controller(['challenges', 'api/challenges'])
@UseGuards(KeycloakAuthGuard)
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get('catalog')
  async getChallengeCatalog() {
    return this.challengesService.findActiveCatalog();
  }
}
