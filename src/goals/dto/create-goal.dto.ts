import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DailyActionDto {
  @IsString()
  id: string;

  @IsString()
  label: string;

  @IsBoolean()
  completed: boolean;
}

export class CreateGoalDto {
  @IsString()
  title: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyActionDto)
  dailyActions?: DailyActionDto[];
}
