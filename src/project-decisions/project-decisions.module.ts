import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProjectDecision,
  ProjectDecisionSchema,
} from './schemas/project-decision.schema';
import { ProjectDecisionsService } from './project-decisions.service';
import { ProjectDecisionsController } from './project-decisions.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectDecision.name, schema: ProjectDecisionSchema },
    ]),
  ],
  controllers: [ProjectDecisionsController],
  providers: [ProjectDecisionsService],
})
export class ProjectDecisionsModule {}
