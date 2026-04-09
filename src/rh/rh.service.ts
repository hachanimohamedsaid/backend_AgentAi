import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { MailService } from '../pm/mail/mail.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const EXCLUDED_FIELDS =
  '-password -googleId -appleId -resetPasswordToken -emailVerificationToken -googleAccessToken -googleRefreshToken';

@Injectable()
export class RhService {
  private readonly logger = new Logger(RhService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly mailService: MailService,
  ) {}

  // ── helpers ──────────────────────────────────────────────────────────────

  private generateTempPassword(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    for (let i = 0; i < 8; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  private buildWelcomeHtml(name: string, email: string, password: string): string {
    return `<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0c1a2e;color:#fff;padding:32px;border-radius:16px">
  <div style="text-align:center;margin-bottom:24px">
    <div style="width:56px;height:56px;background:linear-gradient(135deg,#20b2aa,#00bcd4);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff">A</div>
    <h2 style="margin:12px 0 4px;font-size:20px">AVA Management</h2>
    <p style="color:rgba(255,255,255,0.5);font-size:13px">Vos accès ont été créés</p>
  </div>
  <p style="color:rgba(255,255,255,0.8)">Bonjour <strong>${name}</strong>,</p>
  <p style="color:rgba(255,255,255,0.6);font-size:13px">Votre compte AVA Management a été créé. Voici vos identifiants :</p>
  <div style="background:rgba(32,178,170,0.1);border:1px solid rgba(32,178,170,0.3);border-radius:10px;padding:16px;margin:20px 0">
    <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.5)">Email</p>
    <p style="margin:0 0 16px;font-weight:600;color:#fff">${email}</p>
    <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.5)">Mot de passe temporaire</p>
    <p style="margin:0;font-weight:700;font-size:18px;color:#00e5d4;letter-spacing:2px">${password}</p>
  </div>
  <p style="color:rgba(255,255,255,0.5);font-size:12px">Connectez-vous sur AVA Management et changez votre mot de passe dès que possible.</p>
</div>`;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(): Promise<UserDocument[]> {
    return this.userModel
      .find({})
      .select(EXCLUDED_FIELDS)
      .sort({ createdAt: -1 })
      .lean() as any;
  }

  async create(body: CreateEmployeeDto): Promise<{ user: any; emailSent: boolean }> {
    const tempPassword = this.generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 10);

    const created = await this.userModel.create({
      name: body.name,
      email: body.email.toLowerCase(),
      password: hashed,
      department: body.department ?? null,
      employeeType: body.employeeType ?? null,
      role: body.role ?? 'employee',
      status: body.status ?? 'active',
      joinDate: body.joinDate ? new Date(body.joinDate) : null,
    });

    // Send welcome email — failure must never block the response
    let emailSent = false;
    console.log('[RH] Attempting to send welcome email to:', body.email);
    try {
      await this.mailService.sendDispatchEmail({
        to: body.email,
        subject: 'Bienvenue sur AVA Management — Vos accès',
        html: this.buildWelcomeHtml(created.name, created.email, tempPassword),
      });
      emailSent = true;
      console.log('[RH] Welcome email sent successfully to:', body.email);
    } catch (err) {
      emailSent = false;
      console.error('[RH] Email send failed:', err);
      this.logger.error(`[RH] Email send failed for ${body.email}`, err);
    }

    // Return doc without password field
    const raw: any = created.toObject();
    delete raw.password;
    delete raw.googleId;
    delete raw.appleId;
    delete raw.resetPasswordToken;
    delete raw.emailVerificationToken;
    delete raw.googleAccessToken;
    delete raw.googleRefreshToken;

    return { user: raw, emailSent };
  }

  async update(id: string, body: UpdateEmployeeDto): Promise<UserDocument> {
    const update: Record<string, unknown> = { ...body };

    if (body.password) {
      update.password = await bcrypt.hash(body.password, 10);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .select(EXCLUDED_FIELDS)
      .lean();

    if (!updated) {
      throw new NotFoundException('Employee not found');
    }

    return updated as UserDocument;
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const res = await this.userModel.findByIdAndDelete(id).exec();
    if (!res) {
      throw new NotFoundException('Employee not found');
    }
    return { deleted: true };
  }
}
