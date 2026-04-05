import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Campaign, CampaignDocument, CampaignStatus } from './campaign.schema';
import { CampaignBriefDto } from './dto/campaign-brief.dto';
import { SendCampaignDto } from './dto/send-campaign.dto';
import { UpdateCampaignResultDto } from './dto/update-campaign-result.dto';

const N8N_TIMEOUT_MS = 300_000;
const EMAIL_TIMEOUT_MS = 30_000;

@Injectable()
export class SocialCampaignService {
  private readonly logger = new Logger(SocialCampaignService.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private isValidObjectId(id: string): boolean {
    return (
      Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id
    );
  }

  private toPlain(doc: any): any {
    if (doc && typeof doc.toJSON === 'function') return doc.toJSON();
    const ret = { ...doc };
    if (ret._id) {
      ret.id = ret._id.toString();
      delete ret._id;
    }
    delete ret.__v;
    return ret;
  }

  // ─── POST /social-campaign/generate ─────────────────────────────────────────

  async generate(dto: CampaignBriefDto): Promise<any> {
    // 1. Save to MongoDB with status "generating"
    const doc = await this.campaignModel.create({
      productName: dto.productName,
      description: dto.description,
      targetAudience: dto.targetAudience,
      toneOfVoice: dto.toneOfVoice,
      platforms: dto.platforms,
      campaignResult: {},
      status: CampaignStatus.Generating,
      sentTo: [],
      sentAt: null,
    });

    const campaignId = doc._id.toString();
    this.logger.log(
      `Campaign created [${campaignId}] — triggering N8N webhook`,
    );

    // 2. Fire-and-forget: call N8N, update campaign when done
    this.triggerN8nAndUpdate(campaignId, dto).catch((err) =>
      this.logger.error(
        `N8N webhook failed for campaign [${campaignId}]: ${err.message}`,
      ),
    );

    // 3. Return immediately so Flutter can start polling
    return this.toPlain(doc);
  }

  // ─── Background: call N8N then update campaign ───────────────────────────────

  private async triggerN8nAndUpdate(
    campaignId: string,
    dto: CampaignBriefDto,
  ): Promise<void> {
    const webhookUrl = this.configService.get<string>('N8N_SOCIAL_WEBHOOK_URL');

    if (!webhookUrl) {
      this.logger.warn(
        'N8N_SOCIAL_WEBHOOK_URL is not set — marking campaign as failed.',
      );
      await this.campaignModel.findByIdAndUpdate(campaignId, {
        status: CampaignStatus.Failed,
        campaignResult: { error: 'N8N_SOCIAL_WEBHOOK_URL not configured' },
      });
      return;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          webhookUrl,
          {
            campaignId,
            productName: dto.productName,
            description: dto.description,
            targetAudience: dto.targetAudience,
            toneOfVoice: dto.toneOfVoice,
            platforms: dto.platforms,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: N8N_TIMEOUT_MS,
          },
        ),
      );

      const result: unknown =
        response.data !== undefined ? response.data : null;

      await this.campaignModel.findByIdAndUpdate(campaignId, {
        status: CampaignStatus.Completed,
        campaignResult: result,
      });

      this.logger.log(`Campaign [${campaignId}] completed successfully`);
    } catch (err: any) {
      const errMsg = err?.message ?? 'Unknown error';
      const errCode = err?.code;
      const isTimeout =
        errCode === 'ECONNABORTED' || errMsg.toLowerCase().includes('timeout');

      if (isTimeout) {
        // Do not fail early on timeout; n8n may still finish and callback /:id/result.
        this.logger.warn(
          `N8N call timed out for campaign [${campaignId}] after ${N8N_TIMEOUT_MS}ms. Keeping status as generating.`,
        );
        return;
      }

      this.logger.error(
        `N8N call failed for campaign [${campaignId}]: ${errMsg}`,
      );

      await this.campaignModel.findByIdAndUpdate(campaignId, {
        status: CampaignStatus.Failed,
        campaignResult: { error: errMsg },
      });
    }
  }

  // ─── GET /social-campaign/:id ────────────────────────────────────────────────

  async findOne(id: string): Promise<any> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid campaign id');
    }
    const doc = await this.campaignModel.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    return this.toPlain(doc);
  }

  // ─── POST /social-campaign/:id/result ───────────────────────────────────────

  async updateResult(id: string, dto: UpdateCampaignResultDto): Promise<any> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid campaign id');
    }

    const doc = await this.campaignModel
      .findByIdAndUpdate(
        id,
        { campaignResult: dto.campaignResult, status: dto.status },
        { new: true },
      )
      .lean()
      .exec();

    if (!doc) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    this.logger.log(`Campaign [${id}] result updated — status: ${dto.status}`);

    return this.toPlain(doc);
  }

  // ─── POST /social-campaign/:id/send ─────────────────────────────────────────

  async send(id: string, dto: SendCampaignDto): Promise<any> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid campaign id');
    }

    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    if ((campaign as any).status !== CampaignStatus.Completed) {
      throw new BadRequestException(
        'Campaign must be completed before sending. Current status: ' +
          (campaign as any).status,
      );
    }

    // Update sentTo / sentAt in MongoDB
    (campaign as any).sentTo = dto.recipients;
    (campaign as any).sentAt = new Date();
    await campaign.save();

    // Trigger email agent via N8N (fire-and-forget, non-blocking)
    this.triggerEmailAgent(campaign, dto).catch((err) =>
      this.logger.error(
        `Email agent failed for campaign [${id}]: ${err.message}`,
      ),
    );

    return this.toPlain(campaign);
  }

  // ─── Background: trigger email N8N agent ─────────────────────────────────────

  private async triggerEmailAgent(
    campaign: CampaignDocument,
    dto: SendCampaignDto,
  ): Promise<void> {
    const emailWebhookUrl = this.configService.get<string>(
      'N8N_EMAIL_AGENT_WEBHOOK_URL',
    );

    if (!emailWebhookUrl) {
      this.logger.warn(
        'N8N_EMAIL_AGENT_WEBHOOK_URL is not set — email not sent.',
      );
      return;
    }

    const campaignId = campaign._id.toString();

    try {
      await firstValueFrom(
        this.httpService.post(
          emailWebhookUrl,
          {
            campaignId,
            productName: (campaign as any).productName,
            platforms: (campaign as any).platforms,
            campaignResult: (campaign as any).campaignResult,
            recipients: dto.recipients,
            notes: dto.notes ?? '',
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: EMAIL_TIMEOUT_MS,
          },
        ),
      );
      this.logger.log(
        `Email agent triggered for campaign [${campaignId}] → ${dto.recipients.join(', ')}`,
      );
    } catch (err: any) {
      // Re-throw so caller can log
      throw new InternalServerErrorException(
        `Email agent webhook error: ${err.message}`,
      );
    }
  }
}
