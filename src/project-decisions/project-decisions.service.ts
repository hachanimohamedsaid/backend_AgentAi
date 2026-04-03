import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProjectDecision,
  ProjectDecisionDocument,
} from './schemas/project-decision.schema';
import { Project, ProjectDocument } from '../pm/schemas/project.schema';
import { CreateProjectDecisionDto } from './dto/create-project-decision.dto';

@Injectable()
export class ProjectDecisionsService {
  constructor(
    @InjectModel(ProjectDecision.name)
    private projectDecisionModel: Model<ProjectDecisionDocument>,
    @InjectModel(Project.name)
    private projectModel: Model<ProjectDocument>,
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
    const saved = await doc.save();

    if (dto.action === 'accept') {
      const techFromType = (dto.type_projet ?? '')
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await this.projectModel
        .findOneAndUpdate(
          { row_number: dto.row_number },
          {
            $set: {
              title: dto.name,
              description: dto.type_projet ?? '',
              status: 'accepted',
              row_number: dto.row_number,
              techStack: techFromType.length ? techFromType : [],
              type_projet: dto.type_projet ?? null,
              budget_estime: dto.budget_estime ?? null,
              periode: dto.periode ?? null,
              tags: techFromType,
            },
          },
          { upsert: true, new: true },
        )
        .exec();
    }

    return saved;
  }

  /** Dernière décision pour une ligne (pour génération sprints / cohérence). */
  async findLatestDecisionForRow(
    rowNumber: number,
  ): Promise<ProjectDecisionDocument | null> {
    return this.projectDecisionModel
      .findOne({ row_number: rowNumber })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Dernière décision par ligne : `row_number` dont l’action courante est `accept`. */
  async getAcceptedRowNumbers(): Promise<number[]> {
    const agg = await this.projectDecisionModel
      .aggregate<{ _id: number }>([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$row_number',
            lastAction: { $first: '$action' },
          },
        },
        { $match: { lastAction: 'accept' } },
      ])
      .exec();
    return agg.map((d) => d._id);
  }

  /** Pour que Flutter récupère les décisions au chargement (ordre anti-chronologique). */
  async findAll(): Promise<ProjectDecisionDocument[]> {
    return this.projectDecisionModel.find().sort({ createdAt: -1 }).exec();
  }
}
