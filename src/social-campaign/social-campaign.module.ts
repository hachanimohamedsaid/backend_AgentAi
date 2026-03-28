import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { Campaign, CampaignSchema } from './campaign.schema';
import { SocialCampaignService } from './social-campaign.service';
import { SocialCampaignController } from './social-campaign.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
    ]),
    HttpModule.register({ timeout: 120_000, maxRedirects: 5 }),
  ],
  controllers: [SocialCampaignController],
  providers: [SocialCampaignService],
  exports: [SocialCampaignService],
})
export class SocialCampaignModule {}
