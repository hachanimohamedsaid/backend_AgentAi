import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChallengesService } from './challenges.service';

@Controller(['challenges', 'api/challenges'])
@UseGuards(JwtAuthGuard)
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get('catalog')
  async getChallengeCatalog() {
    return this.challengesService.findActiveCatalog();
  }
}
