import { IsNotEmpty, IsString } from 'class-validator';

export class GuestMessageDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
