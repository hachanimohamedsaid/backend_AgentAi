import { IsOptional, IsString } from 'class-validator';

export class GuestCompleteDto {
  /** Token signé invité — requis si absent du header Authorization: Bearer */
  @IsOptional()
  @IsString()
  token?: string;
}
