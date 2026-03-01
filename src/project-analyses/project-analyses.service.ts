import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProjectAnalysis,
  ProjectAnalysisDocument,
} from './schemas/project-analysis.schema';
import { CreateProjectAnalysisDto } from './dto/create-project-analysis.dto';

@Injectable()
export class ProjectAnalysesService {
  constructor(
    @InjectModel(ProjectAnalysis.name)
    private projectAnalysisModel: Model<ProjectAnalysisDocument>,
  ) {}

  async findByRowNumber(
    rowNumber: number,
  ): Promise<ProjectAnalysisDocument | null> {
    return this.projectAnalysisModel.findOne({ row_number: rowNumber }).exec();
  }

  async createOrUpdate(
    dto: CreateProjectAnalysisDto,
  ): Promise<ProjectAnalysisDocument> {
    const existing = await this.projectAnalysisModel
      .findOne({ row_number: dto.row_number })
      .exec();

    if (existing) {
      (existing as any).analysis = dto.analysis;
      (existing as any).updatedAt = new Date();
      return existing.save();
    }

    const doc = new this.projectAnalysisModel({
      row_number: dto.row_number,
      analysis: dto.analysis,
    });
    return doc.save();
  }
}
