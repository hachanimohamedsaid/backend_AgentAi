import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsIn(['direct', 'group'])
  type: 'direct' | 'group';

  @IsArray()
  @ArrayMinSize(1)
  participantIds: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}

