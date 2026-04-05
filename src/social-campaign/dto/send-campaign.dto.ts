import {
  IsArray,
  IsEmail,
  ArrayMinSize,
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class SendCampaignDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one recipient is required' })
  @IsEmail(
    {},
    { each: true, message: 'Each recipient must be a valid email address' },
  )
  recipients: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
