import { IsString, MinLength } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @MinLength(4)
  couponCode: string;
}
