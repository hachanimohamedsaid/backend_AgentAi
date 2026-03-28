import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class EstimatePreferencesDto {
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

export class EstimateRideDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsDateString()
  pickupAt: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EstimatePreferencesDto)
  preferences?: EstimatePreferencesDto;
}
