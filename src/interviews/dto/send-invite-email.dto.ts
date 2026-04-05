import { IsEmail, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class SendInviteEmailDto {
  @IsEmail()
  to: string;

  @IsString()
  @IsUrl({ require_tld: false })
  guestInterviewUrl: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  evaluationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  candidateName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  jobTitle?: string;
}
