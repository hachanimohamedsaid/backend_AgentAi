import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateInviteDto {
  @IsString()
  @MinLength(1)
  evaluationId: string;

  @IsOptional()
  @IsString()
  candidateName?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** Durée de validité du lien en jours (défaut: 7, max: 30) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @Type(() => Number)
  ttlDays?: number;
}
