import {
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

  /**
   * Résout un projectId en document MongoDB.
   * Accepte :
   *   - ObjectId MongoDB valide (24 hex)  → findById
   *   - Chaîne numérique ("2")           → findOne({ row_number: 2 })
   *   - Manque de doc                    → NotFoundException 404 JSON clair
   *
   * Pour les routes GET (sprints, détail…) : ne crée pas le projet si absent.
   * Le dispatch service gère l'auto-création depuis la décision acceptée.
   */
  async resolveProjectDoc(id: string): Promise<ProjectDocument> {
    let doc: ProjectDocument | null = null;

    if (isValidObjectId(id) && /^[a-fA-F0-9]{24}$/.test(id)) {
      doc = await this.projectModel.findById(id).exec();
    } else {
      const rowNumber = parseInt(id, 10);
      if (!isNaN(rowNumber) && rowNumber >= 1) {
        doc = await this.projectModel.findOne({ row_number: rowNumber }).exec();
      }
    }

    if (!doc) {
      throw new NotFoundException(
        `Projet introuvable (id="${id}"). Fournissez un ObjectId MongoDB valide ou un row_number numérique existant.`,
      );
    }

    return doc;
  }

  async findAll(): Promise<ProjectDto[]> {
    const docs = await this.projectModel.find().sort({ updatedAt: -1 }).exec();
    return docs.map((d) => this.toDto(d));
  }

  /** Projets « acceptés » : dernière décision par ligne = accept, ou status accepted/accept. */
  async findAllAccepted(): Promise<ProjectDto[]> {
    const acceptedRows = await this.projectDecisionsService.getAcceptedRowNumbers();

    const byRow =
      acceptedRows.length > 0
        ? await this.projectModel.find({ row_number: { $in: acceptedRows } }).exec()
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

  /** GET /projects/:id — accepte ObjectId ou row_number. */
  async findOne(id: string): Promise<ProjectDto> {
    const doc = await this.resolveProjectDoc(id);
    return this.toDto(doc);
  }

  private toDto(doc: ProjectDocument): ProjectDto {
    const o = doc.toJSON() as Record<string, unknown>;
    const rn = o.row_number as number | null | undefined;
    const row = rn === null || rn === undefined ? null : Number(rn);

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
