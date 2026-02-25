import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface MlPredictContext {
  userId?: string;
  time: string;
  location: string;
  weather: string;
  focusHours: number;
  meetings: number;
}

export interface MlSuggestionItem {
  message: string;
  confidence: number;
}

export interface MlPredictResponse {
  suggestions: MlSuggestionItem[];
}

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private getBaseUrl(): string {
    const url =
      this.configService.get<string>('ML_SERVICE_URL') ||
      process.env.ML_SERVICE_URL;
    if (url) {
      return url.replace(/\/predict\/?$/i, '').replace(/\/retrain\/?.*$/i, '').replace(/\/?$/, '');
    }
    return process.env.NODE_ENV === 'production'
      ? 'https://incredible-determination-production-a7c3.up.railway.app'
      : 'http://127.0.0.1:8000';
  }

  private getPredictEndpoint(): string {
    return `${this.getBaseUrl()}/predict`;
  }

  private getRetrainEndpoint(userId: string): string {
    return `${this.getBaseUrl()}/retrain/${encodeURIComponent(userId)}`;
  }

  async predict(
    context: MlPredictContext,
  ): Promise<MlSuggestionItem[]> {
    const endpoint = this.getPredictEndpoint();
    try {
      const response = await firstValueFrom(
        this.httpService.post<MlPredictResponse>(
          endpoint,
          {
            ...(context.userId && { userId: context.userId }),
            time: context.time,
            location: context.location,
            weather: context.weather,
            focusHours: context.focusHours,
            meetings: context.meetings,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
          },
        ),
      );
      const suggestions = response.data?.suggestions;
      if (!Array.isArray(suggestions)) {
        throw new Error('Invalid ML response: missing or invalid suggestions array');
      }
      return suggestions;
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'ML prediction service unreachable';
      this.logger.error(`ML predict error: ${message}`);
      throw new Error(
        `ML service unavailable: ${typeof message === 'string' ? message : 'request failed'}`,
      );
    }
  }

  /**
   * Call ML service POST /retrain/:userId. Returns { trained: boolean } or null on error.
   */
  async retrain(userId: string): Promise<{ trained: boolean } | null> {
    const endpoint = this.getRetrainEndpoint(userId);
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ user_id: string; trained: boolean }>(
          endpoint,
          {},
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
          },
        ),
      );
      return {
        trained: response.data?.trained ?? false,
      };
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.message ??
        'ML retrain failed';
      this.logger.warn(`ML retrain error: ${message}`);
      return null;
    }
  }
}
