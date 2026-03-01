import { IsBoolean } from 'class-validator';

export class ToggleActionDto {
  @IsBoolean()
  completed: boolean;
}
