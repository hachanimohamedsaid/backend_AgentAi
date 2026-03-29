import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CoordsDto {
  @Type(() => Number)
  @IsNumber()
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  longitude: number;
}

class RouteSnapshotDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  distanceKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMin?: number;
}

export class CreateProposalDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsDateString()
  pickupAt: string;

  @IsString()
  selectedProvider: string;

  @Type(() => Number)
  @IsNumber()
  selectedPrice: number;

  @Type(() => Number)
  @IsNumber()
  selectedEtaMinutes: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordsDto)
  fromCoordinates?: CoordsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordsDto)
  toCoordinates?: CoordsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RouteSnapshotDto)
  routeSnapshot?: RouteSnapshotDto;
}
