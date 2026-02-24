import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(private readonly configService: ConfigService) {}

  private get endpoint(): string {
    const url =
      this.configService.get<string>('ML_SERVICE_URL') ||
      process.env.ML_SERVICE_URL;
    if (url) return url.replace(/\/?$/, '') + '/predict';
    return 'http://127.0.0.1:5001/predict';
  }

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

