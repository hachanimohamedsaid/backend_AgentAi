import {
  IsString,
  IsEnum,
  IsInt,
  Min,
  IsISO8601,
  IsUUID,
  IsOptional,
  Matches,
  MaxLength,
  IsEmail,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Enum for meeting decision states
 * Production-ready decision validation
 */
export enum DecisionEnum {
  ACCEPT = 'accept',
  REJECT = 'reject',
}

/**
 * MeetingDecisionDto
 * POST /meeting/decision endpoint request body
 *
 * Validation ensures:
 * - meetingDate: Valid ISO8601 date string (YYYY-MM-DD format)
 * - meetingTime: Valid ISO8601 datetime string (full datetime)
 * - decision: Strict enum validation (accept|reject only)
 * - durationMinutes: Positive integer
 * - requestId: Valid UUID v4
 * - userEmail & userTimezone: Optional validated strings
 *
 * Use with ValidationPipe(whitelist:true, forbidNonWhitelisted:true)
 */
export class MeetingDecisionDto {
  /**
   * Meeting date in YYYY-MM-DD format (ISO8601 date string)
   * @example "2026-02-15"
   */
  @ApiProperty({
    description: 'Meeting date in YYYY-MM-DD format (ISO8601)',
    example: '2026-02-15',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'meetingDate must be in YYYY-MM-DD format',
  })
  meetingDate: string;

  /**
   * Meeting datetime in ISO8601 format (full datetime with timezone info)
   * @example "2026-02-15T14:30:00Z"
   */
  @ApiProperty({
    description: 'Meeting datetime in ISO8601 format (full datetime)',
    example: '2026-02-15T14:30:00Z',
  })
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'meetingTime must be a full ISO8601 datetime with timezone',
  })
  meetingTime: string;

  /**
   * Meeting decision: accept or reject only
   * Enum validation required - strict types enforced
   */
  @ApiProperty({
    description: 'Meeting decision (accept or reject)',
    enum: DecisionEnum,
    example: DecisionEnum.ACCEPT,
  })
  @IsEnum(DecisionEnum, {
    message: 'decision must be either "accept" or "reject"',
  })
  decision: DecisionEnum;

  /**
   * Meeting duration in minutes (positive integer)
   * Minimum: 1 minute
   */
  @ApiProperty({
    description: 'Meeting duration in minutes (positive integer)',
    type: Number,
    minimum: 1,
    example: 30,
  })
  @IsInt({ message: 'durationMinutes must be an integer' })
  @Min(1, { message: 'durationMinutes must be at least 1' })
  durationMinutes: number;

  /**
   * Unique request identifier (UUID v4)
   * Used for idempotency - prevents duplicate processing
   */
  @ApiProperty({
    description: 'Unique request identifier (UUID v4) for idempotency',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', {
    message: 'requestId must be a valid UUID v4',
  })
  requestId: string;

  /**
   * Optional: User email address
   * Validated email format
   */
  @ApiPropertyOptional({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'userEmail must be a valid email address' })
  userEmail?: string;

  /**
   * Optional: User timezone (IANA timezone string)
   * Examples: UTC, America/New_York, Europe/Paris, Asia/Tokyo
   */
  @ApiPropertyOptional({
    description: 'User timezone (IANA timezone string)',
    example: 'America/New_York',
  })
  @IsOptional()
  @IsString({ message: 'userTimezone must be a string' })
  @MaxLength(50, {
    message: 'userTimezone must not exceed 50 characters',
  })
  userTimezone?: string;
}
