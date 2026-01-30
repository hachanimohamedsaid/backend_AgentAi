import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  role?: string | null;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  conversationsCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hoursSaved?: number;
}
