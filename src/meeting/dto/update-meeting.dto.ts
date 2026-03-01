import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsISO8601,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

/**
 * DTO for PUT /meeting/:id — partial update of meeting form data (all fields optional).
 */
export class UpdateMeetingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  investorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  investorCompany?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsISO8601()
  meetingAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dealType?: string | null;

  @IsOptional()
  @IsIn(['Formal', 'Lunch', 'Dinner', 'Video Call'])
  meetingType?: 'Formal' | 'Lunch' | 'Dinner' | 'Video Call' | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sector?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valuation?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  equity?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  investmentAsked?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  revenue?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  teamSize?: number | null;

  @IsOptional()
  @IsString()
  investorBio?: string | null;

  @IsOptional()
  @IsString()
  investorPosts?: string | null;
}
