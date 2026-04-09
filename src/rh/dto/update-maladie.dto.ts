import { IsIn, IsOptional } from 'class-validator';

export class UpdateMaladieDto {
  @IsOptional()
  @IsIn(['active', 'resolved'])
  status?: string;
}

