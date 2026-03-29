import {
  IsBoolean,
  IsDateString,
  IsNumber,
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

class CoordsDto {
  @Type(() => Number)
  @IsNumber()
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  longitude: number;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordsDto)
  fromCoordinates?: CoordsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordsDto)
  toCoordinates?: CoordsDto;
}
