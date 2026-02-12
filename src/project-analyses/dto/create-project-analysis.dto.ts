import { IsInt, IsObject, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectAnalysisDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  row_number: number;

  @IsObject()
  analysis: {
    tools: string[];
    technicalProposal: {
      architecture: string;
      stack: string;
      security: string;
      performance: string;
      tests: string;
      deployment: string;
      monitoring: string;
    };
    howToWork: string;
    developmentSteps: Array<{
      title: string;
      description: string;
    }>;
    recommendations: string;
  };
}
