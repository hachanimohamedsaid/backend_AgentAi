import { IsBoolean, IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateMaladieDto {
  @IsMongoId()
  employeeId: string;

  @IsString()
  employeeName: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  days: number;

  @IsString()
  doctor: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsBoolean()
  certificate?: boolean;

  @IsOptional()
  @IsIn(['active', 'resolved'])
  status?: string;
}

