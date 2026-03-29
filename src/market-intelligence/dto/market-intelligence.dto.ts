import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

/** Body for POST /market-intelligence (Page 1 form). */
export class MarketIntelligenceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  valuation!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  equity!: number;

  @IsString()
  @MaxLength(120)
  sector!: string;

  @IsString()
  @MaxLength(120)
  stage!: string;

  @IsString()
  @MaxLength(120)
  geography!: string;

  /** Optional — personalizes LLM coaching (e.g. investor first name). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  investorName?: string;
}
