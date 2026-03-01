import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsArray,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TranscriptChunkDto } from './create-meeting.dto';

export class UpdateMeetingDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  duration?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participants?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranscriptChunkDto)
  transcript?: TranscriptChunkDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyPoints?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actionItems?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  decisions?: string[];

  @IsOptional()
  @IsString()
  summary?: string;
}
