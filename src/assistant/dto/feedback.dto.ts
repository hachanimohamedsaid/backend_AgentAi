import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class AssistantFeedbackDto {
  @IsString()
  @IsNotEmpty()
  suggestionId: string;

  @IsIn(['accepted', 'dismissed'])
  action: 'accepted' | 'dismissed';
}

