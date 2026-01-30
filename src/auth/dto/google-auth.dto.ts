import { IsString, MinLength } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @MinLength(1, { message: 'idToken or accessToken is required' })
  idToken: string;
}
