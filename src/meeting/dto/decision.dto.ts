import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsUUID,
  Min,
  IsOptional,
  Matches,
  MaxLength,
  IsEmail,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DecisionEnum {
  ACCEPT = 'accept',
  REJECT = 'reject',
}

export class MeetingDecisionDto {
  @ApiProperty({
    description: 'Meeting date in YYYY-MM-DD format (ISO8601)',
    example: '2026-02-15',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'meetingDate must be in YYYY-MM-DD format',
  })
  meetingDate: string;

  @ApiProperty({
    description: 'Meeting datetime in ISO8601 format (full datetime with timezone)',
    example: '2026-02-15T14:30:00Z',
  })
  @IsISO8601({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    {
      message:
        'meetingTime must be a full ISO8601 datetime with timezone',
    },
  )
  meetingTime: string;

  @ApiProperty({
    description: 'Meeting decision (accept or reject)',
    enum: DecisionEnum,
    example: DecisionEnum.ACCEPT,
  })
  @IsEnum(DecisionEnum, {
    message: 'decision must be either "accept" or "reject"',
  })
  decision: DecisionEnum;

  @ApiProperty({
    description: 'Meeting duration in minutes (positive integer)',
    minimum: 1,
    example: 30,
  })
  @IsInt({ message: 'durationMinutes must be an integer' })
  @Min(1, { message: 'durationMinutes must be at least 1' })
  durationMinutes: number;

  @ApiProperty({
    description: 'Unique request identifier (UUID v4) for idempotency',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', {
    message: 'requestId must be a valid UUID v4',
  })
  requestId: string;

  @ApiPropertyOptional({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'userEmail must be a valid email address' })
  userEmail?: string;

  @ApiPropertyOptional({
    description: 'User timezone (IANA timezone string)',
    example: 'Europe/Paris',
  })
  @IsOptional()
  @IsString({ message: 'userTimezone must be a string' })
  @MaxLength(50, {
    message: 'userTimezone must not exceed 50 characters',
  })
  userTimezone?: string;
}
