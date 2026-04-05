import { IsNotEmpty, IsString } from 'class-validator';

export class GuestCompleteDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
