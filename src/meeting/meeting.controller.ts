import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MeetingService } from './meeting.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { NegotiationMessageDto } from './dto/negotiation-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';

@Controller('meeting')
@UseGuards(JwtAuthGuard)
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  /**
   * Creates a new meeting from the setup form (Page 2).
   * Returns sessionId and confirmation text; 5 agents run in background.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateMeetingDto,
    @CurrentUser() user: UserDocument,
  ) {
    const userId = (user as any)._id?.toString();
    const meeting = await this.meetingService.create(userId, dto);
    const sessionId = (meeting as any)._id?.toString();
    return {
      sessionId,
      confirmationText: meeting.confirmationText ?? null,
      status: meeting.status,
    };
  }

  /**
   * Update meeting form data (partial). JWT + ownership required.
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
    @CurrentUser() user: UserDocument,
  ) {
    const userId = (user as any)._id?.toString();
    const meeting = await this.meetingService.update(
      id,
      userId,
      dto as unknown as Record<string, unknown>,
    );
    return meeting?.toJSON ? meeting.toJSON() : meeting;
  }

  /**
   * Status for the loading screen (Page 3). Frontend polls every 2s.
   */
  @Get(':id/status')
  async getStatus(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.meetingService.getStatus(id, userId);
  }

  /**
   * Cultural briefing (Page 4). Returns JSON: dos, donts, communication_style, negotiation_approach, opening_line, meeting_flow.
   */
  @Get(':id/cultural')
  async getCultural(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
  ) {
    const userId = (user as any)._id?.toString();
    return this.meetingService.getCultural(id, userId);
  }

  /**
   * Investor psychological profile (Page 5). Returns JSON: personality_type, dominant_traits, likely_objections, questions_to_ask, how_to_approach, etc.
   */
  @Get(':id/psych')
  async getPsych(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.meetingService.getPsych(id, userId);
  }

  /**
   * Offer strategy (Page 7). Returns JSON: fair_score, valuation_verdict, market_comparison, strategic_advice, etc.
   */
  @Get(':id/offer')
  async getOffer(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.meetingService.getOffer(id, userId);
  }

  /**
   * Executive image coach (Page 8). Returns JSON: dress_items, body_language, speaking_advice, key_tip.
   */
  @Get(':id/image')
  async getImage(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.meetingService.getImage(id, userId);
  }

  /**
   * Smart location advisor (Page 9). Returns JSON: primary, secondary, avoid_description, venue_type, fallback_used (and for video: is_video_call).
   */
  @Get(':id/location')
  async getLocation(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
  ) {
    const userId = (user as any)._id?.toString();
    return this.meetingService.getLocation(id, userId);
  }

  /**
   * Negotiation (Page 6): start simulation. Returns investor's opening line; saved as first assistant message in history.
   */
  @Post(':id/negotiation/start')
  @HttpCode(HttpStatus.OK)
  async startNegotiation(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
  ) {
    const userId = (user as any)._id?.toString();
    return this.meetingService.startNegotiation(id, userId);
  }

  /**
   * Negotiation (Page 6): send user message. Returns investor reply + scores (two parallel LLM calls).
   */
  @Post(':id/negotiation/message')
  @HttpCode(HttpStatus.OK)
  async sendNegotiationMessage(
    @Param('id') id: string,
    @Body() dto: NegotiationMessageDto,
    @CurrentUser() user: UserDocument,
  ) {
    const userId = (user as any)._id?.toString();
    return this.meetingService.sendNegotiationMessage(id, userId, dto.message);
  }

  /**
   * Executive briefing (Page 10). Returns readiness score, section statuses, and narrative summaries.
   * Backend computes readiness and statuses; one LLM call generates narrative on first request.
   */
  @Get(':id/report')
  async getReport(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    return this.meetingService.getReport(id, userId);
  }

  /**
   * Export Executive Briefing as PDF (report only: header, readiness, 6 section cards, verdict, AVA message).
   * Report must exist (call GET /meeting/:id/report first).
   */
  @Post(':id/export')
  @HttpCode(HttpStatus.OK)
  async exportPdf(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    const userId = (user as any)._id?.toString();
    const buffer = await this.meetingService.exportReportPdf(id, userId);
    const filename = `executive-briefing-${id}.pdf`;
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  /**
   * Upload a document (e.g. PDF) for the meeting. Psych agent uses extracted text on next profile load.
   */
  @Post(':id/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id') id: string,
    @UploadedFile()
    file:
      | { buffer: Buffer; originalname?: string; mimetype?: string }
      | undefined,
    @CurrentUser() user: UserDocument,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('No file provided. Use form field "file".');
    }
    const userId = (user as any)._id?.toString();
    const attachment = await this.meetingService.addAttachment(id, userId, {
      buffer: file.buffer,
      originalname: file.originalname ?? 'document',
      mimetype: file.mimetype ?? 'application/octet-stream',
    });
    return { ok: true, attachment };
  }
}
