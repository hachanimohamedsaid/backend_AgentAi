import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsArray,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

export enum ToneOfVoiceDto {
  Professional = 'professional',
  Friendly = 'friendly',
  Bold = 'bold',
  Luxurious = 'luxurious',
}

export class CampaignBriefDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  targetAudience: string;

  @IsEnum(ToneOfVoiceDto, {
    message:
      'toneOfVoice must be one of: professional, friendly, bold, luxurious',
  })
  toneOfVoice: ToneOfVoiceDto;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one platform must be selected' })
  @IsString({ each: true })
  platforms: string[];
}
