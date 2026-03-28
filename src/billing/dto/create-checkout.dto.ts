import { IsIn, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @IsIn(['monthly', 'yearly'])
  plan: 'monthly' | 'yearly';
}
