import { Injectable } from '@nestjs/common';
import type { MeetingDocument } from './schemas/meeting.schema';

const PDFDocument = require('pdfkit');

/** Format meetingAt ISO string for display. */
function formatMeetingDate(meetingAt: string): string {
  try {
    return new Date(meetingAt).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return meetingAt;
  }
}

@Injectable()
export class MeetingPdfService {
  /**
   * Generates the Executive Briefing PDF (report only: header, readiness, 6 cards, verdict, message).
   */
  async generateReportPdf(meeting: MeetingDocument): Promise<Buffer> {
    const report = meeting.reportResult as Record<string, string> | null;
    const sectionStatuses =
      (meeting.sectionStatuses as Record<string, string>) ?? {};
    const readinessScore = meeting.readinessScore ?? 0;

    if (!report) {
      throw new Error(
        'Report not generated. Call GET /meeting/:id/report first.',
      );
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const title = 'Executive Briefing';
      const investor =
        meeting.investorName +
        (meeting.investorCompany ? ` · ${meeting.investorCompany}` : '');
      const location = `${meeting.city}, ${meeting.country}`;
      const deal = [
        meeting.dealType,
        meeting.valuation != null ? `€${meeting.valuation}` : null,
        meeting.equity != null ? `${meeting.equity}%` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const dateStr = formatMeetingDate(meeting.meetingAt);

      doc.fontSize(22).text(title, { align: 'center' }).moveDown(0.5);
      doc
        .fontSize(11)
        .text(`${investor}`, { align: 'center' })
        .text(`${location}`, { align: 'center' })
        .text(`${deal}`, { align: 'center' })
        .text(dateStr, { align: 'center' })
        .moveDown(1);

      doc
        .fontSize(14)
        .text('Readiness Score', { continued: false })
        .moveDown(0.3);
      doc
        .fontSize(28)
        .text(`${readinessScore}%`, { align: 'center' })
        .moveDown(1.5);

      const sections = [
        {
          title: 'Cultural Intelligence',
          key: 'cultural_summary',
          statusKey: 'cultural',
        },
        {
          title: 'Investor Profile',
          key: 'profile_summary',
          statusKey: 'psych',
        },
        {
          title: 'Negotiation',
          key: 'negotiation_summary',
          statusKey: 'negotiation',
        },
        { title: 'Offer Strategy', key: 'offer_summary', statusKey: 'offer' },
        { title: 'Executive Image', key: 'image_summary', statusKey: 'image' },
        { title: 'Location', key: 'location_summary', statusKey: 'location' },
      ];

      for (const s of sections) {
        doc.fontSize(12).fillColor('#333').text(s.title, { continued: false });
        const status = sectionStatuses[s.statusKey] ?? 'ready';
        doc
          .fontSize(9)
          .fillColor('#666')
          .text(` [${status}]`, { continued: true });
        doc.moveDown(0.2);
        doc
          .fontSize(10)
          .fillColor('#000')
          .text(report[s.key] ?? '—', { align: 'left', lineGap: 2 });
        doc.moveDown(0.8);
      }

      if (report.overall_verdict) {
        doc
          .moveDown(0.5)
          .fontSize(11)
          .fillColor('#333')
          .text('Overall Verdict', { continued: false })
          .moveDown(0.2);
        doc
          .fontSize(10)
          .fillColor('#000')
          .text(report.overall_verdict, { lineGap: 2 })
          .moveDown(0.8);
      }

      if (report.motivational_message) {
        doc
          .fontSize(11)
          .fillColor('#333')
          .text('— AVA', { continued: false })
          .moveDown(0.2);
        doc
          .fontSize(10)
          .fillColor('#000')
          .text(report.motivational_message, { lineGap: 2 });
      }

      doc.end();
    });
  }
}
