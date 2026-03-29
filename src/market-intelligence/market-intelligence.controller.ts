import { Body, Controller, Post } from '@nestjs/common';
import { MarketIntelligenceDto } from './dto/market-intelligence.dto';
import { MarketIntelligenceService } from './market-intelligence.service';

@Controller('market-intelligence')
export class MarketIntelligenceController {
  constructor(
    private readonly marketIntelligenceService: MarketIntelligenceService,
  ) {}

  @Post()
  async analyse(@Body() dto: MarketIntelligenceDto) {
    return this.marketIntelligenceService.analyse(dto);
  }
}
