import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProjectDecision,
  ProjectDecisionDocument,
} from './schemas/project-decision.schema';
import { CreateProjectDecisionDto } from './dto/create-project-decision.dto';

@Injectable()
export class ProjectDecisionsService {
  constructor(
    @InjectModel(ProjectDecision.name)
    private projectDecisionModel: Model<ProjectDecisionDocument>,
  ) {}

  async create(
    dto: CreateProjectDecisionDto,
  ): Promise<ProjectDecisionDocument> {
    const doc = new this.projectDecisionModel({
      action: dto.action,
      row_number: dto.row_number,
      name: dto.name,
      email: dto.email,
      type_projet: dto.type_projet,
      budget_estime: dto.budget_estime,
      periode: dto.periode,
    });
    return doc.save();
  }
}
