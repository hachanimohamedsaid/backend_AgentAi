import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AnalyzeAdvisorDto {
  @IsString()
  @IsNotEmpty({ message: 'project_text is required' })
  @MaxLength(10000)
  project_text: string;
}
