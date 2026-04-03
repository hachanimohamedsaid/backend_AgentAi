import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

export interface EmployeePdf {
  fullName: string;
  email: string;
  profile: string;
}

export interface ProjectPdf {
  title: string;
  description: string;
  techStack: string[];
}

export interface SprintPdf {
  title: string;
  goal: string;
  startDate: Date;
  endDate: Date;
}

export interface TaskPdf {
  title: string;
  description: string;
  priority: string;
  status: string;
  deliverable: string;
}

export interface SprintBlockPdf {
  sprint: SprintPdf;
  tasks: TaskPdf[];
}

/** PDF regroupant tous les sprints / tâches d’un employé sur un projet. */
@Injectable()
export class PdfService {
  async generateEmployeeDispatchPdf(params: {
    employee: EmployeePdf;
    project: ProjectPdf;
    sprintBlocks: SprintBlockPdf[];
  }): Promise<Buffer> {
    const { employee, project, sprintBlocks } = params;

    const stream = new PassThrough();
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });
    doc.pipe(stream);

    const formatDate = (d: Date) => {
      const date = d instanceof Date ? d : new Date(d);
      return date.toISOString().slice(0, 10);
    };

    const pageWidth = doc.page.width;

    doc.font('Helvetica-Bold').fontSize(18).text('AI Project Manager Assistant', { align: 'left' });
    doc.moveDown(0.5).fontSize(12).font('Helvetica').text('Synthèse des missions par sprint', { align: 'left' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(pageWidth - 50, doc.y).stroke();

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(12).text('Projet');
    doc.font('Helvetica').fontSize(11).text(`Titre: ${project.title}`);
    doc.font('Helvetica').fontSize(11).text(`Description: ${project.description}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(12).text('Stack technique');
    const stack = project.techStack?.length ? project.techStack.join(', ') : '-';
    doc.font('Helvetica').fontSize(11).text(stack);

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(12).text('Employé');
    doc.font('Helvetica').fontSize(11).text(`Nom: ${employee.fullName}`);
    doc.font('Helvetica').fontSize(11).text(`Email: ${employee.email}`);
    doc.font('Helvetica').fontSize(11).text(`Profil: ${employee.profile}`);

    for (const block of sprintBlocks) {
      const { sprint, tasks } = block;
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).text(sprint.title);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(11).text(`Objectif: ${sprint.goal}`);
      doc.font('Helvetica').fontSize(11).text(
        `Période: ${formatDate(sprint.startDate)} → ${formatDate(sprint.endDate)}`,
      );
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12).text('Tâches');
      doc.moveDown(0.25);

      if (!tasks.length) {
        doc.font('Helvetica').fontSize(11).text('Aucune tâche dans ce sprint pour cet employé.');
        continue;
      }

      tasks.forEach((t, idx) => {
        doc.font('Helvetica-Bold').fontSize(11).text(`${idx + 1}. ${t.title}`);
        doc.font('Helvetica').fontSize(10).text(`Priorité: ${t.priority} | Statut: ${t.status}`);
        doc.font('Helvetica').fontSize(10).text(`Livrable: ${t.deliverable}`);
        doc.font('Helvetica').fontSize(10).text(`Description: ${t.description}`);
        doc.moveDown(0.5);
      });
    }

    doc.moveDown(1);
    doc.fontSize(9).font('Helvetica').text('Généré automatiquement par le backend.', { align: 'left' });

    doc.end();
    return await this.streamToBuffer(stream);
  }

  private async streamToBuffer(stream: PassThrough): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return await new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
