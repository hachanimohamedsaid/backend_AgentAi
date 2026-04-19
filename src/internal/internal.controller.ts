import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InternalService } from './internal.service';

@Controller('internal')
export class InternalController {
  constructor(private readonly internalService: InternalService) {}

  @Get('projects/accepted')
  getAcceptedProjects() {
    return this.internalService.getAcceptedProjects();
  }

  @Get('projects/all')
  async getAllProjects() {
    return this.internalService.getAllProjects();
  }

  @Get('projects/:rowNumber/tasks')
  getProjectTasks(@Param('rowNumber') rowNumber: string) {
    return this.internalService.getProjectTasks(parseInt(rowNumber));
  }

  @Get('tasks/by-employee/:employeeId')
  getTasksByEmployee(@Param('employeeId') employeeId: string) {
    return this.internalService.getTasksByEmployee(employeeId);
  }

  @Get('tasks/:id')
  getTask(@Param('id') id: string) {
    return this.internalService.getTask(id);
  }

  @Get('tasks/:id/debug')
  async debugTask(@Param('id') id: string) {
    const task = await this.internalService.debugTask(id);
    return task;
  }

  @Get('employees/:id')
  getEmployee(@Param('id') id: string) {
    return this.internalService.getEmployee(id);
  }

  @Patch('tasks/:id/trello-card')
  saveTrelloCard(@Param('id') id: string, @Body() body: any) {
    return this.internalService.saveTrelloCard(id, body);
  }

  @Patch('tasks/:id/assign')
  assignTask(@Param('id') id: string, @Body() body: any) {
    return this.internalService.assignTask(id, body.employeeId);
  }

  @Patch('tasks/:id/reject')
  rejectTask(@Param('id') id: string, @Body() body: any) {
    return this.internalService.rejectTask(id, body.employeeId);
  }

  @Patch('tasks/:id/complete')
  completeTask(@Param('id') id: string) {
    return this.internalService.completeTask(id);
  }

  @Patch('projects/:id/mark-dispatched')
  markDispatched(@Param('id') id: string) {
    return this.internalService.markDispatched(id);
  }

  @Patch('projects/:id/reset-dispatch')
  async resetDispatch(@Param('id') id: string) {
    return this.internalService.resetDispatch(id);
  }

  @Post('projects/:rowNumber/dispatch')
  async dispatchProject(
    @Param('rowNumber') rowNumber: string,
    @Body() body: any,
  ) {
    return this.internalService.runDispatch(rowNumber, body);
  }
}
