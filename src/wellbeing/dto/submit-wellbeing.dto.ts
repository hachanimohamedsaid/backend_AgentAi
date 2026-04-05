import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  IsNumber,
} from 'class-validator';

export class SubmitWellbeingDto {
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v: unknown) => Number(v)) : value,
  )
  @IsArray()
  @ArrayMinSize(9)
  @ArrayMaxSize(9)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(5, { each: true })
  answers!: number[];

  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === '' ? undefined : value,
  )
  @IsNumber()
  @Type(() => Number)
  previousScore?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === '') {
      return undefined;
    }
    return typeof value === 'string' ? value.trim() : String(value).trim();
  })
  @IsString()
  userId?: string;
}
