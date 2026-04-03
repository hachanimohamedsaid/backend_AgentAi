import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';

import { ProjectDecisionsService } from '../project-decisions/project-decisions.service';
import { Project, ProjectDocument } from './schemas/project.schema';

export type ProjectDto = Record<string, unknown>;

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    private readonly projectDecisionsService: ProjectDecisionsService,
  ) {}

  async findAll(): Promise<ProjectDto[]> {
    const docs = await this.projectModel
      .find()
      .sort({ updatedAt: -1 })
      .exec();
    return docs.map((d) => this.toDto(d));
  }

  /** Projets « acceptés » : dernière décision par ligne = accept, ou status accepted/accept. */
  async findAllAccepted(): Promise<ProjectDto[]> {
    const acceptedRows =
      await this.projectDecisionsService.getAcceptedRowNumbers();

    const byRow =
      acceptedRows.length > 0
        ? await this.projectModel
            .find({ row_number: { $in: acceptedRows } })
            .exec()
        : [];

    const byStatus = await this.projectModel
      .find({
        $or: [
          { status: { $regex: /^accepted$/i } },
          { status: { $regex: /^accept$/i } },
        ],
      })
      .exec();

    const merged = new Map<string, ProjectDocument>();
    for (const p of [...byRow, ...byStatus]) {
      merged.set(String(p._id), p);
    }

    return [...merged.values()]
      .sort((a, b) => {
        const tb = b.get('updatedAt') as Date | undefined;
        const ta = a.get('updatedAt') as Date | undefined;
        return (tb?.getTime() ?? 0) - (ta?.getTime() ?? 0);
      })
      .map((d) => this.toDto(d));
  }

  async findOne(id: string): Promise<ProjectDto> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Identifiant projet invalide: ${id}`);
    }
    const doc = await this.projectModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException(`Projet introuvable (id=${id}).`);
    }
    return this.toDto(doc);
  }

  private toDto(doc: ProjectDocument): ProjectDto {
    const o = doc.toJSON() as Record<string, unknown>;
    const rn = o.row_number as number | null | undefined;
    const row =
      rn === null || rn === undefined ? null : Number(rn);

    return {
      ...o,
      id: o.id,
      row_number: row,
      rowNumber: row,
      proposalRowNumber: row,
      sheetRowNumber: row,
      sourceRowNumber: row,
      row,
    };
  }
}
