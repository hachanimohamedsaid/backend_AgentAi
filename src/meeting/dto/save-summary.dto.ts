import { IsString, IsOptional, IsArray } from 'class-validator';

export class SaveSummaryDto {
  @IsOptional()
  @IsString()
  summary?: string;

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
}
