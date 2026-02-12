import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProjectAnalysesService } from './project-analyses.service';
import { CreateProjectAnalysisDto } from './dto/create-project-analysis.dto';

@Controller('project-analyses')
export class ProjectAnalysesController {
  constructor(
    private readonly projectAnalysesService: ProjectAnalysesService,
  ) {}

  @Get(':rowNumber')
  async findByRowNumber(
    @Param('rowNumber', ParseIntPipe) rowNumber: number,
  ) {
    const analysis = await this.projectAnalysesService.findByRowNumber(
      rowNumber,
    );
    return { analysis: analysis?.analysis || null };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createOrUpdate(@Body() dto: CreateProjectAnalysisDto) {
    await this.projectAnalysesService.createOrUpdate(dto);
    return { ok: true };
  }
}
