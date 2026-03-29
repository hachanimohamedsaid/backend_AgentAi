import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { CampaignStatus } from '../campaign.schema';

export class UpdateCampaignResultDto {
  @IsNotEmpty({ message: 'campaignResult must not be empty' })
  campaignResult: unknown;

  @IsString()
  @IsIn(
    [CampaignStatus.Generating, CampaignStatus.Completed, CampaignStatus.Failed],
    {
      message: `status must be one of: generating, completed, failed`,
    },
  )
  status: CampaignStatus;
}
