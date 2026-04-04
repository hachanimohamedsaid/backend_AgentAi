import { IsOptional, IsString } from 'class-validator';

export class StartInterviewDto {
  @IsOptional()
  @IsString()
  evaluationId?: string;

  @IsOptional()
  @IsString()
  candidateName?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  jobId?: string;
}
