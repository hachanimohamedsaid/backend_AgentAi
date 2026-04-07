import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * Service d'envoi d'e-mails via Resend (HTTPS — fonctionne sur Railway).
 * Variables requises : RESEND_API_KEY, MAIL_FROM.
 * PDF joint en base64 via l'API Resend attachments.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  private getEnv(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new InternalServerErrorException(
        `Variable d'environnement manquante: ${name}. Ajoutez-la dans Railway.`,
      );
    }
    return value;
  }

  async sendDispatchEmail(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    pdfBuffer?: Buffer;
    filename?: string;
  }): Promise<void> {
    const apiKey = this.getEnv('RESEND_API_KEY');
    const from = this.getEnv('MAIL_FROM');

    const resend = new Resend(apiKey);

    const attachments: Array<{ filename: string; content: string }> =
      params.pdfBuffer && params.filename
        ? [
            {
              filename: params.filename,
              // Resend attend le contenu en base64
              content: params.pdfBuffer.toString('base64'),
            },
          ]
        : [];

    if (attachments.length) {
      this.logger.log(
        `[Mail] PDF joint : ${params.filename} (${params.pdfBuffer!.length} octets)`,
      );
    }

    try {
      const result = await resend.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text ?? this.stripHtml(params.html),
        html: params.html,
        attachments,
      });

      if (result.error) {
        throw new Error(result.error.message ?? JSON.stringify(result.error));
      }

      this.logger.log(`[Mail] Envoyé → ${params.to} | messageId: ${result.data?.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Mail] Échec envoi vers ${params.to}: ${msg}`);
      throw new InternalServerErrorException(`Envoi email impossible vers ${params.to}: ${msg}`);
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
