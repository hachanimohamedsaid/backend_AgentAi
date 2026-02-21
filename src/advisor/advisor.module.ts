import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { AdvisorController } from './advisor.controller';
import { AdvisorService } from './advisor.service';
import { Analysis, AnalysisSchema } from './schemas/analysis.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Analysis.name, schema: AnalysisSchema },
    ]),
    HttpModule.register({ timeout: 90000, maxRedirects: 5 }),
  ],
  controllers: [AdvisorController],
  providers: [AdvisorService],
  exports: [AdvisorService],
})
export class AdvisorModule {}
