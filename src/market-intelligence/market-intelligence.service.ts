import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import OpenAI from 'openai';
import { MarketIntelligenceDto } from './dto/market-intelligence.dto';

/** Normalized comparable (EUR) from Crunchbase or LLM fallback. */
export interface NormalizedComp {
  name: string;
  country: string;
  valuationEur: number;
  dateIso: string;
  stage: string;
}

/** LLM overlay per comp (insights / display helpers). */
interface LlmCompOverlay {
  name?: string;
  country?: string;
  ava_insight?: string;
  geography_note?: string;
  flag?: string;
  valuation_display?: string;
  date?: string;
}

interface LlmOverlay {
  overall_verdict_reason?: string;
  main_headline?: string;
  comps?: LlmCompOverlay[];
  summary?: {
    median_equity_display?: string;
    valuation_trend?: string;
    equity_trend?: string;
    ava_verdict?: string;
  };
}

/** Final API shape for Flutter. */
export interface MarketIntelCompResponse {
  name: string;
  country: string;
  flag: string;
  valuation: number;
  valuation_display: string;
  date: string;
  stage: string;
  position: 'above' | 'at' | 'below';
  position_label: string;
  diff_label: string;
  bar_ratio: number;
  your_bar_ratio: number;
  geography_note: string;
  ava_insight: string;
}

export interface MarketIntelResponse {
  overall_verdict: 'Fair' | 'Aggressive' | 'Conservative';
  overall_verdict_reason: string;
  main_headline: string;
  your_valuation: number;
  your_valuation_display: string;
  your_equity_display: string;
  sector_label: string;
  comps: MarketIntelCompResponse[];
  summary: {
    above_count: number;
    at_count: number;
    below_count: number;
    median_valuation_display: string;
    median_equity_display: string;
    deals_this_quarter: number;
    valuation_trend: string;
    equity_trend: string;
    ava_verdict: string;
  };
  fallback_used: boolean;
  data_as_of: string;
  comps_analysed: number;
}

const USD_PER_EUR = 1.08;

/** Optional defaults — prefer `MARKET_INTEL_SECTOR_CATEGORY_IDS` in .env (Crunchbase category UUIDs). */
const DEFAULT_SECTOR_CATEGORY_IDS: Record<string, string[]> = {};

@Injectable()
export class MarketIntelligenceService {
  private readonly logger = new Logger(MarketIntelligenceService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async analyse(dto: MarketIntelligenceDto): Promise<MarketIntelResponse> {
    const body = this.buildCrunchbaseBody(dto);
    let rawEntities: unknown[] = [];
    let totalCount = 0;
    const apiKey = this.config.get<string>('CRUNCHBASE_API_KEY')?.trim();

    if (apiKey) {
      try {
        const data = await this.postCrunchbase(body, apiKey);
        rawEntities = Array.isArray(data?.entities) ? data.entities : [];
        totalCount =
          typeof data?.count === 'number'
            ? data.count
            : typeof data?.total_count === 'number'
              ? data.total_count
              : rawEntities.length;
      } catch (e) {
        this.logger.warn(
          `Crunchbase request failed: ${e instanceof Error ? e.message : e}`,
        );
        rawEntities = [];
        totalCount = 0;
      }
    } else {
      this.logger.warn('CRUNCHBASE_API_KEY not set — using fallback mode.');
    }

    const comps = this.normalizeEntities(rawEntities).slice(0, 5);
    const fallbackUsed = comps.length < 3;

    const llmOverlay = await this.runLlm(dto, comps, fallbackUsed, totalCount);

    const enriched = this.buildResponse(
      dto,
      comps,
      llmOverlay,
      fallbackUsed,
      totalCount,
    );
    return enriched;
  }

  private buildCrunchbaseBody(
    dto: MarketIntelligenceDto,
  ): Record<string, unknown> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const dateStr = sixMonthsAgo.toISOString().slice(0, 10);

    const v = dto.valuation;
    const lowUsd = Math.max(1, Math.floor((v / USD_PER_EUR) * 0.5));
    const highUsd = Math.max(lowUsd + 1, Math.ceil((v / USD_PER_EUR) * 2));

    const query: Record<string, unknown>[] = [
      {
        type: 'predicate',
        field_id: 'investment_type',
        operator_id: 'eq',
        values: [this.stageToInvestmentType(dto.stage)],
      },
      {
        type: 'predicate',
        field_id: 'announced_on',
        operator_id: 'gte',
        values: [dateStr],
      },
      {
        type: 'predicate',
        field_id: 'money_raised',
        operator_id: 'between',
        values: [
          { value: lowUsd, currency: 'usd' },
          { value: highUsd, currency: 'usd' },
        ],
      },
    ];

    const sectorUuids = this.resolveSectorCategoryUuids(dto.sector);
    if (sectorUuids.length > 0) {
      query.push({
        type: 'predicate',
        field_id: 'funded_organization_categories',
        operator_id: 'includes',
        values: sectorUuids,
      });
    }

    const geoPred = this.geographyPredicate(dto.geography);
    if (geoPred) query.push(geoPred);

    return {
      field_ids: [
        'identifier',
        'announced_on',
        'money_raised',
        'investment_type',
        'funded_organization_identifier',
        'funded_organization_location_identifiers',
      ],
      query,
      order: [{ field_id: 'announced_on', sort: 'desc' }],
      limit: 10,
    };
  }

  private stageToInvestmentType(stage: string): string {
    const s = stage.trim().toLowerCase();
    if (s.includes('series a') || s === 'series a' || s === 'a')
      return 'series_a';
    if (s.includes('series b')) return 'series_b';
    if (s.includes('series c')) return 'series_c';
    if (s.includes('pre')) return 'pre_seed';
    if (s.includes('seed')) return 'seed';
    return 'seed';
  }

  private resolveSectorCategoryUuids(sector: string): string[] {
    const raw = this.config
      .get<string>('MARKET_INTEL_SECTOR_CATEGORY_IDS')
      ?.trim();
    if (raw) {
      try {
        const map = JSON.parse(raw) as Record<string, string[]>;
        const k = Object.keys(map).find(
          (x) => x.toLowerCase() === sector.trim().toLowerCase(),
        );
        if (k && Array.isArray(map[k])) return map[k].filter(Boolean);
      } catch {
        this.logger.warn('MARKET_INTEL_SECTOR_CATEGORY_IDS is not valid JSON');
      }
    }
    const def = DEFAULT_SECTOR_CATEGORY_IDS[sector.trim()];
    if (def) return def;
    const key = Object.keys(DEFAULT_SECTOR_CATEGORY_IDS).find(
      (x) => x.toLowerCase() === sector.trim().toLowerCase(),
    );
    return key ? (DEFAULT_SECTOR_CATEGORY_IDS[key] ?? []) : [];
  }

  private geographyPredicate(
    geography: string,
  ): Record<string, unknown> | null {
    const g = geography.trim().toLowerCase();
    if (!g || g === 'global') return null;

    const europe =
      this.config.get<string>('CRUNCHBASE_LOCATION_EUROPE_UUID')?.trim() ??
      '6106f5dc-823e-5da8-40d7-51612c0b2c4e';
    const usa =
      this.config.get<string>('CRUNCHBASE_LOCATION_USA_UUID')?.trim() ??
      'f110f375-9f91-32ed-ba36-3aa1a2dde319';
    const mena = this.config
      .get<string>('CRUNCHBASE_LOCATION_MENA_UUID')
      ?.trim();

    if (g === 'europe' || g === 'eu') {
      return {
        type: 'predicate',
        field_id: 'funded_organization_location_identifiers',
        operator_id: 'includes',
        values: [europe],
      };
    }
    if (g === 'usa' || g === 'united states' || g === 'us') {
      return {
        type: 'predicate',
        field_id: 'funded_organization_location_identifiers',
        operator_id: 'includes',
        values: [usa],
      };
    }
    if ((g === 'mena' || g === 'middle east') && mena) {
      return {
        type: 'predicate',
        field_id: 'funded_organization_location_identifiers',
        operator_id: 'includes',
        values: [mena],
      };
    }
    return null;
  }

  private async postCrunchbase(
    body: Record<string, unknown>,
    apiKey: string,
  ): Promise<Record<string, unknown>> {
    const url = 'https://api.crunchbase.com/api/v4/searches/funding_rounds';
    const res = await firstValueFrom(
      this.http.post<Record<string, unknown>>(url, body, {
        params: { user_key: apiKey },
        headers: {
          'Content-Type': 'application/json',
          'X-cb-user-key': apiKey,
        },
        timeout: 30000,
      }),
    );
    return res.data ?? {};
  }

  private normalizeEntities(entities: unknown[]): NormalizedComp[] {
    const out: NormalizedComp[] = [];
    for (const ent of entities) {
      if (!ent || typeof ent !== 'object') continue;
      const e = ent as Record<string, unknown>;
      const props = (e.properties ?? {}) as Record<string, unknown>;
      const name = this.pickOrgName(props);
      const money = this.pickMoney(props);
      const dateIso = this.pickDate(props);
      if (!name || money == null || !dateIso) continue;

      out.push({
        name,
        country: this.pickCountry(props),
        valuationEur: money.eur,
        dateIso,
        stage: this.pickInvestmentType(props),
      });
    }
    return out.sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1));
  }

  private pickOrgName(props: Record<string, unknown>): string {
    const fo = props['funded_organization_identifier'];
    if (fo && typeof fo === 'object' && fo !== null) {
      const v = (fo as Record<string, unknown>)['value'];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    const id = props['identifier'];
    if (id && typeof id === 'object' && id !== null) {
      const v = (id as Record<string, unknown>)['value'];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  private pickInvestmentType(props: Record<string, unknown>): string {
    const it = props['investment_type'];
    if (typeof it === 'string') return it;
    if (it && typeof it === 'object' && it !== null) {
      const v = (it as Record<string, unknown>)['value'];
      if (typeof v === 'string') return v;
    }
    return 'seed';
  }

  private pickMoney(props: Record<string, unknown>): { eur: number } | null {
    const mr = props['money_raised'];
    if (!mr || typeof mr !== 'object') return null;
    const o = mr as Record<string, unknown>;
    let usd: number | null = null;
    if (typeof o.value_usd === 'number') usd = o.value_usd;
    else if (typeof o.value === 'number') {
      const curRaw = o.currency;
      const cur = (typeof curRaw === 'string' ? curRaw : 'usd').toUpperCase();
      if (cur === 'EUR') return { eur: o.value };
      if (cur === 'USD') usd = o.value;
    }
    if (usd == null) return null;
    return { eur: usd / USD_PER_EUR };
  }

  private pickDate(props: Record<string, unknown>): string {
    const a = props['announced_on'];
    if (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a))
      return a.slice(0, 10);
    return '';
  }

  private pickCountry(props: Record<string, unknown>): string {
    const loc = props['funded_organization_location_identifiers'];
    if (Array.isArray(loc) && loc.length > 0) {
      const first = loc[0];
      if (typeof first === 'object' && first !== null) {
        const v = (first as Record<string, unknown>)['value'];
        if (typeof v === 'string') return v;
      }
    }
    return 'Unknown';
  }

  private async runLlm(
    dto: MarketIntelligenceDto,
    comps: NormalizedComp[],
    fallback: boolean,
    dealsCount: number,
  ): Promise<LlmOverlay> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    const model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    const lines = comps.map(
      (c, i) =>
        `${i + 1}. ${c.name} — ${c.country} — €${Math.round(c.valuationEur)} — ${c.dateIso}`,
    );

    const userBlock = `
The founder is proposing:
  Valuation: €${dto.valuation.toLocaleString('en-US')}
  Equity:    ${dto.equity}%
  Sector:    ${dto.sector}
  Stage:     ${dto.stage}
  Geography: ${dto.geography}
${dto.investorName ? `  Investor they meet: ${dto.investorName}` : ''}

${fallback ? 'Crunchbase returned insufficient structured rows — you must invent 5 plausible comparable companies with realistic EUR valuations for coaching only. Set synthetic=true in your JSON.' : `Here are ${comps.length} comparable deals (EUR-normalized) from the market:`}
${lines.join('\n')}

Total deals matched in search (if any): ${dealsCount}

Return ONLY valid JSON with this shape:
{
  "overall_verdict_reason": "one sentence",
  "main_headline": "short editorial headline",
  "comps": [
    {
      "name": "string",
      "country": "string",
      "flag": "emoji",
      "valuation_display": "€1.2M",
      "date": "Feb 2025",
      "ava_insight": "specific coaching for negotiation",
      "geography_note": "Region/market label only — e.g. European market, Western Europe — never imply a city when you only have continent or macro region"
    }
  ],
  "summary": {
    "median_equity_display": "${dto.equity}%",
    "valuation_trend": "↑ +8% vs Q4 or similar",
    "equity_trend": "→ Stable",
    "ava_verdict": "long paragraph with named comps and equity floor advice"
  },
  "synthetic": false
}

Rules:
- Provide exactly 5 comps in the same order as the list above${fallback ? ' (invent names if needed)' : ''}.
- Be specific and actionable; never generic.
- geography_note: describe market/region (e.g. European market, DACH, UK) when the source is macro geography; do not phrase continent-level data as if it were a specific city.
- If synthetic/fallback, state in ava_verdict that figures are benchmark estimates, not live Crunchbase rows.
`.trim();

    if (!apiKey) {
      return this.heuristicOverlay(dto, comps, fallback);
    }

    try {
      const openai = new OpenAI({ apiKey });
      const raw = await openai.chat.completions.create({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are AVA, an executive AI assistant specializing in venture capital deal analysis.
Produce structured coaching for a founder. Respond ONLY with JSON, no markdown.`,
          },
          { role: 'user', content: userBlock },
        ],
      });
      const text = raw.choices[0]?.message?.content?.trim() ?? '{}';
      return JSON.parse(this.extractJson(text)) as LlmOverlay;
    } catch (e) {
      this.logger.warn(
        `OpenAI market intel failed: ${e instanceof Error ? e.message : e}`,
      );
      return this.heuristicOverlay(dto, comps, fallback);
    }
  }

  private heuristicOverlay(
    dto: MarketIntelligenceDto,
    comps: NormalizedComp[],
    fallback: boolean,
  ): LlmOverlay {
    const pad = [...comps];
    while (pad.length < 5) {
      pad.push({
        name: `Comparable ${pad.length + 1}`,
        country: dto.geography,
        valuationEur: dto.valuation * (0.85 + pad.length * 0.03),
        dateIso: new Date().toISOString().slice(0, 10),
        stage: dto.stage,
      });
    }
    return {
      overall_verdict_reason: fallback
        ? 'Benchmark-based — live Crunchbase sample was thin for this filter.'
        : 'Based on recent closes versus your ask.',
      main_headline: 'Your round sits in a busy part of the market.',
      comps: pad.slice(0, 5).map((c) => ({
        name: c.name,
        country: c.country,
        flag: '🌍',
        valuation_display: this.formatEurDisplay(c.valuationEur),
        date: this.formatMonthYear(c.dateIso),
        ava_insight:
          'Use as context only — anchor your story on traction and milestones.',
        geography_note: dto.geography,
      })),
      summary: {
        median_equity_display: `${dto.equity}%`,
        valuation_trend: '→ Mixed',
        equity_trend: '→ Stable',
        ava_verdict: fallback
          ? 'Figures above are heuristic benchmarks — cite live data when you have it.'
          : 'Compare your ask to the strongest recent closes in your sector before the meeting.',
      },
    };
  }

  private extractJson(text: string): string {
    const fence = text.match(/```(?:json)?([\s\S]*?)```/i);
    if (fence) return fence[1].trim();
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a !== -1 && b > a) return text.slice(a, b + 1);
    return text;
  }

  private buildResponse(
    dto: MarketIntelligenceDto,
    comps: NormalizedComp[],
    llm: LlmOverlay,
    fallbackUsed: boolean,
    dealsThisQuarter: number,
  ): MarketIntelResponse {
    const userVal = dto.valuation;
    const overlayComps = Array.isArray(llm.comps) ? llm.comps : [];

    const five: NormalizedComp[] = [];
    if (fallbackUsed && overlayComps.length >= 5) {
      for (let i = 0; i < 5; i++) {
        const oc = overlayComps[i];
        if (!oc) {
          five.push({
            name: `Comparable ${i + 1}`,
            country: dto.geography,
            valuationEur: userVal,
            dateIso: new Date().toISOString().slice(0, 10),
            stage: dto.stage,
          });
          continue;
        }
        five.push({
          name: oc.name ?? `Comparable ${i + 1}`,
          country: oc.country?.trim() || dto.geography,
          valuationEur: this.parseValuationDisplay(
            oc.valuation_display ?? '',
            userVal,
          ),
          dateIso: new Date().toISOString().slice(0, 10),
          stage: dto.stage,
        });
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const cb = comps[i];
        const oc = overlayComps[i];
        if (cb) {
          five.push(cb);
        } else if (oc?.name) {
          five.push({
            name: oc.name,
            country: oc.country?.trim() || dto.geography,
            valuationEur: this.parseValuationDisplay(
              oc.valuation_display ?? '',
              userVal,
            ),
            dateIso: new Date().toISOString().slice(0, 10),
            stage: dto.stage,
          });
        } else {
          five.push({
            name: `Comparable ${i + 1}`,
            country: dto.geography,
            valuationEur: userVal * (0.88 + i * 0.02),
            dateIso: new Date().toISOString().slice(0, 10),
            stage: dto.stage,
          });
        }
      }
    }

    const valuations = five.map((c) => c.valuationEur);
    const median = this.computeMedian(valuations);
    const overall_verdict = this.computeVerdict(userVal, median);

    const maxVal = Math.max(userVal, ...valuations);

    const enriched: MarketIntelCompResponse[] = five.map((c, i) => {
      const diff = c.valuationEur - userVal;
      const pct = Math.abs(diff) / Math.max(userVal, 1);
      let position: 'above' | 'at' | 'below';
      if (diff > 0 && pct > 0.05) position = 'above';
      else if (diff < 0 && pct > 0.05) position = 'below';
      else position = 'at';

      const position_label =
        position === 'above'
          ? '↑ ABOVE YOU'
          : position === 'below'
            ? '↓ BELOW YOU'
            : '= AT MEDIAN';

      const oc = overlayComps[i] ?? {};
      const diff_label = this.formatDiffLabel(diff);

      return {
        name: c.name,
        country: c.country,
        flag: oc.flag ?? this.flagForCountry(c.country),
        valuation: Math.round(c.valuationEur),
        valuation_display:
          oc.valuation_display ?? this.formatEurDisplay(c.valuationEur),
        date: oc.date ?? this.formatMonthYear(c.dateIso),
        stage: this.titleCase(c.stage),
        position,
        position_label,
        diff_label,
        bar_ratio: maxVal > 0 ? c.valuationEur / maxVal : 0,
        your_bar_ratio: maxVal > 0 ? userVal / maxVal : 0,
        geography_note: oc.geography_note ?? c.country,
        ava_insight:
          oc.ava_insight ??
          'Compare this close to your ask and decide whether to cite it in the room.',
      };
    });

    const above_count = enriched.filter((x) => x.position === 'above').length;
    const at_count = enriched.filter((x) => x.position === 'at').length;
    const below_count = enriched.filter((x) => x.position === 'below').length;

    const reason =
      llm.overall_verdict_reason ??
      (overall_verdict === 'Fair'
        ? `Your €${this.formatEurDisplay(userVal)} sits near the median of recent closes.`
        : overall_verdict === 'Aggressive'
          ? 'Your ask is meaningfully above recent median closes.'
          : 'Your ask is below typical recent closes in this band.');

    const summary = llm.summary ?? {};

    return {
      overall_verdict,
      overall_verdict_reason: reason,
      main_headline:
        llm.main_headline ?? 'Market comps for your stage and sector',
      your_valuation: userVal,
      your_valuation_display: this.formatEurDisplayFull(userVal),
      your_equity_display: `${dto.equity}%`,
      sector_label: `${dto.sector} · ${dto.stage} · ${dto.geography}`,
      comps: enriched,
      summary: {
        above_count,
        at_count,
        below_count,
        median_valuation_display: this.formatEurDisplay(median),
        median_equity_display:
          summary.median_equity_display ?? `${dto.equity}%`,
        deals_this_quarter: Math.max(dealsThisQuarter, enriched.length),
        valuation_trend: summary.valuation_trend ?? '→ See recent closes',
        equity_trend: summary.equity_trend ?? '→ Stable',
        ava_verdict:
          summary.ava_verdict ??
          'Anchor on the strongest comps; keep equity discipline.',
      },
      fallback_used: fallbackUsed,
      data_as_of: this.dataAsOfLabel(),
      comps_analysed: enriched.length,
    };
  }

  private parseValuationDisplay(s: string, fallback: number): number {
    const t = s.replace(/[€\s,]/gi, '').toUpperCase();
    const m = t.match(/([\d.]+)\s*M/i);
    if (m) return Math.round(parseFloat(m[1]) * 1_000_000);
    const k = t.match(/([\d.]+)\s*K/i);
    if (k) return Math.round(parseFloat(k[1]) * 1_000);
    const n = parseFloat(t.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }

  private computeMedian(nums: number[]): number {
    if (nums.length === 0) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  private computeVerdict(
    userVal: number,
    median: number,
  ): 'Fair' | 'Aggressive' | 'Conservative' {
    if (median <= 0) return 'Fair';
    const pct = (userVal - median) / median;
    if (pct > 0.2) return 'Aggressive';
    if (pct < -0.15) return 'Conservative';
    return 'Fair';
  }

  private formatDiffLabel(diff: number): string {
    if (diff === 0) return 'Same as your ask';
    const abs = Math.abs(diff);
    const fmt = this.formatEurAbs(abs);
    if (diff > 0) return `+${fmt} above your ask`;
    return `${fmt} below your ask`;
  }

  private formatEurAbs(n: number): string {
    if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
    return `€${Math.round(n / 1000)}K`;
  }

  private formatEurDisplay(eur: number): string {
    if (eur >= 1_000_000) {
      const x = eur / 1_000_000;
      const t = x >= 10 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, '');
      return `€${t}M`;
    }
    return `€${Math.round(eur / 1000)}K`;
  }

  private formatEurDisplayFull(eur: number): string {
    return `€${eur.toLocaleString('en-US')}`;
  }

  private formatMonthYear(iso: string): string {
    const d = new Date(iso + 'T12:00:00Z');
    if (Number.isNaN(d.getTime())) return iso;
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  private dataAsOfLabel(): string {
    const d = new Date();
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  private titleCase(s: string): string {
    if (!s) return '';
    return s
      .split(/[\s_]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private flagForCountry(country: string): string {
    const c = country.toLowerCase();
    const map: Record<string, string> = {
      france: '🇫🇷',
      germany: '🇩🇪',
      italy: '🇮🇹',
      spain: '🇪🇸',
      portugal: '🇵🇹',
      'united states': '🇺🇸',
      usa: '🇺🇸',
      uk: '🇬🇧',
      'united kingdom': '🇬🇧',
      netherlands: '🇳🇱',
      sweden: '🇸🇪',
    };
    return map[c] ?? '🌍';
  }
}
