import { IsOptional, IsString, MinLength } from 'class-validator';

export class AppleAuthDto {
  @IsString()
  @MinLength(1, { message: 'identityToken is required' })
  identityToken: string;

  @IsOptional()
  @IsString()
  user?: string; // JSON string from Apple: { name?, email? }
}
