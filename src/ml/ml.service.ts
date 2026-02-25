import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SpendingPrediction,
  SpendingPredictionDocument,
} from './schemas/spending-prediction.schema';

const N8N_ML_WEBHOOK =
  'https://n8n-production-1e13.up.railway.app/webhook/ml-predict';

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(
    @InjectModel(SpendingPrediction.name)
    private readonly predictionModel: Model<SpendingPredictionDocument>,
  ) {}

  // ─── Public entry point ───────────────────────────────────────────────────

  async getSpendingPrediction(): Promise<object> {
    // 1. Return cached prediction if still fresh (< 24h, handled by MongoDB TTL)
    const cached = await this.predictionModel
      .findOne()
      .sort({ generatedAt: -1 })
      .lean()
      .exec();

    if (cached) {
      this.logger.log('Returning cached ML prediction');
      return cached;
    }

    // 2. Fetch history from n8n, compute, persist, return
    return this.refreshPrediction();
  }

  // ─── Fetch from n8n ───────────────────────────────────────────────────────

  private async fetchHistoryFromN8n(): Promise<
    { month: string; category: string; total: number }[]
  > {
    this.logger.log(`Fetching spending history from n8n: ${N8N_ML_WEBHOOK}`);

    const res = await fetch(N8N_ML_WEBHOOK);
    if (!res.ok) {
      throw new Error(
        `n8n ml-predict webhook failed: ${res.status} ${res.statusText}`,
      );
    }

    const raw = await res.json();

    // n8n may return the array directly or wrapped in a key
    const rows: { month: string; category: string; total: number | string }[] =
      Array.isArray(raw) ? raw : (raw.history ?? raw.data ?? []);

    return rows.map((r) => ({
      month: r.month,
      category: r.category,
      total: typeof r.total === 'string' ? parseFloat(r.total) : r.total,
    }));
  }

  // ─── Linear Regression ────────────────────────────────────────────────────
  //
  //  We treat each month as an X index (0, 1, 2 … n-1) and the spending
  //  amount as Y.  We fit  y = a + b*x  with ordinary least squares, then
  //  predict at x = n (next month).
  //
  //  OLS formulas:
  //    b = Σ[(xi - x̄)(yi - ȳ)] / Σ[(xi - x̄)²]
  //    a = ȳ - b * x̄
  //    ŷ(n) = a + b * n

  private linearRegressionPredict(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;
    if (n === 1) return values[0]; // not enough points — return same value

    const xArr = values.map((_, i) => i);
    const xMean = xArr.reduce((s, v) => s + v, 0) / n;
    const yMean = values.reduce((s, v) => s + v, 0) / n;

    const ssxy = xArr.reduce((s, xi, i) => s + (xi - xMean) * (values[i] - yMean), 0);
    const ssxx = xArr.reduce((s, xi) => s + Math.pow(xi - xMean, 2), 0);

    const b = ssxx === 0 ? 0 : ssxy / ssxx;
    const a = yMean - b * xMean;

    const predicted = a + b * n; // next point at index n
    return Math.max(0, parseFloat(predicted.toFixed(2)));
  }

  // ─── Next-month label helpers ─────────────────────────────────────────────

  private nextMonthKey(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private monthKeyToLabel(key: string): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const [year, month] = key.split('-');
    return `${months[parseInt(month, 10) - 1]} ${year}`;
  }

  // ─── Main computation ─────────────────────────────────────────────────────

  private async refreshPrediction(): Promise<object> {
    const history = await this.fetchHistoryFromN8n();

    // Group history by category → array of monthly totals in chronological order
    const byCategory: Record<string, { month: string; total: number }[]> = {};
    for (const row of history) {
      if (!byCategory[row.category]) byCategory[row.category] = [];
      byCategory[row.category].push({ month: row.month, total: row.total });
    }

    const predictions = Object.entries(byCategory).map(([category, rows]) => {
      // Sort chronologically
      rows.sort((a, b) => a.month.localeCompare(b.month));
      const values = rows.map((r) => r.total);

      const predicted = this.linearRegressionPredict(values);

      // Budget = average of last 3 months × 1.05 (5 % tolerance)
      const recent = values.slice(-3);
      const avgRecent = recent.reduce((s, v) => s + v, 0) / recent.length;
      const budget = parseFloat((avgRecent * 1.05).toFixed(2));

      const last = values[values.length - 1];
      const trend: 'up' | 'down' | 'stable' =
        predicted > last * 1.02 ? 'up'
        : predicted < last * 0.98 ? 'down'
        : 'stable';

      return {
        category,
        predicted,
        budget,
        overBudget: predicted > budget,
        trend,
        history: values,
      };
    });

    const overBudgetCount = predictions.filter((p) => p.overBudget).length;
    const nextMonth = this.nextMonthKey();
    const nextMonthLabel = this.monthKeyToLabel(nextMonth);
    const generatedAt = new Date();

    // Persist (old ones expire automatically via TTL index)
    const doc = new this.predictionModel({
      nextMonth,
      nextMonthLabel,
      predictions,
      overBudgetCount,
      generatedAt,
    });
    await doc.save();

    this.logger.log(
      `ML prediction computed: ${predictions.length} categories, ${overBudgetCount} over budget`,
    );

    return {
      nextMonth,
      nextMonthLabel,
      predictions,
      overBudgetCount,
      generatedAt,
    };
  }
}
