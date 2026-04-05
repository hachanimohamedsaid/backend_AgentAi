import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SocialCampaignService } from './social-campaign.service';
import { CampaignBriefDto } from './dto/campaign-brief.dto';
import { SendCampaignDto } from './dto/send-campaign.dto';
import { UpdateCampaignResultDto } from './dto/update-campaign-result.dto';

@Controller('social-campaign')
export class SocialCampaignController {
  constructor(private readonly socialCampaignService: SocialCampaignService) {}

  /**
   * POST /social-campaign/generate
   * Accepts the campaign brief, saves it with status "generating",
   * fires the N8N webhook in the background, and returns the new campaign
   * document (with its _id) immediately so Flutter can start polling.
   */
  @Post('generate')
  async generate(@Body() dto: CampaignBriefDto) {
    return this.socialCampaignService.generate(dto);
  }

  /**
   * GET /social-campaign/:id
   * Returns the campaign by id.
   * Flutter polls this endpoint until status === "completed" | "failed".
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.socialCampaignService.findOne(id);
  }

  /**
   * POST /social-campaign/:id/result
   * Called by N8N (or any external system) to write the generated campaign
   * content back into MongoDB and update the status to "completed" | "failed".
   */
  @Post(':id/result')
  async updateResult(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignResultDto,
  ) {
    return this.socialCampaignService.updateResult(id, dto);
  }

  /**
   * POST /social-campaign/:id/send
   * Marks the campaign as sent (updates sentTo / sentAt in MongoDB)
   * and triggers the N8N email agent with the report + recipient list.
   */
  @Post(':id/send')
  async send(@Param('id') id: string, @Body() dto: SendCampaignDto) {
    return this.socialCampaignService.send(id, dto);
  }
}
