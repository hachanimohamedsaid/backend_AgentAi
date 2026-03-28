import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { CampaignStatus } from '../campaign.schema';

export class UpdateCampaignResultDto {
  @IsObject({ message: 'campaignResult must be a JSON object' })
  @IsNotEmpty()
  campaignResult: Record<string, unknown>;

  @IsString()
  @IsIn(
    [CampaignStatus.Generating, CampaignStatus.Completed, CampaignStatus.Failed],
    {
      message: `status must be one of: generating, completed, failed`,
    },
  )
  status: CampaignStatus;
}
