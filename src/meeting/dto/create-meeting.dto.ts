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
 * DTO for POST /meeting — all form data from Meeting Setup (Steps 1 & 2).
 * Required fields match the minimum needed to create a meeting and run agents.
 */
export class CreateMeetingDto {
  // --- Step 1: Investor information ---
  @IsString()
  @MaxLength(200)
  investorName: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  investorCompany?: string | null;

  @IsString()
  @MaxLength(100)
  country: string;

  @IsString()
  @MaxLength(100)
  city: string;

  /** ISO 8601 date-time e.g. "2025-03-06T18:00:00" */
  @IsISO8601()
  meetingAt: string;

  // --- Step 2: Deal terms & meeting format ---
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

  /** Investor bio / description (optional). Improves Psych agent output. */
  @IsOptional()
  @IsString()
  investorBio?: string | null;

  /** Public posts or quotes from investor (optional). Improves Psych agent. */
  @IsOptional()
  @IsString()
  investorPosts?: string | null;
}
