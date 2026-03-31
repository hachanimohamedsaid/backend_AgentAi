import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller(['users', 'api/users'])
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  async findAll() {
    return this.usersService.findAll();
  }

  // ✨ NEW: Get leaderboard (top 100 users by challenge points)
  @Get('leaderboard')
  async getLeaderboard() {
    return await this.usersService.findLeaderboard();
  }

  // ✨ NEW: Complete a challenge (add points)
  @Post('complete-challenge')
  @UseGuards(JwtAuthGuard)
  async completeChallenge(
    @Request() req,
    @Body() body: { challengeId: string; points: number },
  ) {
    const updated = await this.usersService.completeChallenge(
      req.user.id,
      body.challengeId,
      body.points,
    );

    if (!updated) {
      return { error: 'User not found', success: false };
    }

    return {
      challengePoints: updated.challengePoints,
      completedChallenges: updated.completedChallenges,
      success: true,
    };
  }

  // ✨ NEW: Get current user's profile including challenge data
  @Get('current-profile')
  @UseGuards(JwtAuthGuard)
  async getCurrentProfile(@Request() req) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) {
      return { error: 'User not found' };
    }
    return {
      id: user._id?.toString?.() ?? user._id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      challengePoints: user.challengePoints || 0,
      completedChallenges: user.completedChallenges || [],
      isPremium: user.isPremium || false,
    };
  }
}
