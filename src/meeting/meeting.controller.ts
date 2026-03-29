import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { AppendTranscriptDto } from './dto/append-transcript.dto';
import { SaveSummaryDto } from './dto/save-summary.dto';
import {
  CreateDocumentDto,
  CreateIntelligenceDraftDto,
  FlutterDraftDealTermsDto,
  GenerateReportDto,
  PatchDocumentFactsDto,
  PatchMeetingContextDto,
  PatchMeetingDocumentDto,
  SimulationStartDto,
  SimulationTurnDto,
} from './dto/meeting-context.dto';
import {
  toFlutterCulture,
  toFlutterImage,
  toFlutterLocation,
  toFlutterOffer,
  toFlutterPsychFromProfile,
} from './meeting-flutter.mapper';

@Controller('meetings')
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  async create(@Body() dto: CreateMeetingDto) {
    return this.meetingService.create(dto);
  }

  /** Start Investor Meeting Intelligence flow without legacy roomId/startTime from the client. */
  @Post('intelligence/draft')
  async createIntelligenceDraft(@Body() dto: CreateIntelligenceDraftDto) {
    return this.meetingService.createIntelligenceDraft(dto);
  }

  @Patch('intelligence/draft/:id')
  async patchIntelligenceDraft(
    @Param('id') id: string,
    @Body() dto: FlutterDraftDealTermsDto,
  ) {
    return this.meetingService.patchFlutterDraftDealTerms(id, dto);
  }

  @Post('intelligence/draft/:id/start-briefing')
  async startIntelligenceBriefing(@Param('id') id: string) {
    return this.meetingService.startBriefingFromDraft(id);
  }

  @Get()
  async findAll() {
    return this.meetingService.findAll();
  }

  @Get(':id/status')
  async getMeetingStatus(@Param('id') id: string) {
    return this.meetingService.getMeetingUiStatus(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.meetingService.findOne(id);
  }

  @Patch(':id/transcript')
  async appendTranscript(
    @Param('id') id: string,
    @Body() dto: AppendTranscriptDto,
  ) {
    return this.meetingService.appendTranscript(id, dto);
  }

  @Patch(':id/summary')
  async saveSummary(@Param('id') id: string, @Body() dto: SaveSummaryDto) {
    return this.meetingService.saveSummary(id, dto);
  }

  // --- Investor Meeting Intelligence flow ---

  @Patch(':id/context')
  async patchContext(
    @Param('id') id: string,
    @Body() dto: PatchMeetingContextDto,
  ) {
    return this.meetingService.patchContext(id, dto);
  }

  @Post(':id/documents')
  async addDocument(@Param('id') id: string, @Body() dto: CreateDocumentDto) {
    return this.meetingService.addDocument(id, dto);
  }

  @Patch(':id/documents/:docId')
  async patchDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: PatchMeetingDocumentDto,
  ) {
    return this.meetingService.patchDocument(id, docId, dto);
  }

  /** Merge structured facts into meeting.documentFacts (e.g. after doc extract LLM). */
  @Patch(':id/document-facts')
  async patchDocumentFacts(
    @Param('id') id: string,
    @Body() dto: PatchDocumentFactsDto,
  ) {
    return this.meetingService.patchDocumentFacts(id, dto);
  }

  @Post(':id/confirm')
  async confirmContext(@Param('id') id: string) {
    return this.meetingService.confirmContext(id);
  }

  @Post(':id/briefing/culture')
  async generateCulture(@Param('id') id: string) {
    const raw = await this.meetingService.generateBriefingTab(id, 'culture');
    return toFlutterCulture(raw as Record<string, unknown>);
  }

  @Post(':id/briefing/psych')
  async generatePsych(@Param('id') id: string) {
    const raw = await this.meetingService.generateBriefingTab(id, 'profile');
    return toFlutterPsychFromProfile(raw as Record<string, unknown>);
  }

  @Post(':id/briefing/profile')
  async generateProfile(@Param('id') id: string) {
    return this.meetingService.generateBriefingTab(id, 'profile');
  }

  @Post(':id/briefing/offer')
  async generateOffer(@Param('id') id: string) {
    const raw = await this.meetingService.generateBriefingTab(id, 'offer');
    return toFlutterOffer(raw as Record<string, unknown>);
  }

  @Post(':id/briefing/executive-image')
  async generateExecutiveImage(@Param('id') id: string) {
    const raw = await this.meetingService.generateBriefingTab(
      id,
      'executiveImage',
    );
    return toFlutterImage(raw as Record<string, unknown>);
  }

  @Post(':id/briefing/image')
  async generateImageBrief(@Param('id') id: string) {
    const raw = await this.meetingService.generateBriefingTab(
      id,
      'executiveImage',
    );
    return toFlutterImage(raw as Record<string, unknown>);
  }

  @Post(':id/briefing/location')
  async generateLocation(@Param('id') id: string) {
    const raw = await this.meetingService.generateBriefingTab(id, 'location');
    return toFlutterLocation(raw as Record<string, unknown>);
  }

  @Post(':id/simulation/start')
  async simulationStart(
    @Param('id') id: string,
    @Body() dto: SimulationStartDto,
  ) {
    return this.meetingService.simulationStart(id, dto);
  }

  @Post(':id/simulation/turn')
  async simulationTurn(
    @Param('id') id: string,
    @Body() dto: SimulationTurnDto,
  ) {
    return this.meetingService.simulationTurn(id, dto);
  }

  @Post(':id/simulation/end')
  async simulationEnd(@Param('id') id: string) {
    return this.meetingService.simulationEnd(id);
  }

  @Post(':id/report/generate')
  async generateReport(
    @Param('id') id: string,
    @Body() dto: GenerateReportDto,
  ) {
    return this.meetingService.generateFinalReport(id, dto);
  }

  @Get(':id/report')
  async getReport(@Param('id') id: string) {
    const report = await this.meetingService.getFlutterFinalReport(id);
    if (!report) throw new NotFoundException();
    return report;
  }

  @Post(':id/export')
  async exportPdf(@Param('id') id: string): Promise<StreamableFile> {
    const buf = await this.meetingService.exportMeetingPdf(id);
    return new StreamableFile(buf, {
      type: 'application/pdf',
      disposition: `attachment; filename="meeting-${id}.pdf"`,
    });
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.meetingService.delete(id);
    return { ok: true };
  }
}
