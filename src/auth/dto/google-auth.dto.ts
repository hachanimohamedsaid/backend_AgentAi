import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idToken?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  accessToken?: string;
}
