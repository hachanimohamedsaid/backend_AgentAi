import { IsInt, IsString, Min } from 'class-validator';

export class CompleteChallengeDto {
  @IsString()
  challengeId: string;

  @IsInt()
  @Min(1)
  points: number;
}
