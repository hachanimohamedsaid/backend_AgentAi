import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

type EstimateInput = {
  from: string;
  to: string;
  pickupAt: Date;
  fromCoordinates?: { latitude: number; longitude: number };
  toCoordinates?: { latitude: number; longitude: number };
};

type QuoteOption = {
  provider: string;
  minPrice: number;
  maxPrice: number;
  etaMinutes: number;
  confidence: number;
  reasons: string[];
};

@Injectable()
export class MobilityQuotesService {
  private readonly logger = new Logger(MobilityQuotesService.name);

  constructor(private readonly configService: ConfigService) {}

  async estimate(input: EstimateInput): Promise<QuoteOption[]> {
    const endpoint = this.configService.get<string>('UBER_QUOTES_API_URL');
    if (!endpoint) {
      throw new ServiceUnavailableException({
        code: 'PROVIDER_UNAVAILABLE',
        message: 'UBER_QUOTES_API_URL is not configured',
        details: { provider: 'uber' },
      });
    }

    const token = this.configService.get<string>('UBER_SERVER_TOKEN');

    try {
      const response = await axios.post(
        endpoint,
        {
          from: input.from,
          to: input.to,
          pickupAt: input.pickupAt.toISOString(),
          fromCoordinates: input.fromCoordinates,
          toCoordinates: input.toCoordinates,
        },
        {
          timeout: 8000,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          },
        },
      );

      const rawOptions = this.extractRawOptions(response.data);
      const normalized = rawOptions
        .map((option) => this.normalizeOption(option))
        .filter((option): option is QuoteOption => option !== null)
        .filter((option) => option.provider === 'uberx' || option.provider === 'uberxl');

      if (normalized.length === 0) {
        throw new ServiceUnavailableException({
          code: 'PROVIDER_UNAVAILABLE',
          message: 'No Uber products available from live quote provider',
          details: { provider: 'uber' },
        });
      }

      return normalized;
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error(
        `Uber live quote failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({
        code: 'PROVIDER_UNAVAILABLE',
        message: 'No provider reachable',
        details: { provider: 'uber' },
      });
    }
  }

  private extractRawOptions(payload: any): any[] {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.options)) {
      return payload.options;
    }
    return [];
  }

  private normalizeOption(option: any): QuoteOption | null {
    const provider = String(option?.provider ?? '').toLowerCase();
    const minPrice = Number(option?.minPrice);
    const maxPrice = Number(option?.maxPrice);
    const etaMinutes = Number(option?.etaMinutes);
    const confidence = Number(option?.confidence ?? 0.85);

    if (!provider || !Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
      return null;
    }
    if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) {
      return null;
    }

    const reasons = Array.isArray(option?.reasons)
      ? option.reasons.map((reason: unknown) => String(reason))
      : [];

    if (!reasons.includes('live uber quote')) {
      reasons.unshift('live uber quote');
    }
    if (provider === 'uberx' && !reasons.includes('best price among enabled uber products')) {
      reasons.push('best price among enabled uber products');
    }

    return {
      provider,
      minPrice: Number(minPrice.toFixed(2)),
      maxPrice: Number(maxPrice.toFixed(2)),
      etaMinutes,
      confidence: Number(Math.max(0, Math.min(1, confidence)).toFixed(2)),
      reasons,
    };
  }
}
