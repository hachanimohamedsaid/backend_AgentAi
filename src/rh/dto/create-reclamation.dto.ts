import { IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateReclamationDto {
  @IsMongoId()
  employeeId: string;

  @IsString()
  employeeName: string;

  @IsString()
  subject: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsIn(['open', 'in_progress', 'resolved'])
  status?: string;
}

