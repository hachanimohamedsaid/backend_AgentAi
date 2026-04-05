import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ProctoringEventType {
  HONESTY_ATTESTATION = 'honesty_attestation',
  SESSION_PROCTORING_STARTED = 'session_proctoring_started',
  FACE_ABSENT = 'face_absent',
  MULTIPLE_FACES = 'multiple_faces',
  VISIBILITY_HIDDEN = 'visibility_hidden',
  APP_BACKGROUNDED = 'app_backgrounded',
}

export class ProctoringEventDto {
  @IsEnum(ProctoringEventType, {
    message: `type doit être l'un des : ${Object.values(ProctoringEventType).join(', ')}`,
  })
  type: ProctoringEventType;

  /** Timestamp ISO 8601 côté client (ex. 2026-04-05T14:32:01.123Z) */
  @IsISO8601({ strict: true })
  ts: string;

  /** UUID côté client pour déduplication (optionnel) */
  @IsOptional()
  @IsUUID()
  clientEventId?: string;

  /** Durée de l'événement en millisecondes (optionnel) */
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  /** Nombre d'occurrences groupées (optionnel, défaut 1) */
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;
}

export class ProctorEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProctoringEventDto)
  events: ProctoringEventDto[];

  /**
   * Token invité passé dans le body (fallback si absent du header Authorization).
   * En prod, préférer Authorization: Bearer <guest_token>.
   */
  @IsOptional()
  @IsString()
  token?: string;
}
