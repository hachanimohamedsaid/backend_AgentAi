import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { MeetingDocument } from './schemas/meeting.schema';
import {
  GooglePlacesService,
  type PlaceSearchResult,
} from './google-places.service';

/** Extract JSON from OpenAI response (handles markdown code blocks). */
function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const match =
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    trimmed.match(/\{[\s\S]*\}/);
  const raw = match ? (match[1] ?? match[0]) : trimmed;
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Format meetingAt ISO string to human-readable e.g. "Thursday, March 6th at 6:00 PM". */
function formatMeetingAt(meetingAt: string): string {
  try {
    const d = new Date(meetingAt);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    return d.toLocaleDateString('en-US', options);
  } catch {
    return meetingAt;
  }
}

@Injectable()
export class MeetingAgentsService {
  private getOpenAI(): OpenAI | null {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    return apiKey ? new OpenAI({ apiKey }) : null;
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly googlePlaces: GooglePlacesService,
  ) {}

  /**
   * One lightweight OpenAI call: AVA summarizes the meeting context in 2 sentences.
   */
  async generateConfirmationText(meeting: MeetingDocument): Promise<string> {
    const openai = this.getOpenAI();
    if (!openai) {
      return `Meeting with ${meeting.investorName}${meeting.investorCompany ? ` from ${meeting.investorCompany}` : ''} in ${meeting.city}, ${meeting.country}. ${meeting.meetingAt}.`;
    }

    const dateStr = formatMeetingAt(meeting.meetingAt);
    const userContent = `
Investor: ${meeting.investorName}${meeting.investorCompany ? ` from ${meeting.investorCompany}` : ''}
Location: ${meeting.city}, ${meeting.country}
Date and time: ${dateStr}
Deal type: ${meeting.dealType ?? 'Not specified'}
Sector: ${meeting.sector ?? 'Not specified'}
Investment asked: ${meeting.investmentAsked != null ? meeting.investmentAsked : 'Not specified'}
Equity offered: ${meeting.equity != null ? meeting.equity + '%' : 'Not specified'}
Meeting format: ${meeting.meetingType ?? 'Not specified'}
`.trim();

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are AVA, a professional meeting preparation assistant. Summarize the following meeting context in exactly 2 short sentences, in a natural friendly tone. Mention investor name and company, location, date, deal (investment target and equity), and meeting format. Write in the same language as the input (e.g. if the location is in Italy, you may mention "Milan" and keep it professional). Do not add bullet points or labels — only 2 sentences.`,
        },
        { role: 'user', content: userContent },
      ],
      max_tokens: 150,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    return (
      text ??
      `Meeting with ${meeting.investorName} in ${meeting.city} on ${dateStr}.`
    );
  }

  /**
   * Cultural agent: behavioral coaching for this cultural context. Receives country, deal type, and
   * meeting format; returns six structured outputs so the user knows how to open, behave, what to
   * say first, what to never say, and the sequence to move through the meeting. Result is cached
   * and loaded instantly when the user opens the Culture tab.
   */
  async runCultural(
    meeting: MeetingDocument,
  ): Promise<Record<string, unknown>> {
    const openai = this.getOpenAI();
    if (!openai) {
      return {
        dos: [
          'Build rapport before pitching.',
          'Show respect for local customs.',
          'Be punctual and prepared.',
        ],
        donts: [
          'Do not rush to the pitch.',
          'Avoid aggressive negotiation.',
          'Do not ignore relationship building.',
        ],
        communication_style: 'Focus on relationship and context.',
        negotiation_approach: 'Collaborative and respectful.',
        opening_line: `I've been looking forward to meeting you and learning more about your approach to ${meeting.sector ?? 'this sector'}.`,
        meeting_flow: [
          'Warm-up and rapport',
          'Context and background',
          'Pitch and discussion',
          'Close and next steps',
        ],
      };
    }

    const userContent = `
Country: ${meeting.country}
City: ${meeting.city}
Deal type: ${meeting.dealType ?? 'Not specified'}
Meeting format: ${meeting.meetingType ?? 'Not specified'}
Sector: ${meeting.sector ?? 'Not specified'}
`.trim();

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an elite cultural intelligence analyst. Your entire task is to answer one question: given this specific country, this specific deal type, and this specific meeting format, what does this entrepreneur need to know before walking into that room?

Draw on what you know about that country's business culture — communication norms, negotiation styles, relationship dynamics, social rituals. Do not produce a generic country guide. Filter everything through the meeting context: a formal dinner in Italy with a seed investor requires different advice than a casual lunch in Italy with a strategic partner. Same country, different format — different advice.

Respond with ONLY a valid JSON object (no markdown, no explanation) with these exact keys:
- dos: array of exactly 3 strings (specific positive behaviors for this context)
- donts: array of exactly 3 strings (specific mistakes to avoid)
- communication_style: one paragraph — how communication works in this context
- negotiation_approach: one paragraph — how negotiation works
- opening_line: one sentence — exactly what sentence to open with
- meeting_flow: array of exactly 4 ordered step strings (the sequence to move through the meeting, e.g. warm-up, context, pitch, close)`,
        },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const raw = completion.choices[0]?.message?.content;
    return raw ? extractJson(raw) : {};
  }

  /**
   * Psych agent: behavioral profile from whatever the user knows about the investor — bio, public
   * statements, uploaded documents, posts. Result is cached and loaded instantly when the user
   * opens the Profile tab. Quality scales with input; confidence_level communicates this to the user.
   */
  async runPsych(meeting: MeetingDocument): Promise<Record<string, unknown>> {
    const openai = this.getOpenAI();
    const attachmentTexts = (meeting as any).attachmentTexts;
    const additionalDocs =
      attachmentTexts && String(attachmentTexts).trim()
        ? attachmentTexts
        : 'none';

    const userContent = [
      `Investor Name: ${meeting.investorName}`,
      `Company: ${meeting.investorCompany ?? 'Not provided'}`,
      `Bio: ${meeting.investorBio ?? 'Not provided'}`,
      `Public posts / quotes: ${meeting.investorPosts ?? 'Not provided'}`,
      `Additional documents: ${additionalDocs}`,
      `Sector: ${meeting.sector ?? 'Not specified'}`,
      `Deal type: ${meeting.dealType ?? 'Not specified'}`,
    ].join('\n');

    if (!openai) {
      return {
        personality_type: 'Analytical Pragmatist',
        dominant_traits: [
          'Analytical',
          'Risk-Conscious',
          'Data-First',
          'Detail-Oriented',
        ],
        communication_preference:
          'Prefer data-backed arguments and clear metrics. Lead with numbers, follow with story.',
        decision_style:
          'Deliberate; rarely commits in a first meeting. Expect requests for follow-up materials.',
        likely_objections: [
          'Your valuation seems high for pre-revenue stage',
          'Show me comparable exits in this space',
          'What is your 18-month burn rate and runway?',
        ],
        questions_to_ask: [
          'How do you see traction milestones aligning with your current portfolio strategy?',
          'What has been the most successful go-to-market approach in your investments?',
        ],
        how_to_approach:
          'Lead with a structured, number-backed narrative. Have evidence ready for each assertion. Do not oversell vision before establishing credibility with data. Avoid ultimatums or pressure tactics.',
        confidence_level: 'medium',
      };
    }

    const systemContent = `You are a behavioral psychologist who specializes in investor profiling for high-stakes negotiations. You have studied hundreds of VC and angel investor profiles.

Your task: Read the investor's text and look for patterns — not what they say but how they say it.
- Word choice reveals analytical or intuitive thinking (technical language = analytical; storytelling = vision-oriented; financial terms dominant = numbers-first).
- Topic focus reveals what they actually care about (team = people-driven; market size = macro thinker; exits = return-focused).
- Tone reveals risk appetite (formal and precise = risk-conscious; enthusiastic and broad = relationship builder; challenging = demanding validator).
- The way they write about their portfolio companies reveals whether they are relationship-driven or return-driven.

From those patterns, construct a behavioral profile: who this person is, how they make decisions, what drives them, what threatens them, and — critically — what they will probably say in the meeting before the entrepreneur even walks in. The three likely_objections are not guesses; they are predictions based on the investor's observed personality and the typical behavior of that personality type in ${meeting.dealType ?? 'seed'} negotiations.

The quality of your profile scales with the quality of input. A full LinkedIn profile (or rich documents) produces a precise, specific profile — set confidence_level to "high". A two-sentence bio produces a general profile based on sector and deal type norms — set confidence_level to "low". Use "medium" when input is moderate. The confidence_level is shown to the user so they know how much to rely on the profile.

Respond only in valid JSON with these exact keys (no markdown):
- personality_type: string — one composite classification (e.g. "Analytical Pragmatist", "Relationship-Driven Visionary", "Data-First Skeptic", "Strategic Long-Term Builder", "Aggressive Return-Seeker")
- dominant_traits: array of exactly 4 strings (e.g. ["Analytical", "Risk-Conscious", "Data-First", "Detail-Oriented"])
- communication_preference: one paragraph — how they prefer to receive information
- decision_style: one paragraph — how they make decisions (one of the most valuable outputs)
- likely_objections: array of exactly 3 strings — the three hardest questions this investor will likely ask (predictions from the profile, not generic lists)
- questions_to_ask: array of exactly 2 strings — questions the entrepreneur should ask the investor (signal intelligence, show research)
- how_to_approach: one paragraph — direct coaching on exactly how to handle this specific person in the meeting (the paragraph to read twice before walking in)
- confidence_level: string — one of "high" | "medium" | "low" (high = rich input, specific profile; low = limited input, profile based on sector/deal norms; communicates transparency to the user)`;

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 900,
    });

    const raw = completion.choices[0]?.message?.content;
    const result = raw ? extractJson(raw) : {};
    if (
      !result.confidence_level ||
      !['high', 'medium', 'low'].includes(result.confidence_level as string)
    ) {
      result.confidence_level = 'medium';
    }
    return result;
  }

  /**
   * Offer agent: financial clarity before the negotiation. Receives deal terms (valuation, equity,
   * investment asked, revenue, team size, sector, stage). Result is cached and loaded instantly
   * when the user opens the Offer tab. Compares terms to market norms for this sector and stage;
   * produces fair score, verdict, safe range, walk-away line, and tactical advice so the user
   * walks in financially prepared and strategically positioned.
   */
  async runOffer(meeting: MeetingDocument): Promise<Record<string, unknown>> {
    const openai = this.getOpenAI();
    if (!openai) {
      return {
        fair_score: 65,
        fair_equity_range: '12-18%',
        valuation_verdict: 'fair',
        walk_away_limit: '20% max',
        recommended_counter: '14-16%',
        market_comparison: 'Based on typical seed benchmarks for the sector.',
        strategic_advice:
          'Anchor on data and comparables; be ready to justify valuation.',
      };
    }

    const userContent = `
Valuation: ${meeting.valuation ?? 'Not specified'}
Equity offered: ${meeting.equity ?? 'Not specified'}%
Investment asked: ${meeting.investmentAsked ?? 'Not specified'}
Sector: ${meeting.sector ?? 'Not specified'}
Stage / deal type: ${meeting.dealType ?? 'Not specified'}
Revenue: ${meeting.revenue ?? 'Not specified'}
Team size: ${meeting.teamSize ?? 'Not specified'}
`.trim();

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a senior VC advisor with 20 years of deal experience who has seen hundreds of rounds in this sector. Compare the proposed terms against market norms for this specific combination of sector and stage — FinTech seed rounds have different benchmarks than HealthTech Series A. The sector field is critical; it grounds your analysis in the right market context.

Be honest. If the valuation is aggressive, say so. Do not soften feedback to please the user.

Produce:
- fair_score: a single number 0-100 representing how well-calibrated the deal is relative to market norms
- valuation_verdict: whether the valuation is "fair", "aggressive", or "conservative"
- fair_equity_range: the safe negotiating range — how much room exists before pushing equity too high signals desperation or too low signals undervaluation (e.g. "12-18%")
- walk_away_limit: the point beyond which the deal damages the company — the absolute line the entrepreneur must not cross
- recommended_counter: the recommended negotiation range to use when discussing numbers
- market_comparison: one paragraph comparing this deal to market norms for this sector and stage
- strategic_advice: one paragraph of specific tactical advice on how to handle the conversation around numbers — what to say when the investor pushes back on valuation, how to defend the number, how to stay strategically positioned

Respond with ONLY a valid JSON object (no markdown) with these exact keys: fair_score, fair_equity_range, valuation_verdict, walk_away_limit, recommended_counter, market_comparison, strategic_advice.`,
        },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
    });

    const raw = completion.choices[0]?.message?.content;
    return raw ? extractJson(raw) : {};
  }

  /**
   * Image agent: exact instructions for physical and verbal presentation. Receives country,
   * meeting format, and investor personality (from psych). Result is cached and loaded instantly
   * when the user opens the Image tab. Combination of the three inputs produces advice no generic
   * dress guide could — what to wear, what not to wear, how to carry themselves, how to control
   * communication. They walk in looking and sounding right for this investor, culture, and context.
   */
  async runImage(meeting: MeetingDocument): Promise<Record<string, unknown>> {
    const openai = this.getOpenAI();
    const psych = meeting.psychResult;
    const personalityType =
      (psych?.personality_type as string) ?? 'Not yet profiled';
    const dominantTraits = Array.isArray(psych?.dominant_traits)
      ? (psych.dominant_traits as string[]).join(', ')
      : 'Not specified';

    if (!openai) {
      return {
        dress_items: [
          { text: 'Dark navy or charcoal suit; polished shoes.', type: 'do' },
          {
            text: 'Subtle accessories only — quality over quantity.',
            type: 'caution',
          },
          { text: 'Loud patterns or casual shoes.', type: 'avoid' },
        ],
        body_language: [
          { text: 'Firm handshake, maintain eye contact.', type: 'do' },
          { text: 'Crossing arms during objections.', type: 'avoid' },
        ],
        speaking_advice: 'Speak at a measured pace; pause after key numbers.',
        key_tip: 'Present yourself with confidence and cultural awareness.',
      };
    }

    const meetingType = meeting.meetingType ?? 'Not specified';
    const isVideoCall = String(meetingType).toLowerCase().includes('video');

    const systemPrompt = `You are an executive image consultant and communication coach who understands both cultural presentation norms and behavioral psychology. You advise entrepreneurs before high-stakes investor meetings.

Your advice is driven by three inputs; the combination produces advice specific to this exact meeting in a way no generic dress guide ever could:
1. Country — cultural baseline (e.g. Italians notice tailoring; Japanese investors read conservatism as respect; American VCs read overdressing as not understanding the culture).
2. Meeting format — shifts everything (formal dinner has different requirements than a video call).
3. Investor personality — psychological layer (an analytical skeptic responds to precision and restraint; a relationship-driven investor responds to warmth and approachability).

Never say "dress professionally." Be specific and actionable: e.g. dark navy suit not black, clean Oxford shoes, one understated accessory maximum; speak at 70% of natural pace; pause two seconds after stating your key number. Everything exact, everything actionable, everything calibrated to this investor in this culture in this context.

Respond only in valid JSON (no markdown) with these exact keys:
- dress_items: array of objects, each with { "text": string, "type": "do" | "caution" | "avoid" }
- body_language: array of objects, each with { "text": string, "type": "do" | "caution" | "avoid" }
- speaking_advice: one paragraph (pace, tone, emphasis — e.g. 70% pace, pause after key number — specific to this investor)
- key_tip: one sentence — the single most important thing to remember when getting dressed the morning of the meeting`;

    const userContent = `
Country: ${meeting.country}
City: ${meeting.city}
Meeting type: ${meetingType}
Investor personality: ${personalityType}
Dominant traits: ${dominantTraits}
Sector: ${meeting.sector ?? 'Not specified'}
Deal type: ${meeting.dealType ?? 'Not specified'}

${isVideoCall ? `This is a video call. Focus advice on: what is visible on camera (upper body only), colors that read well on screen, lighting setup, background environment, audio quality, and eye contact with the camera (not the screen).` : ''}

Generate executive image and presentation coaching specific to this exact meeting and investor.
`.trim();

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 700,
    });

    const raw = completion.choices[0]?.message?.content;
    return raw ? extractJson(raw) : {};
  }

  /**
   * Location agent: LLM and Google Places work together so recommendations are both intelligent and real.
   * The agent does not name venues; it defines what to look for (venue profile). Backend then calls
   * Google Places for real, currently operating venues (real addresses, ratings, hours, website).
   * LLM receives those results and writes the reasoning. LLM = intelligence, Google = reality; neither alone is sufficient.
   * If Google is unavailable, LLM suggests venue types with a clear disclaimer (suggestions to research, not confirmed).
   * Response includes website links so the user can tap and make a reservation from the app. Video Call = no venues.
   */
  async runLocation(
    meeting: MeetingDocument,
  ): Promise<Record<string, unknown>> {
    const openai = this.getOpenAI();
    const psych = meeting.psychResult;
    const personalityType =
      (psych?.personality_type as string) ?? 'Not yet profiled';
    const meetingType = meeting.meetingType ?? 'Not specified';
    const isVideoCall = String(meetingType).toLowerCase().includes('video');

    // Video Call: no venue cards, LLM gives setup advice only.
    if (isVideoCall) {
      const fallback = await this.runLocationVideoCallOnly(
        meeting,
        openai,
        personalityType,
      );
      return { ...fallback, is_video_call: true, fallback_used: false };
    }

    // No OpenAI: return static fallback.
    if (!openai) {
      return this.getLocationFallbackStatic();
    }

    // No Google Places key: skip real venues, use LLM-only fallback.
    if (!this.googlePlaces.isAvailable()) {
      return this.runLocationFallbackLLMOnly(meeting, openai, personalityType);
    }

    // Step 1: LLM returns venue search profile (no venue names).
    const profile = await this.runLocationStep1VenueProfile(
      meeting,
      openai,
      personalityType,
    );
    if (!profile?.google_search_query) {
      return this.runLocationFallbackLLMOnly(meeting, openai, personalityType);
    }

    // Geocode city for Places API.
    const coords = await this.googlePlaces.geocode(
      meeting.city,
      meeting.country,
    );
    if (!coords) {
      return this.runLocationFallbackLLMOnly(meeting, openai, personalityType);
    }

    // Step 2: Google Places Text Search — real venues.
    const places = await this.googlePlaces.textSearch(
      profile.google_search_query as string,
      coords.lat,
      coords.lng,
      { radiusMeters: 3000 },
    );
    const top3 = places.slice(0, 3);
    if (top3.length === 0) {
      return this.runLocationFallbackLLMOnly(meeting, openai, personalityType);
    }

    // Enrich top 2 with website via Place Details.
    const enriched = await this.enrichPlacesWithDetails(top3);

    // Step 3: LLM writes reasoning for each real venue in AVA's voice.
    const reasoning = await this.runLocationStep3Reasoning(
      meeting,
      openai,
      personalityType,
      enriched,
    );
    if (!reasoning) {
      return this.buildLocationResultFromPlaces(enriched, profile, true);
    }

    return this.buildLocationResultFromPlaces(
      enriched,
      profile,
      false,
      reasoning,
    );
  }

  private async runLocationVideoCallOnly(
    meeting: MeetingDocument,
    openai: OpenAI | null,
    personalityType: string,
  ): Promise<Record<string, unknown>> {
    if (!openai) {
      return {
        primary: null,
        secondary: null,
        avoid_description:
          'For video calls, ensure a quiet space, neutral background, and good lighting. Verify your connection and camera before the meeting.',
        venue_type: 'video_call',
      };
    }
    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are AVA, an executive meeting advisor. This meeting is a video call — no physical venue. Give one short paragraph of technical and environment advice: quiet space, background, lighting, camera angle, and what to avoid. Respond with ONLY a valid JSON object (no markdown) with key: avoid_description (one paragraph string).`,
        },
        {
          role: 'user',
          content: `Country: ${meeting.country}. City: ${meeting.city}. Investor personality: ${personalityType}. Meeting type: Video Call.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    });
    const raw = completion.choices[0]?.message?.content;
    const parsed = raw ? extractJson(raw) : {};
    return {
      primary: null,
      secondary: null,
      avoid_description:
        parsed.avoid_description ??
        'Ensure a professional setup: quiet room, neutral background, good lighting.',
      venue_type: 'video_call',
    };
  }

  private async runLocationStep1VenueProfile(
    meeting: MeetingDocument,
    openai: OpenAI,
    personalityType: string,
  ): Promise<Record<string, unknown> | null> {
    const userContent = `
Country: ${meeting.country}
City: ${meeting.city}
Meeting type: ${meeting.meetingType ?? 'Not specified'}
Deal type: ${meeting.dealType ?? 'Not specified'}
Valuation: ${meeting.valuation ?? 'Not specified'}
Investor personality: ${personalityType}
`.trim();

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a business etiquette advisor. You do not name venues. You define what to look for.

Based on the meeting context, produce a venue profile: the type of environment needed, the atmosphere that suits this investor's personality, what signals the wrong choice, and a specific Google search query to find real places in the city. The backend will use your query with Google Places API to return real, currently operating venues (real addresses, ratings, hours). You will then receive those results and write the reasoning. So your job now is only the profile and the search query — no venue names.

Return only a JSON object (no markdown) with these exact keys:
- venue_type: string (e.g. "fine_dining_restaurant", "private_meeting_room", "business_lunch_restaurant")
- atmosphere: string (e.g. "quiet, private, elegant" — what suits this investor)
- avoid: string (what signals the wrong choice)
- price_level: number 1-4 (4 = most expensive)
- google_search_query: string — a single search query to find such venues in the city (e.g. "fine dining restaurant Milan business meeting quiet elegant")
- why: string (one sentence reasoning)
- ranking_priority: string (e.g. "quietness over cuisine type")`,
        },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    });
    const raw = completion.choices[0]?.message?.content;
    return raw ? extractJson(raw) : null;
  }

  private async enrichPlacesWithDetails(
    places: PlaceSearchResult[],
  ): Promise<Array<PlaceSearchResult & { website?: string }>> {
    const out: Array<PlaceSearchResult & { website?: string }> = [];
    for (let i = 0; i < places.length; i++) {
      const p = { ...places[i] };
      if (i < 2) {
        const details = await this.googlePlaces.getPlaceDetails(p.place_id);
        if (details?.website)
          (p as PlaceSearchResult & { website?: string }).website =
            details.website;
      }
      out.push(p as PlaceSearchResult & { website?: string });
    }
    return out;
  }

  private async runLocationStep3Reasoning(
    meeting: MeetingDocument,
    openai: OpenAI,
    personalityType: string,
    places: Array<PlaceSearchResult & { website?: string }>,
  ): Promise<Record<string, unknown> | null> {
    const venueList = places
      .map(
        (p, i) =>
          `${i + 1}. ${p.name} — ${p.formatted_address}${p.rating != null ? `, Rating: ${p.rating}` : ''}${p.price_level != null ? `, Price: ${p.price_level}` : ''}`,
      )
      .join('\n');

    const userContent = `
Investor personality: ${personalityType}
Country: ${meeting.country}
City: ${meeting.city}
Meeting type: ${meeting.meetingType ?? 'Not specified'}
Deal: ${meeting.dealType ?? ''} ${meeting.valuation != null ? `Valuation: ${meeting.valuation}` : ''}

Venues found (use these exact names and addresses in your output):
${venueList}

Write a short recommendation for the first venue as primary and the second as secondary. Explain why each suits this investor meeting. Add avoid_description: one paragraph on what to avoid. Respond with ONLY valid JSON (no markdown):
- primary: { name: string (exact name from list), address: string (exact), reason: string (paragraph), why_it_works: string (sentence) }
- secondary: { name: string, address: string, reason: string (sentence) }
- avoid_description: string
`.trim();

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are AVA, an executive meeting advisor. You have received actual Google Places results — real venues. Write the reasoning for each: why this specific venue suits this specific investor, what the environment communicates about the entrepreneur's cultural awareness, and for the secondary venue what that similar alternative offers. Use the exact venue names and addresses from the list. Be specific to the cultural context and investor personality.`,
        },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });
    const raw = completion.choices[0]?.message?.content;
    return raw ? extractJson(raw) : null;
  }

  private buildLocationResultFromPlaces(
    places: Array<PlaceSearchResult & { website?: string }>,
    profile: Record<string, unknown>,
    fallbackUsed: boolean,
    reasoning?: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const primaryPlace = places[0];
    const secondaryPlace = places[1];
    const primaryReason = reasoning?.primary as
      | Record<string, unknown>
      | undefined;
    const secondaryReason = reasoning?.secondary as
      | Record<string, unknown>
      | undefined;

    const primary = {
      name: primaryPlace.name,
      address: primaryPlace.formatted_address,
      rating: primaryPlace.rating ?? null,
      price_level: primaryPlace.price_level ?? null,
      website: primaryPlace.website ?? null,
      coordinates: { lat: primaryPlace.lat, lng: primaryPlace.lng },
      reason:
        primaryReason?.reason ??
        'Professional venue suitable for investor meetings.',
      why_it_works: primaryReason?.why_it_works ?? null,
    };

    const secondary = secondaryPlace
      ? {
          name: secondaryPlace.name,
          address: secondaryPlace.formatted_address,
          rating: secondaryPlace.rating ?? null,
          price_level: secondaryPlace.price_level ?? null,
          website: secondaryPlace.website ?? null,
          coordinates: { lat: secondaryPlace.lat, lng: secondaryPlace.lng },
          reason: secondaryReason?.reason ?? 'Strong alternative option.',
        }
      : null;

    return {
      primary,
      secondary,
      avoid_description:
        (reasoning?.avoid_description as string) ??
        (profile.avoid as string) ??
        'Avoid tourist-heavy and noisy spaces for first meetings.',
      venue_type: profile.venue_type ?? 'restaurant',
      fallback_used: fallbackUsed,
    };
  }

  private getLocationFallbackStatic(): Record<string, unknown> {
    return {
      primary: {
        name: 'Private lounge or quiet venue',
        address: null,
        rating: null,
        price_level: null,
        website: null,
        coordinates: null,
        reason: 'Professional and discreet.',
        why_it_works: 'Signals seriousness and respect.',
      },
      secondary: {
        name: 'Upscale restaurant',
        address: null,
        rating: null,
        price_level: null,
        website: null,
        coordinates: null,
        reason: 'Good for relationship building.',
      },
      avoid_description:
        'Avoid tourist-heavy spots and noisy co-working spaces for first meetings.',
      venue_type: 'luxury_hotel',
      fallback_used: true,
    };
  }

  private async runLocationFallbackLLMOnly(
    meeting: MeetingDocument,
    openai: OpenAI,
    personalityType: string,
  ): Promise<Record<string, unknown>> {
    const userContent = `
Country: ${meeting.country}
City: ${meeting.city}
Meeting type: ${meeting.meetingType ?? 'Not specified'}
Deal type: ${meeting.dealType ?? 'Not specified'}
Investor personality: ${personalityType}

Google Places is unavailable. Based on your knowledge of ${meeting.city}, suggest 2 well-known venue types or area names appropriate for this meeting. Include a clear disclaimer that these are suggestions to research rather than confirmed recommendations — the user must verify availability before booking. Respond with ONLY valid JSON (no markdown):
- primary: { name: string (venue type or area, not invented proper name), address: string (e.g. "City center" or "Financial district"), reason: string, why_it_works: string }
- secondary: { name: string, address: string, reason: string }
- avoid_description: string
`.trim();

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are AVA. Suggest venue types or areas — not invented restaurant names. Give a clear disclaimer that these are suggestions to research rather than confirmed recommendations; the user must verify availability before booking. Output only the requested JSON.`,
        },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
    });
    const raw = completion.choices[0]?.message?.content;
    const parsed = raw ? extractJson(raw) : {};
    const primary = parsed.primary as Record<string, unknown>;
    const secondary = parsed.secondary as Record<string, unknown>;
    return {
      primary: {
        ...primary,
        rating: null,
        price_level: null,
        website: null,
        coordinates: null,
      },
      secondary: secondary
        ? {
            ...secondary,
            rating: null,
            price_level: null,
            website: null,
            coordinates: null,
          }
        : null,
      avoid_description:
        parsed.avoid_description ??
        'Verify any venue before booking. These are suggestions to research, not confirmed recommendations.',
      venue_type: 'restaurant',
      fallback_used: true,
    };
  }

  /**
   * Negotiation: investor's opening challenge (one LLM call). No cache — real-time.
   * Opening is calibrated to psych personality: analytical → valuation logic challenge;
   * relationship-driven → personal question before numbers.
   */
  async getNegotiationOpening(meeting: MeetingDocument): Promise<string> {
    const openai = this.getOpenAI();
    const psych = meeting.psychResult;
    const personalityType = (psych?.personality_type as string) ?? 'Analytical';

    if (!openai) {
      return `Your valuation seems aggressive for pre-revenue. Walk me through your logic — why ${meeting.valuation ?? 'this valuation'} at this stage?`;
    }

    const systemContent = `You are the investor in a negotiation simulation. You embody this specific investor: personality type "${personalityType}". Sector: ${meeting.sector ?? 'general'}. Deal: valuation ${meeting.valuation ?? 'N/A'}, ${meeting.equity ?? 'N/A'}% equity.

Your opening must be calibrated to this personality type. An analytical investor opens with a direct challenge to valuation logic or numbers. A relationship-driven or vision-oriented investor may open with a personal or strategic question before getting to numbers. Do not use a one-size-fits-all opening — match how this investor type would actually start the conversation.

Challenge the entrepreneur. Test their conviction. Stay in character. Reply in 1–3 short sentences only.`;

    const userContent = `Start the negotiation. Give your opening as this investor.`;

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      max_tokens: 150,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    return (
      text ?? 'Your valuation seems high for this stage. Walk me through it.'
    );
  }

  /**
   * Negotiation: investor's next reply. Receives full conversation history from the beginning —
   * nothing forgotten. Response is calibrated to the entrepreneur's last message: strong
   * evidence-backed answer → probe deeper; weak or vague answer → challenge harder. Real-time, no cache.
   */
  async getNegotiationInvestorReply(
    meeting: MeetingDocument,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    const openai = this.getOpenAI();
    const psych = meeting.psychResult;
    const personalityType = (psych?.personality_type as string) ?? 'Analytical';

    if (!openai) {
      return 'I need more specifics. What comparables are you using for this valuation?';
    }

    const systemContent = `You are the investor in a negotiation simulation. Personality: "${personalityType}". Sector: ${meeting.sector ?? 'general'}. Valuation ${meeting.valuation ?? 'N/A'}, ${meeting.equity ?? 'N/A'}% equity.

You have the full conversation in front of you — every exchange, nothing forgotten. Your next response must be calibrated to the entrepreneur's last message. If they gave a strong, evidence-backed response, probe deeper or shift to another angle. If they gave a weak or vague response, challenge harder and demand specifics. The simulation adapts in real time to how they perform. Stay in character. Reply in 1–3 short sentences only.`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...history.map((h) => ({
        role: h.role,
        content: h.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages,
      max_tokens: 150,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    return text ?? 'I need more detail on that.';
  }

  /**
   * Negotiation: score the entrepreneur's reply (runs in parallel with getNegotiationInvestorReply).
   * You are the demanding coach who was watching the exchange. Three dimensions: confidence,
   * logic/evidence, emotional control under pressure. Progressive strictness: exchanges 1–2 =
   * standard bar; by exchange 5 the entrepreneur should have found their rhythm — hold to a higher
   * standard. Color is enforced on the backend (not by the LLM): green = all ≥ 80, red = any < 55, else amber.
   * Goal: they walk in having already had the hard conversation once.
   */
  async scoreNegotiationResponse(
    investorQuestion: string,
    userReply: string,
    exchangeNumber: number = 1,
  ): Promise<{
    confidence_score: number;
    logic_score: number;
    emotional_control_score: number;
    feedback: string;
    color: 'green' | 'amber' | 'red';
    suggested_improvement: string;
  }> {
    const openai = this.getOpenAI();

    if (!openai) {
      return {
        confidence_score: 65,
        logic_score: 65,
        emotional_control_score: 65,
        feedback:
          'Response received. Add specific data to strengthen your argument.',
        color: 'amber',
        suggested_improvement:
          'Cite concrete numbers or comparables to back your valuation.',
      };
    }

    const progressiveNote =
      exchangeNumber >= 5
        ? `This is exchange ${exchangeNumber}. By now the entrepreneur should have found their rhythm — hold them to a higher standard. Score strictly: green only if the response is strong on every dimension.`
        : exchangeNumber >= 3
          ? `This is exchange ${exchangeNumber}. The conversation is building; expect clearer reasoning and evidence.`
          : `This is exchange ${exchangeNumber}. First exchanges: apply a standard bar.`;

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a demanding negotiation coach who was watching this exchange. Your job is to evaluate the entrepreneur's reply so they can improve before the real meeting. The goal: by the time they finish this simulation, they have already had the hard conversation once — they walk in prepared.

Evaluate three dimensions (0-100 each):
- confidence_score: how confident and assertive the response sounded
- logic_score: how logical and evidence-backed the argument was
- emotional_control_score: how emotionally controlled the delivery was under pressure

Be honest and demanding. Most early responses should land in amber; green should feel earned; red when there is a genuine strategic mistake. The backend will enforce the color rule independently: green only if all three scores ≥ 80; red if any score < 55; otherwise amber. You cannot award green for a mediocre performance.

${progressiveNote}

Provide: feedback (one sentence on the main strength or issue), suggested_improvement (one sentence showing what a stronger response would have looked like — what they could have said instead).

Respond with ONLY a valid JSON object (no markdown) with these exact keys: confidence_score, logic_score, emotional_control_score, feedback, color, suggested_improvement.`,
        },
        {
          role: 'user',
          content: `Investor asked: "${investorQuestion}"\n\nEntrepreneur replied: "${userReply}"\n\nScore the entrepreneur's reply and output the JSON.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content;
    const obj = raw ? extractJson(raw) : {};
    const c = Number(obj.confidence_score);
    const l = Number(obj.logic_score);
    const e = Number(obj.emotional_control_score);
    const confidence_score = Number.isFinite(c)
      ? Math.min(100, Math.max(0, c))
      : 65;
    const logic_score = Number.isFinite(l) ? Math.min(100, Math.max(0, l)) : 65;
    const emotional_control_score = Number.isFinite(e)
      ? Math.min(100, Math.max(0, e))
      : 65;

    let color: 'green' | 'amber' | 'red';
    if (
      confidence_score >= 80 &&
      logic_score >= 80 &&
      emotional_control_score >= 80
    ) {
      color = 'green';
    } else if (
      confidence_score < 55 ||
      logic_score < 55 ||
      emotional_control_score < 55
    ) {
      color = 'red';
    } else {
      color = 'amber';
    }

    return {
      confidence_score,
      logic_score,
      emotional_control_score,
      feedback: (obj.feedback as string) ?? 'Response evaluated.',
      color,
      suggested_improvement:
        (obj.suggested_improvement as string) ?? 'Add concrete evidence.',
    };
  }

  /**
   * Report agent (Page 10): synthesizes all five agent results plus negotiation scores into one
   * executive briefing. Does not regenerate — synthesizes. Readiness score and section statuses
   * are computed by the backend (50% negotiation, 30% offer, 20% completion; status chips from
   * backend rules). LLM only produces words; all numbers and statuses come from the backend.
   * Motivational message is the most human output: personal, specific, powerful.
   */
  async generateReport(
    meeting: MeetingDocument,
    readinessScore: number,
    sectionStatuses: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const openai = this.getOpenAI();

    const cultural = meeting.culturalResult;
    const psych = meeting.psychResult;
    const offer = meeting.offerResult;
    const image = meeting.imageResult;
    const location = meeting.locationResult;
    const scores = meeting.negotiationScores as {
      confidence?: number;
      logic?: number;
      emotional?: number;
    } | null;

    const negotiationAvg =
      scores &&
      [scores.confidence, scores.logic, scores.emotional].every(Number.isFinite)
        ? ((scores.confidence ?? 0) +
            (scores.logic ?? 0) +
            (scores.emotional ?? 0)) /
          3
        : 0;

    if (!openai) {
      return {
        cultural_summary: cultural
          ? 'Cultural briefing completed.'
          : 'Pending.',
        profile_summary: psych ? 'Investor profile completed.' : 'Pending.',
        negotiation_summary: `Simulation scores: Confidence ${scores?.confidence ?? 0}, Logic ${scores?.logic ?? 0}, Emotional ${scores?.emotional ?? 0}.`,
        offer_summary: offer
          ? `Offer analysis completed. Fair score: ${offer.fair_score ?? 0}.`
          : 'Pending.',
        image_summary: image ? 'Executive image advice completed.' : 'Pending.',
        location_summary: location
          ? 'Location recommendation completed.'
          : 'Pending.',
        motivational_message: 'You are prepared. Walk in with conviction.',
        overall_verdict: `Readiness: ${readinessScore}%. Review any section marked for review.`,
      };
    }

    const userContent = `
Meeting: ${meeting.investorName}${meeting.investorCompany ? ` from ${meeting.investorCompany}` : ''}, ${meeting.city}, ${meeting.country}. ${meeting.dealType ?? ''}, ${meeting.sector ?? ''}. Valuation ${meeting.valuation ?? 'N/A'}, ${meeting.equity ?? 'N/A'}% equity.

READINESS SCORE (backend-computed, do not change — use in narrative): ${readinessScore}/100
SECTION STATUSES (backend-computed, do not change — use in narrative): ${JSON.stringify(sectionStatuses)}

Cultural result: ${JSON.stringify(cultural ?? {})}
Psych result: ${JSON.stringify(psych ?? {})}
Offer result: ${JSON.stringify(offer ?? {})}
Image result: ${JSON.stringify(image ?? {})}
Location result: ${JSON.stringify(location ?? {})}
Negotiation average score: ${negotiationAvg.toFixed(1)}

Synthesize the above into one executive briefing. Produce ONLY a valid JSON object (no markdown) with these exact keys:
- cultural_summary: one sentence
- profile_summary: one sentence
- negotiation_summary: one sentence (what negotiation scores revealed about the entrepreneur's performance)
- offer_summary: one sentence
- image_summary: one sentence
- location_summary: one sentence
- motivational_message: 2 sentences from AVA — see instructions below
- overall_verdict: one sentence
`.trim();

    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an executive briefing writer who produces intelligence reports for high-stakes business meetings.

Do not regenerate any of the inputs. Synthesize. Read what the cultural agent found, what the psych agent determined, what the offer agent calculated, what the image agent recommended, what the location agent selected, and what the negotiation scores revealed about the entrepreneur's performance. From all of that, produce one coherent, professional briefing that tells one story: this is who you are meeting, this is how you are prepared, this is where you stand, this is what to remember.

The readiness score and section statuses are already computed by the backend. Use them in the narrative. You only produce words; all numbers and statuses come from the backend.

The motivational_message is the most human output in the entire system. It must be personal, specific, and powerful: reference the investor by name (${meeting.investorName}), acknowledge the specific deal, and speak directly to the preparation this entrepreneur has done. Two sentences from AVA that send them into the room with confidence.

Output only the JSON object with the exact keys requested. No bullet lists — only the JSON.`,
        },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const raw = completion.choices[0]?.message?.content;
    return raw ? extractJson(raw) : {};
  }
}
