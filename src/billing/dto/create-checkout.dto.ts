import { IsIn, IsString } from 'class-validator';
import { IsOptional, MinLength } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @IsIn(['monthly', 'yearly'])
  plan: 'monthly' | 'yearly';

  @IsOptional()
  @IsString()
  @MinLength(4)
  couponCode?: string;
}
