import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(private readonly configService: ConfigService) {}

  private getPythonServiceUrl(): string {
    // ML_SERVICE_URL = the Railway URL of the merged ml_service (assistant + spending)
    // Same env var as the assistant already uses; both routes live on the same service now
    return (
      this.configService.get<string>('ML_SERVICE_URL') ||
      this.configService.get<string>('SPENDING_ML_URL') ||
      process.env.ML_SERVICE_URL ||
      'http://localhost:8080'
    );
  }

  /**
   * Calls GET /spending-prediction on the unified Python ML service.
   * The Python service runs scikit-learn linear regression over 6-month
   * Google Sheets history (via n8n) and caches results in MongoDB for 24 h.
   */
  async getSpendingPrediction(): Promise<object> {
    const url = `${this.getPythonServiceUrl()}/spending-prediction`;
    this.logger.log(`Calling Python ML service: ${url}`);

    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Python ML service responded ${res.status}: ${text}`,
      );
    }

    return res.json() as Promise<object>;
  }
}
