import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Headers,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString, IsNotEmpty } from 'class-validator';
import { CreateUserDto } from './dto/create-user.dto';
import { CompleteChallengeDto } from './dto/complete-challenge.dto';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class SaveSheetIdDto {
  @IsString()
  @IsNotEmpty()
  sheetId: string;
}

@Controller(['users', 'api/users'])
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

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
    @Body() body: CompleteChallengeDto,
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
      badges: user.badges || [],
      championMonths: user.championMonths || [],
    };
  }

  // ── N8N server-to-server endpoints (API key protected, no JWT) ────────────

  /**
   * GET /users/google-connected
   * N8N calls this to list users who granted Google scope.
   * Protected by x-api-key header matching N8N_API_KEY env var.
   */
  @Get('google-connected')
  async findAllGoogleConnected(
    @Headers('x-api-key') apiKey: string,
  ) {
    this.checkApiKey(apiKey);
    return this.usersService.findAllGoogleConnected();
  }

  /**
   * GET /users/:id/google-tokens
   * N8N calls this to get a valid Google access token for a user.
   * Protected by x-api-key header matching N8N_API_KEY env var.
   */
  @Get(':id/google-tokens')
  async getGoogleTokens(
    @Param('id') id: string,
    @Headers('x-api-key') apiKey: string,
  ) {
    this.checkApiKey(apiKey);
    try {
      const result = await this.usersService.getValidGoogleAccessToken(id);
      return result;
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        throw new NotFoundException({ error: 'Google account not connected' });
      }
      throw err;
    }
  }

  /**
   * POST /users/:id/google-sheet-id
   * N8N calls this after creating the Google Sheet to store its ID.
   * Protected by x-api-key header matching N8N_API_KEY env var.
   */
  @Post(':id/google-sheet-id')
  @HttpCode(HttpStatus.OK)
  async saveGoogleSheetId(
    @Param('id') id: string,
    @Headers('x-api-key') apiKey: string,
    @Body() body: SaveSheetIdDto,
  ) {
    this.checkApiKey(apiKey);
    await this.usersService.saveGoogleSheetId(id, body.sheetId);
    return { success: true };
  }

  private checkApiKey(apiKey: string): void {
    const expected = this.configService.get<string>('N8N_API_KEY');
    if (!expected || apiKey !== expected) {
      throw new UnauthorizedException('Invalid or missing x-api-key');
    }
  }
}
