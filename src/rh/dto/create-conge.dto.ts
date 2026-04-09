import { IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCongeDto {
  @IsMongoId()
  employeeId: string;

  @IsString()
  employeeName: string;

  @IsString()
  type: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  days: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: string;
}

