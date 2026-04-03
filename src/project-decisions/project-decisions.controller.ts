import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectDecisionsService } from './project-decisions.service';
import { CreateProjectDecisionDto } from './dto/create-project-decision.dto';

@Controller('project-decisions')
@UseGuards(JwtAuthGuard)
export class ProjectDecisionsController {
  constructor(
    private readonly projectDecisionsService: ProjectDecisionsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async create(@Body() dto: CreateProjectDecisionDto) {
    await this.projectDecisionsService.create(dto);
    return { ok: true };
  }

  @Get()
  async findAll() {
    return this.projectDecisionsService.findAll();
  }
}
