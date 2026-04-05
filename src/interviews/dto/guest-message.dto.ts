import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GuestMessageDto {
  /** Token signé invité — requis si absent du header Authorization: Bearer */
  @IsOptional()
  @IsString()
  token?: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
