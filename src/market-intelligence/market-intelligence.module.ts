import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MarketIntelligenceController } from './market-intelligence.controller';
import { MarketIntelligenceService } from './market-intelligence.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 3,
    }),
  ],
  controllers: [MarketIntelligenceController],
  providers: [MarketIntelligenceService],
  exports: [MarketIntelligenceService],
})
export class MarketIntelligenceModule {}
