import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import {
  ProjectDecision,
  ProjectDecisionSchema,
} from './schemas/project-decision.schema';
import { Project, ProjectSchema } from '../pm/schemas/project.schema';
import { ProjectDecisionsService } from './project-decisions.service';
import { ProjectDecisionsController } from './project-decisions.controller';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: ProjectDecision.name, schema: ProjectDecisionSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [ProjectDecisionsController],
  providers: [ProjectDecisionsService],
  exports: [ProjectDecisionsService],
})
export class ProjectDecisionsModule {}
