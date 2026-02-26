import { Controller, Delete, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { MlService } from './ml.service';

@Controller('ml')
export class MlController {
  private readonly logger = new Logger(MlController.name);

  constructor(private readonly mlService: MlService) {}

  /**
   * GET /ml/spending-prediction
   *
   * Returns next-month spending predictions by category using simple
   * linear regression over the last 6 months of Google Sheets data
   * (fetched via n8n webhook /webhook/ml-predict).
   *
   * Response is cached in MongoDB for 24 h (TTL index).
   */
  @Get('spending-prediction')
  async getSpendingPrediction() {
    try {
      return await this.mlService.getSpendingPrediction();
    } catch (err) {
      this.logger.error('ML prediction failed', err);
      throw new HttpException(
        { message: 'Failed to compute spending prediction', error: String(err) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('spending-prediction/cache')
  async clearSpendingCache() {
    try {
      return await this.mlService.clearSpendingCache();
    } catch (err) {
      this.logger.error('ML cache clear failed', err);
      throw new HttpException(
        { message: 'Failed to clear spending prediction cache', error: String(err) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
