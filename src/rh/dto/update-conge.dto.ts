import { IsIn, IsOptional } from 'class-validator';

export class UpdateCongeDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: string;
}

