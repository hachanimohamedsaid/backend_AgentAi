import {
  IsArray,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Step 1+ — all optional so you can save partial wizard state. */
export class InvestorContextDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  firm?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  linkedInUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MeetingLogisticsDto {
  @IsOptional()
  @IsISO8601()
  datetime?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  venueHint?: string;
}

export class DealContextDto {
  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  targetAmount?: number;

  @IsOptional()
  @IsString()
  targetAmountLabel?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  valuation?: number;

  @IsOptional()
  @IsString()
  valuationLabel?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  equity?: number;

  @IsOptional()
  @IsString()
  meetingType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agendaGoals?: string[];
}

export class PatchMeetingContextDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => InvestorContextDto)
  investor?: InvestorContextDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MeetingLogisticsDto)
  meeting?: MeetingLogisticsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DealContextDto)
  deal?: DealContextDto;

  /** Arbitrary extra keys for future UI fields without API change. */
  @IsOptional()
  @IsObject()
  extensions?: Record<string, unknown>;
}

export class CreateDocumentDto {
  @IsString()
  filename: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  docType?: string;

  @IsOptional()
  @IsString()
  storageUrl?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  extractedText?: string;

  @IsOptional()
  @IsString()
  extractedSummary?: string;

  @IsOptional()
  @IsObject()
  keyFacts?: Record<string, unknown>;
}

export class PatchMeetingDocumentDto {
  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  docType?: string;

  @IsOptional()
  @IsString()
  storageUrl?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  extractedText?: string;

  @IsOptional()
  @IsString()
  extractedSummary?: string;

  @IsOptional()
  @IsObject()
  keyFacts?: Record<string, unknown>;
}

/** Merge into meeting.documentFacts (LLM or client). */
export class PatchDocumentFactsDto {
  @IsObject()
  facts: Record<string, unknown>;
}

export class SimulationStartDto {
  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  personaName?: string;

  @IsOptional()
  @IsString()
  personaArchetype?: string;
}

export class SimulationTurnDto {
  /** Flutter sends `{ "message": "..." }`; legacy clients use userMessage. */
  @IsOptional()
  @IsString()
  userMessage?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class GenerateReportDto {
  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

/** Step 2 wizard body from Flutter `PATCH .../intelligence/draft/:id`. */
export class FlutterDraftDealTermsDto {
  @IsOptional()
  @IsString()
  dealType?: string;

  @IsOptional()
  @IsString()
  meetingFormat?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsString()
  valuation?: string;

  @IsOptional()
  @IsString()
  equity?: string;

  @IsOptional()
  @IsString()
  investmentAsked?: string;

  @IsOptional()
  @IsString()
  revenue?: string;

  @IsOptional()
  @IsString()
  teamSize?: string;

  @IsOptional()
  @IsString()
  investorBio?: string;

  @IsOptional()
  @IsString()
  publicPosts?: string;

  @IsOptional()
  @IsString()
  documentFileName?: string;
}

export class CreateIntelligenceDraftDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchMeetingContextDto)
  initialContext?: PatchMeetingContextDto;

  /** Flutter step 1 — flat body (alternative to initialContext). */
  @IsOptional()
  @IsString()
  investorName?: string;

  @IsOptional()
  @IsString()
  investorCompany?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  meetingAt?: string;
}
