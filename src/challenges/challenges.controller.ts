import { Controller, Get, UseGuards } from '@nestjs/common';
import { ChallengesService } from './challenges.service';

@Controller(['challenges', 'api/challenges'])
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get('catalog')
  async getChallengeCatalog() {
    return this.challengesService.findActiveCatalog();
  }
}
