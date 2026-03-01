import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

type LocationDto = 'home' | 'work' | 'outside';
type WeatherDto = 'sunny' | 'cloudy' | 'rain';

class MeetingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  time: string; // HH:mm
}

export class CreateContextDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  time: string; // HH:mm

  @IsEnum(['home', 'work', 'outside'] as LocationDto[])
  location: LocationDto;

  @IsEnum(['sunny', 'cloudy', 'rain'] as WeatherDto[])
  weather: WeatherDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeetingDto)
  @IsOptional()
  meetings?: MeetingDto[];

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  focusHours: number;
}
