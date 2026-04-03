import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Task, TaskDocument } from './schemas/task.schema';

@Controller('sprints')
@UseGuards(JwtAuthGuard)
export class SprintTasksController {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  @Get(':sprintId/tasks')
  async list(@Param('sprintId') sprintId: string) {
    if (!isValidObjectId(sprintId)) {
      throw new BadRequestException(`Identifiant sprint invalide: ${sprintId}`);
    }
    return this.taskModel.find({ sprintId }).sort({ createdAt: 1 }).exec();
  }
}
