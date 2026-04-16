import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RhService } from './rh.service';
import { RhRoleGuard } from './rh-role.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateCongeDto } from './dto/create-conge.dto';
import { UpdateCongeDto } from './dto/update-conge.dto';
import { CreateReclamationDto } from './dto/create-reclamation.dto';
import { UpdateReclamationDto } from './dto/update-reclamation.dto';
import { CreateMaladieDto } from './dto/create-maladie.dto';
import { UpdateMaladieDto } from './dto/update-maladie.dto';

@Controller('rh')
@UseGuards(JwtAuthGuard, RhRoleGuard)
export class RhController {
  constructor(private readonly rhService: RhService) {}

  @Get('employees')
  getEmployees() {
    return this.rhService.findAll();
  }

  @Post('employees')
  @HttpCode(HttpStatus.CREATED)
  addEmployee(@Body() body: CreateEmployeeDto) {
    return this.rhService.create(body);
  }

  @Put('employees/:id')
  updateEmployee(@Param('id') id: string, @Body() body: UpdateEmployeeDto) {
    return this.rhService.update(id, body);
  }

  @Delete('employees/:id')
  deleteEmployee(@Param('id') id: string) {
    return this.rhService.remove(id);
  }

  // ── Congés ───────────────────────────────────────────────────────────────

  @Get('conges')
  getConges() {
    return this.rhService.listConges();
  }

  @Post('conges')
  createConge(@Body() body: CreateCongeDto) {
    return this.rhService.createConge(body);
  }

  @Put('conges/:id')
  updateConge(@Param('id') id: string, @Body() body: UpdateCongeDto) {
    return this.rhService.updateConge(id, body);
  }

  // ── Réclamations ─────────────────────────────────────────────────────────

  @Get('reclamations')
  getReclamations() {
    return this.rhService.listReclamations();
  }

  @Post('reclamations')
  createReclamation(@Body() body: CreateReclamationDto) {
    return this.rhService.createReclamation(body);
  }

  @Put('reclamations/:id')
  updateReclamation(@Param('id') id: string, @Body() body: UpdateReclamationDto) {
    return this.rhService.updateReclamation(id, body);
  }

  // ── Maladies ─────────────────────────────────────────────────────────────

  @Get('maladies')
  getMaladies() {
    return this.rhService.listMaladies();
  }

  @Post('maladies')
  createMaladie(@Body() body: CreateMaladieDto) {
    return this.rhService.createMaladie(body);
  }

  @Put('maladies/:id')
  updateMaladie(@Param('id') id: string, @Body() body: UpdateMaladieDto) {
    return this.rhService.updateMaladie(id, body);
  }
}
