import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class ResendMonthlyCouponDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must match YYYY-MM format',
  })
  month?: string;
}
