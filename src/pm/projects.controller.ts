import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DispatchSprintEmailsService } from '../project-dispatch/dispatch-sprint-emails.service';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly dispatchSprintEmailsService: DispatchSprintEmailsService,
  ) {}

  /** Raccourci : projets avec décision métier acceptée (prioritaire côté Flutter). */
  @Get('accepted')
  @HttpCode(HttpStatus.OK)
  async accepted() {
    return this.projectsService.findAllAccepted();
  }

  @Get()
  async list() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Post(':projectId/dispatch-sprint-emails')
  @HttpCode(HttpStatus.OK)
  async dispatchSprintEmails(
    @Body() body: unknown,
    @Param('projectId') projectId: string,
  ) {
    return this.dispatchSprintEmailsService.run(projectId, body);
  }
}
