import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Sprint, SprintDocument } from './schemas/sprint.schema';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectSprintsController {
  constructor(
    @InjectModel(Sprint.name) private readonly sprintModel: Model<SprintDocument>,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * GET /projects/:projectId/sprints
   * Accepte un ObjectId MongoDB (24 hex) OU un row_number numérique ("2", "10"…).
   */
  @Get(':projectId/sprints')
  async list(@Param('projectId') projectId: string) {
    // Résout l'identifiant → ObjectId réel du projet (404 JSON si introuvable)
    const project = await this.projectsService.resolveProjectDoc(projectId);
    const realId = String(project._id);

    return this.sprintModel
      .find({ projectId: realId })
      .sort({ startDate: 1 })
      .exec();
  }
}
