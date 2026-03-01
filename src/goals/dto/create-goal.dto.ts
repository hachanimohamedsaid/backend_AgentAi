import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DailyActionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class CreateGoalDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyActionDto)
  dailyActions?: DailyActionDto[];
}
