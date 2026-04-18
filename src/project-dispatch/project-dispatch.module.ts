import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectDecisionsModule } from '../project-decisions/project-decisions.module';
import { MailModule } from '../pm/mail/mail.module';
import { PdfModule } from '../pm/pdf/pdf.module';
import { Employee, EmployeeSchema } from '../pm/schemas/employee.schema';
import { Project, ProjectSchema } from '../pm/schemas/project.schema';
import { Sprint, SprintSchema } from '../pm/schemas/sprint.schema';
import { Task, TaskSchema } from '../pm/schemas/task.schema';
import { EmployeesController } from '../pm/employees.controller';
import { ProjectSprintsController } from '../pm/project-sprints.controller';
import { ProjectsController } from '../pm/projects.controller';
import { ProjectsService } from '../pm/projects.service';
import { SprintTasksController } from '../pm/sprint-tasks.controller';
import { ProposalPlanGeneratorService } from '../pm/proposal-plan-generator.service';
import { DispatchSprintEmailsService } from './dispatch-sprint-emails.service';

@Module({
  imports: [
    AuthModule,
    ProjectDecisionsModule,
    AiModule,
    PdfModule,
    MailModule,
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Sprint.name, schema: SprintSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [
    ProjectsController,
    EmployeesController,
    ProjectSprintsController,
    SprintTasksController,
  ],
  providers: [
    DispatchSprintEmailsService,
    ProjectsService,
    ProposalPlanGeneratorService,
  ],
  exports: [DispatchSprintEmailsService],
})
export class ProjectDispatchModule {}
