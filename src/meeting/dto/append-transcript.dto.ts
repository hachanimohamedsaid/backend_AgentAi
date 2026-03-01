import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TranscriptChunkDto } from './create-meeting.dto';

export class AppendTranscriptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranscriptChunkDto)
  chunks: TranscriptChunkDto[];
}
