import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssistantFeedbackDto {
  /** Id de la suggestion (ObjectId backend ou ex. openai_* côté client). */
  @IsString()
  @IsNotEmpty()
  suggestionId: string;

  @IsString()
  @IsIn(['accepted', 'dismissed'])
  action: 'accepted' | 'dismissed';

  /** Identifiant utilisateur (body ou déduit du JWT). */
  @IsOptional()
  @IsString()
  userId?: string;

  /** Texte de la suggestion (utile si id côté client). */
  @IsOptional()
  @IsString()
  message?: string;

  /** Type de suggestion (ex. leave_home, break, coffee, focus). */
  @IsOptional()
  @IsString()
  type?: string;
}

