import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { SubmitWellbeingDto } from './dto/submit-wellbeing.dto';
import { WellbeingService } from './wellbeing.service';

/**
 * AVA Wellbeing Intelligence — matches SPA contract (/api/* via proxy from Vite).
 */
@Controller('api')
export class WellbeingController {
  constructor(private readonly wellbeingService: WellbeingService) {}

  @Post('register')
  registerWellbeingUser() {
    return this.wellbeingService.register();
  }

  @Get('wellbeing/status')
  async wellbeingStatus(@Query('user_id') userId?: string) {
    const id = userId?.trim();
    if (!id) {
      throw new BadRequestException({
        detail: 'user_id query parameter is required',
      });
    }
    return this.wellbeingService.getStatus(id);
  }

  @Post('wellbeing')
  async submitWellbeing(@Body() dto: SubmitWellbeingDto) {
    return this.wellbeingService.submitDiagnostic(
      dto.answers,
      dto.previousScore,
      dto.userId,
    );
  }
}
