import { IsNotEmpty, IsString } from 'class-validator';

export class GuestStartDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
