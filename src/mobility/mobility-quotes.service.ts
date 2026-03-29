import { Injectable } from '@nestjs/common';

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
  constructor() {}

  async estimate(input: EstimateInput): Promise<QuoteOption[]> {
    const providers = ['uberx', 'uberxl'];
    const seed = this.hash(`${input.from}|${input.to}|${input.pickupAt.toISOString()}`);
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      }).format(input.pickupAt),
    );

    const peakFactor = hour >= 7 && hour <= 9 ? 1.2 : 1.0;

    return providers.map((provider, idx) => {
      const providerSeed = (seed + idx * 97) % 997;
      const isUberXL = provider === 'uberxl';
      const base = (isUberXL ? 18 : 12) + (providerSeed % 7);
      const variance = (isUberXL ? 5 : 3) + (providerSeed % 3);
      const minPrice = Number((base * peakFactor).toFixed(1));
      const maxPrice = Number((minPrice + variance).toFixed(1));
      const etaMinutes = (isUberXL ? 5 : 4) + (providerSeed % 6);
      const confidenceBase = isUberXL ? 0.8 : 0.84;
      const confidence = Number((confidenceBase + ((providerSeed % 12) / 100)).toFixed(2));

      return {
        provider,
        minPrice,
        maxPrice,
        etaMinutes,
        confidence,
        reasons: this.buildReasons(provider, peakFactor, confidence),
      };
    });
  }

  private buildReasons(provider: string, peakFactor: number, confidence: number): string[] {
    const reasons = [
      peakFactor > 1 ? 'peak-hour demand detected' : 'stable traffic conditions',
      confidence > 0.9
        ? 'high provider reliability for this route window'
        : 'moderate provider reliability for this route window',
      'uber estimate generated from route/time context',
    ];
    if (provider === 'uberx') {
      reasons.push('best price among enabled uber products');
    }
    if (provider === 'uberxl') {
      reasons.push('larger vehicle option with higher fare band');
    }
    return reasons;
  }

  private hash(value: string): number {
    let h = 0;
    for (let i = 0; i < value.length; i++) {
      h = (h << 5) - h + value.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }
}
