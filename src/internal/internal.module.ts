import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';
import { ProjectDispatchModule } from '../project-dispatch/project-dispatch.module';
import { Project, ProjectSchema } from '../pm/schemas/project.schema';
import { Sprint, SprintSchema } from '../pm/schemas/sprint.schema';
import { Task, TaskSchema } from '../pm/schemas/task.schema';
import { Employee, EmployeeSchema } from '../pm/schemas/employee.schema';

@Module({
  imports: [
    ProjectDispatchModule,
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Sprint.name, schema: SprintSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  controllers: [InternalController],
  providers: [InternalService],
})
export class InternalModule {}
