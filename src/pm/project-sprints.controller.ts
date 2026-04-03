import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Sprint, SprintDocument } from './schemas/sprint.schema';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectSprintsController {
  constructor(
    @InjectModel(Sprint.name) private readonly sprintModel: Model<SprintDocument>,
  ) {}

  @Get(':projectId/sprints')
  async list(@Param('projectId') projectId: string) {
    if (!isValidObjectId(projectId)) {
      throw new BadRequestException(`Identifiant projet invalide: ${projectId}`);
    }
    return this.sprintModel
      .find({ projectId })
      .sort({ startDate: 1 })
      .exec();
  }
}
