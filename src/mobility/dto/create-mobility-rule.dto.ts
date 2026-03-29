import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class MobilityPreferencesDto {
  @IsOptional()
  @IsBoolean()
  cheapestFirst?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  maxEtaMinutes?: number;
}

export class CreateMobilityRuleDto {
  @IsString()
  name: string;

  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsString()
  timezone: string;

  @IsString()
  @Matches(/^([0-5]?\d|\*)\s+([01]?\d|2[0-3]|\*)\s+\*\s+\*\s+\*$/)
  cron: string;

  @IsBoolean()
  enabled: boolean;

  @IsBoolean()
  requireUserApproval: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => MobilityPreferencesDto)
  preferences?: MobilityPreferencesDto;
}
