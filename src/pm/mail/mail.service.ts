import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  private getRequiredEnv(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new InternalServerErrorException(`Environnement manquant: ${name}`);
    }
    return value;
  }

  private createTransporter() {
    const host = this.getRequiredEnv('SMTP_HOST');
    const port = this.getRequiredEnv('SMTP_PORT');
    const user = this.getRequiredEnv('SMTP_USER');
    const pass = this.getRequiredEnv('SMTP_PASS');

    return nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass },
    });
  }

  async sendDispatchEmail(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    pdfBuffer?: Buffer;
    filename?: string;
  }): Promise<void> {
    const transporter = this.createTransporter();
    const from = this.getRequiredEnv('MAIL_FROM');

    const attachments =
      params.pdfBuffer && params.filename
        ? [
            {
              filename: params.filename,
              content: params.pdfBuffer,
              contentType: 'application/pdf' as const,
            },
          ]
        : [];

    try {
      await transporter.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text ?? this.stripHtml(params.html),
        html: params.html,
        attachments,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown mail error';
      throw new InternalServerErrorException(`Envoi email impossible: ${msg}`);
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
