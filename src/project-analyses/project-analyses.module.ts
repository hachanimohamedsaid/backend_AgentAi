import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProjectAnalysis,
  ProjectAnalysisSchema,
} from './schemas/project-analysis.schema';
import { ProjectAnalysesService } from './project-analyses.service';
import { ProjectAnalysesController } from './project-analyses.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectAnalysis.name, schema: ProjectAnalysisSchema },
    ]),
  ],
  controllers: [ProjectAnalysesController],
  providers: [ProjectAnalysesService],
})
export class ProjectAnalysesModule {}
