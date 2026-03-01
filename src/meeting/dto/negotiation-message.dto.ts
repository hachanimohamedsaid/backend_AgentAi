import { IsString, MaxLength } from 'class-validator';

export class NegotiationMessageDto {
  @IsString()
  @MaxLength(4000)
  message: string;
}
