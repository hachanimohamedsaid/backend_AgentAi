import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(private readonly configService: ConfigService) {}

  private getPythonServiceUrl(): string {
    // Set SPENDING_ML_URL in Railway env vars once the Python service is deployed
    return (
      this.configService.get<string>('SPENDING_ML_URL') ||
      process.env.SPENDING_ML_URL ||
      'http://localhost:8081'
    );
  }

  /**
   * Delegates to the Python FastAPI spending ML service.
   * The Python service runs linear regression (scikit-learn) over 6-month
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
