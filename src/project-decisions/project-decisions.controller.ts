import { Body, Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ProjectDecisionsService } from './project-decisions.service';
import { CreateProjectDecisionDto } from './dto/create-project-decision.dto';

@Controller('project-decisions')
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
