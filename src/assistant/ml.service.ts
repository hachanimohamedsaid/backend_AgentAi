import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);
  // Use IPv4 by default to avoid ::1 issues; override with ML_PREDICT_URL if needed
  private readonly endpoint =
    process.env.ML_PREDICT_URL ?? 'http://127.0.0.1:5001/predict';

  async predict(params: {
    timeOfDay: number;
    dayOfWeek: number;
    suggestionType: string;
  }): Promise<number> {
    try {
      const response = await axios.post(this.endpoint, {
        timeOfDay: params.timeOfDay,
        dayOfWeek: params.dayOfWeek,
        suggestionType: params.suggestionType,
      });
      const probability = response.data?.probability;
      if (typeof probability !== 'number') {
        throw new Error('Invalid ML response: missing probability');
      }
      return probability;
    } catch (err: any) {
      const message = err?.message ?? 'ML prediction failed';
      this.logger.error(`ML predict error: ${message}`);
      throw err;
    }
  }
}

