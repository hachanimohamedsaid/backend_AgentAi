import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdvisorService } from './advisor.service';
import { AnalyzeAdvisorDto } from './dto/analyze.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';

@Controller('api/advisor')
export class AdvisorController {
  constructor(private readonly advisorService: AdvisorService) {}

  @Post('analyze')
  @UseGuards(OptionalJwtAuthGuard)
  async analyze(
    @Body() dto: AnalyzeAdvisorDto,
    @CurrentUser() user: UserDocument | undefined,
  ) {
    const userId = user ? (user as any)._id?.toString() : undefined;
    return this.advisorService.analyze(dto.project_text, userId);
  }

  @Get('history')
  @UseGuards(OptionalJwtAuthGuard)
  async getHistory(@CurrentUser() user: UserDocument | undefined) {
    const userId = user ? (user as any)._id?.toString() : undefined;
    const analyses = await this.advisorService.getHistory(userId);
    return { analyses };
  }
}
