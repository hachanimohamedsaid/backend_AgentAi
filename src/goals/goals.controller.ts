import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { ToggleActionDto } from './dto/toggle-action.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  async findAll(@CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.goalsService.findAll(userId);
  }

  @Get('achievements')
  async findAchievements(@CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.goalsService.findAchievements(userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: UserDocument,
    @Body() dto: CreateGoalDto,
  ) {
    const userId = (user as any)._id?.toString();
    return this.goalsService.create(userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    const userId = (user as any)._id?.toString();
    return this.goalsService.update(userId, id, dto);
  }

  @Patch(':id/actions/:actionId')
  async toggleAction(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() dto: ToggleActionDto,
  ) {
    const userId = (user as any)._id?.toString();
    return this.goalsService.toggleAction(
      userId,
      id,
      actionId,
      dto.completed,
    );
  }
}
