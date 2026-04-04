import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { Employee, EmployeeDocument } from './schemas/employee.schema';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  @Get()
  async list() {
    return this.employeeModel.find().sort({ fullName: 1 }).exec();
  }

  @Post()
  async create(@Body() dto: CreateEmployeeDto) {
    const email = dto.email.trim().toLowerCase();
    try {
      const doc = await this.employeeModel.create({
        fullName: dto.fullName.trim(),
        email,
        profile: dto.profile.trim(),
        skills: this.normalizeStringArray(dto.skills),
        tags: this.normalizeStringArray(dto.tags),
      });
      return doc.toJSON();
    } catch (e: unknown) {
      if (this.isDuplicateKeyError(e)) {
        throw new ConflictException('Cet e-mail est déjà attribué à un collaborateur.');
      }
      throw e;
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    this.assertObjectId(id);
    const existing = await this.employeeModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Collaborateur introuvable.');
    }
    const update: Record<string, unknown> = {};
    if (dto.fullName != null) update.fullName = dto.fullName.trim();
    if (dto.email != null) update.email = dto.email.trim().toLowerCase();
    if (dto.profile != null) update.profile = dto.profile.trim();
    if (dto.skills != null) update.skills = this.normalizeStringArray(dto.skills);
    if (dto.tags != null) update.tags = this.normalizeStringArray(dto.tags);
    if (Object.keys(update).length === 0) {
      return existing.toJSON();
    }
    try {
      const doc = await this.employeeModel
        .findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
        .exec();
      if (!doc) throw new NotFoundException('Collaborateur introuvable.');
      return doc.toJSON();
    } catch (e: unknown) {
      if (this.isDuplicateKeyError(e)) {
        throw new ConflictException('Cet e-mail est déjà utilisé.');
      }
      throw e;
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    this.assertObjectId(id);
    const res = await this.employeeModel.findByIdAndDelete(id).exec();
    if (!res) {
      throw new NotFoundException('Collaborateur introuvable.');
    }
    return { ok: true };
  }

  private assertObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Identifiant invalide.');
    }
  }

  private normalizeStringArray(arr?: string[]): string[] {
    if (!arr?.length) return [];
    return [...new Set(arr.map((s) => s.trim()).filter((s) => s.length > 0))];
  }

  private isDuplicateKeyError(e: unknown): boolean {
    return typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
  }
}
