import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  private getEnv(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new InternalServerErrorException(
        `Variable d'environnement manquante: ${name}. Vérifiez la config Railway/local.`,
      );
    }
    return value;
  }

  private createTransporter() {
    const host = this.getEnv('SMTP_HOST');
    const port = Number(this.getEnv('SMTP_PORT'));
    const user = this.getEnv('SMTP_USER');
    const pass = this.getEnv('SMTP_PASS');

    const is465 = port === 465;

    return nodemailer.createTransport({
      host,
      port,
      secure: is465,           // true = SSL direct (465), false = STARTTLS (587)
      requireTLS: !is465,      // force STARTTLS sur 587 — clé manquante avant
      auth: { user, pass },
      tls: {
        // Nécessaire dans certains environnements conteneurisés (Railway, Docker)
        rejectUnauthorized: false,
      },
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
    const from = this.getEnv('MAIL_FROM');

    // ─── Vérification de la connexion SMTP avant l'envoi ─────────────────────
    try {
      await transporter.verify();
      this.logger.log(`[Mail] Connexion SMTP vérifiée → ${this.configService.get('SMTP_HOST')}:${this.configService.get('SMTP_PORT')}`);
    } catch (verifyErr: unknown) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      this.logger.error(`[Mail] Échec de la vérification SMTP: ${msg}`);
      throw new InternalServerErrorException(
        `Connexion SMTP impossible (${this.configService.get('SMTP_HOST')}:${this.configService.get('SMTP_PORT')}): ${msg}`,
      );
    }

    // ─── Construction des pièces jointes ─────────────────────────────────────
    const attachments: Array<{ filename: string; content: Buffer; contentType: string; encoding: string }> =
      params.pdfBuffer && params.filename
        ? [
            {
              filename: params.filename,
              content: params.pdfBuffer,
              contentType: 'application/pdf',
              encoding: 'base64',
            },
          ]
        : [];

    if (params.pdfBuffer && params.filename) {
      this.logger.log(
        `[Mail] PDF joint : ${params.filename} (${params.pdfBuffer.length} octets)`,
      );
    }

    // ─── Envoi ───────────────────────────────────────────────────────────────
    try {
      const info = await transporter.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text ?? this.stripHtml(params.html),
        html: params.html,
        attachments,
      });
      this.logger.log(`[Mail] Envoyé → ${params.to} | messageId: ${info.messageId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown mail error';
      this.logger.error(`[Mail] Échec envoi vers ${params.to}: ${msg}`);
      throw new InternalServerErrorException(`Envoi email impossible vers ${params.to}: ${msg}`);
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
