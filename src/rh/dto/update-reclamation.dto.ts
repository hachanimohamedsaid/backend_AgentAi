import { IsIn, IsOptional } from 'class-validator';

export class UpdateReclamationDto {
  @IsOptional()
  @IsIn(['open', 'in_progress', 'resolved'])
  status?: string;
}

