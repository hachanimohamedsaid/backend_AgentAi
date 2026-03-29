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

export class UpdateMobilityRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([0-5]?\d|\*)\s+([01]?\d|2[0-3]|\*)\s+\*\s+\*\s+\*$/)
  cron?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requireUserApproval?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => MobilityPreferencesDto)
  preferences?: MobilityPreferencesDto;
}
