import {
  IsArray,
  ValidateNested,
  IsOptional,
  IsString,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TranscriptChunkDto } from './create-meeting.dto';

export class AppendTranscriptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranscriptChunkDto)
  chunks: TranscriptChunkDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participants?: string[];

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  duration?: number;

  @IsOptional()
  @IsString()
  title?: string;
}
