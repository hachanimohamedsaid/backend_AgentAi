import { IsOptional, IsString } from 'class-validator';

export class GuestStartDto {
  /** Token signé invité — requis si absent du header Authorization: Bearer */
  @IsOptional()
  @IsString()
  token?: string;
}
