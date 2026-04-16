import { Injectable, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/schemas/user.schema';
import { MailService } from '../pm/mail/mail.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Conge, CongeDocument } from './schemas/conge.schema';
import { Reclamation, ReclamationDocument } from './schemas/reclamation.schema';
import { Maladie, MaladieDocument } from './schemas/maladie.schema';
import { CreateCongeDto } from './dto/create-conge.dto';
import { UpdateCongeDto } from './dto/update-conge.dto';
import { CreateReclamationDto } from './dto/create-reclamation.dto';
import { UpdateReclamationDto } from './dto/update-reclamation.dto';
import { CreateMaladieDto } from './dto/create-maladie.dto';
import { UpdateMaladieDto } from './dto/update-maladie.dto';

const EXCLUDED_FIELDS =
  '-password -googleId -appleId -resetPasswordToken -emailVerificationToken -googleAccessToken -googleRefreshToken';

export type EmployeeListItem = {
  _id: string;
  id: string;
  name: string;
  email: string;
  department: string;
  employeeType: string;
  role: string;
  status: string;
  joinDate: Date | null;
};

@Injectable()
export class RhService {
  private readonly logger = new Logger(RhService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly mailService: MailService,
    @InjectModel(Conge.name) private readonly congeModel: Model<CongeDocument>,
    @InjectModel(Reclamation.name)
    private readonly reclamationModel: Model<ReclamationDocument>,
    @InjectModel(Maladie.name) private readonly maladieModel: Model<MaladieDocument>,
  ) {}

  // ── helpers ──────────────────────────────────────────────────────────────

  private generateTempPassword(): string {
    const length = 10 + crypto.randomInt(0, 3);
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += chars[bytes[i]! % chars.length];
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

  private toEmployeeListItem(e: Record<string, unknown>): EmployeeListItem {
    const id = String(e._id ?? e.id ?? '');
    return {
      _id: id,
      id,
      name: String(e.name ?? ''),
      email: String(e.email ?? ''),
      department: String(e.department ?? ''),
      employeeType: String(e.employeeType ?? ''),
      role: String(e.role ?? 'employee'),
      status: String(e.status ?? 'active'),
      joinDate: e.joinDate ? (e.joinDate as Date) : null,
    };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(): Promise<EmployeeListItem[]> {
    const employees = await this.userModel
      .find({})
      .select(EXCLUDED_FIELDS)
      .lean()
      .exec();

    return employees.map((e) => this.toEmployeeListItem(e as unknown as Record<string, unknown>));
  }

  async create(body: CreateEmployeeDto): Promise<Record<string, unknown>> {
    const existing = await this.userModel.findOne({ email: body.email }).exec();
    if (existing) {
      throw new ConflictException('Un employé avec cet email existe déjà');
    }

    const tempPassword = this.generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 10);

    const created = (await (this.userModel as any).create({
      name: body.name,
      email: body.email.toLowerCase(),
      password: hashed,
      mustChangePassword: true,
      department: body.department ?? null,
      employeeType: body.employeeType ?? null,
      role: body.role ?? 'employee',
      status: body.status ?? 'active',
      joinDate: body.joinDate ? new Date(body.joinDate) : null,
    })) as UserDocument;

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

    const id = String(created._id);
    const raw = created.toObject() as unknown as Record<string, unknown>;
    delete raw.password;
    delete raw.googleId;
    delete raw.appleId;
    delete raw.resetPasswordToken;
    delete raw.emailVerificationToken;
    delete raw.googleAccessToken;
    delete raw.googleRefreshToken;

    return {
      ...raw,
      _id: id,
      id,
      temporaryPassword: tempPassword,
      emailSent,
      mustChangePassword: true,
    };
  }

  async update(id: string, body: UpdateEmployeeDto): Promise<EmployeeListItem> {
    const { password: rawPassword, ...rest } = body;
    const update: Record<string, unknown> = { ...rest };

    if (rawPassword) {
      update.password = await bcrypt.hash(rawPassword, 10);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .select(EXCLUDED_FIELDS)
      .lean();

    if (!updated) {
      throw new NotFoundException('Employee not found');
    }

    return this.toEmployeeListItem(updated as unknown as Record<string, unknown>);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const res = await this.userModel.findByIdAndDelete(id).exec();
    if (!res) {
      throw new NotFoundException('Employee not found');
    }
    return { ok: true };
  }

  // ── Congés ───────────────────────────────────────────────────────────────

  async listConges() {
    return this.congeModel.find({}).sort({ createdAt: -1 }).lean().exec();
  }

  async createConge(body: CreateCongeDto) {
    return this.congeModel.create({
      employeeId: body.employeeId,
      employeeName: body.employeeName,
      type: body.type,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      days: body.days,
      reason: body.reason,
      status: body.status ?? 'pending',
    });
  }

  async updateConge(id: string, body: UpdateCongeDto) {
    const updated = await this.congeModel
      .findByIdAndUpdate(id, { $set: body }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Conge not found');

    if (body.status === 'approved' || body.status === 'rejected') {
      const employeeId = (updated as any).employeeId?.toString?.() ?? (updated as any).employeeId;
      if (employeeId) {
        const user = await this.userModel.findById(employeeId).exec();
        if (user) {
          (user as any).status = body.status === 'approved' ? 'leave' : 'active';
          await user.save();
        }
      }
    }

    return updated;
  }

  // ── Réclamations ─────────────────────────────────────────────────────────

  async listReclamations() {
    return this.reclamationModel.find({}).sort({ createdAt: -1 }).lean().exec();
  }

  async createReclamation(body: CreateReclamationDto) {
    return this.reclamationModel.create({
      employeeId: body.employeeId,
      employeeName: body.employeeName,
      subject: body.subject,
      category: body.category,
      priority: body.priority ?? 'medium',
      description: body.description,
      status: body.status ?? 'open',
    });
  }

  async updateReclamation(id: string, body: UpdateReclamationDto) {
    const updated = await this.reclamationModel
      .findByIdAndUpdate(id, { $set: body }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Reclamation not found');
    return updated;
  }

  // ── Maladies ─────────────────────────────────────────────────────────────

  async listMaladies() {
    return this.maladieModel.find({}).sort({ createdAt: -1 }).lean().exec();
  }

  async createMaladie(body: CreateMaladieDto) {
    return this.maladieModel.create({
      employeeId: body.employeeId,
      employeeName: body.employeeName,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      days: body.days,
      doctor: body.doctor,
      description: body.description,
      certificate: body.certificate ?? false,
      status: body.status ?? 'active',
    });
  }

  async updateMaladie(id: string, body: UpdateMaladieDto) {
    const updated = await this.maladieModel
      .findByIdAndUpdate(id, { $set: body }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Maladie not found');

    if (body.status) {
      const employeeId = (updated as any).employeeId?.toString?.() ?? (updated as any).employeeId;
      if (employeeId) {
        const user = await this.userModel.findById(employeeId).exec();
        if (user) {
          (user as any).status = body.status === 'resolved' ? 'active' : 'sick';
          await user.save();
        }
      }
    }

    return updated;
  }
}
