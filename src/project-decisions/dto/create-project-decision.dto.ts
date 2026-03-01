import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectDecisionDto {
  @IsIn(['accept', 'reject'])
  action: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  row_number: number;

  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsString()
  type_projet: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  budget_estime?: number;

  @IsOptional()
  @IsString()
  periode?: string;
}
