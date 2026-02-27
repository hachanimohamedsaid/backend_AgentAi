import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SignalScoresDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  priority?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  confidence?: number;
}

export class AssistantSignalDto {
  /**
   * Example values:
   * - MEETING_SOON
   * - EMAIL_REQUIRES_RESPONSE
   * - TRAFFIC_ALERT
   * - BREAK_SUGGESTED
   * - WEEKLY_SUMMARY_READY
   */
  @IsString()
  @IsNotEmpty()
  signalType: string;

  /**
   * Arbitrary JSON payload normalized by backend/ML.
   * Examples:
   * - { title, startsAt, location, startsInMin }
   * - { subject, from, receivedAt }
   */
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => SignalScoresDto)
  scores?: SignalScoresDto;

  /** ISO string recommended */
  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  source?: string; // backend|ml|mongo|...
}

export class GenerateNotificationsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  userId?: string;

  /** e.g. fr-TN, fr-FR, en-US, ar-TN */
  @IsOptional()
  @IsString()
  locale?: string;

  /** e.g. Africa/Tunis */
  @IsOptional()
  @IsString()
  timezone?: string;

  /** If provided, backend will generate max N notifications */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  maxItems?: number;

  @IsOptional()
  @IsIn(['professional', 'friendly', 'concise'])
  tone?: 'professional' | 'friendly' | 'concise';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssistantSignalDto)
  signals: AssistantSignalDto[];
}

