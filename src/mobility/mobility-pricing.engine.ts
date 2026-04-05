import { Injectable } from '@nestjs/common';

type QuoteOptionInput = {
  provider: string;
  minPrice: number;
  maxPrice: number;
  etaMinutes: number;
  confidence: number;
  reasons?: string[];
};

type Preferences = {
  cheapestFirst?: boolean;
  maxEtaMinutes?: number;
};

@Injectable()
export class MobilityPricingEngine {
  rank(options: QuoteOptionInput[], preferences?: Preferences) {
    const filtered = this.applyFilters(options, preferences);
    if (filtered.length === 0) {
      return { best: null, options: [] };
    }

    const averages = filtered.map((o) => (o.minPrice + o.maxPrice) / 2);
    const etas = filtered.map((o) => o.etaMinutes);
    const minAvg = Math.min(...averages);
    const maxAvg = Math.max(...averages);
    const minEta = Math.min(...etas);
    const maxEta = Math.max(...etas);

    const scored = filtered.map((option) => {
      const avgPrice = (option.minPrice + option.maxPrice) / 2;
      const priceScore = this.reverseNormalize(avgPrice, minAvg, maxAvg);
      const etaScore = this.reverseNormalize(option.etaMinutes, minEta, maxEta);
      const confidenceScore = Math.max(0, Math.min(1, option.confidence));
      const globalScore =
        0.55 * priceScore + 0.25 * etaScore + 0.2 * confidenceScore;
      return {
        ...option,
        reasons: option.reasons ?? [],
        globalScore: Number(globalScore.toFixed(4)),
      };
    });

    scored.sort((a, b) => {
      if (preferences?.cheapestFirst) {
        const avgA = (a.minPrice + a.maxPrice) / 2;
        const avgB = (b.minPrice + b.maxPrice) / 2;
        if (avgA !== avgB) return avgA - avgB;
      }
      return b.globalScore - a.globalScore;
    });

    return { best: scored[0], options: scored };
  }

  private applyFilters(options: QuoteOptionInput[], preferences?: Preferences) {
    if (!preferences?.maxEtaMinutes) {
      return options;
    }
    return options.filter(
      (option) => option.etaMinutes <= preferences.maxEtaMinutes!,
    );
  }

  private reverseNormalize(value: number, min: number, max: number) {
    if (min === max) {
      return 1;
    }
    const normalized = (value - min) / (max - min);
    return 1 - normalized;
  }
}
