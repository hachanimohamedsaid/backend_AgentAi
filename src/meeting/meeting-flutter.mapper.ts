/** Map internal briefing / report JSON to shapes expected by the Flutter meeting_intelligence UI. */

export function toFlutterCulture(brief: Record<string, unknown>): Record<string, unknown> {
  const dos = Array.isArray(brief.dos)
    ? (brief.dos as unknown[]).map((x) => String(x))
    : [];
  const avoids = Array.isArray(brief.avoids)
    ? (brief.avoids as unknown[]).map((x) => String(x))
    : [];
  const openingTopics = Array.isArray(brief.openingTopics)
    ? (brief.openingTopics as unknown[]).map((x) => String(x))
    : [];
  const first10 = Array.isArray(brief.first10MinPlan)
    ? (brief.first10MinPlan as unknown[]).map((x) => String(x))
    : [];
  return {
    dos,
    donts: avoids,
    communicationStyle: String(brief.cultureSummary ?? ''),
    negotiationApproach: openingTopics.length
      ? openingTopics.join(' ')
      : first10.length
        ? `Suggested flow: ${first10[0]}.`
        : 'Adapt to local norms; lead with rapport.',
    openingLine:
      openingTopics[0] ??
      (dos[0] ? `Consider: ${dos[0]}` : ''),
    meetingFlow: first10.length ? first10 : openingTopics,
  };
}

export function toFlutterPsychFromProfile(
  profile: Record<string, unknown>,
): Record<string, unknown> {
  const tags = Array.isArray(profile.archetypeTags)
    ? (profile.archetypeTags as unknown[]).map((x) => String(x))
    : [];
  const objections = Array.isArray(profile.likelyObjections)
    ? (profile.likelyObjections as unknown[]).map((o) => {
        if (o && typeof o === 'object') {
          const ob = o as Record<string, unknown>;
          const q = ob.objection != null ? String(ob.objection) : '';
          const w = ob.why != null ? String(ob.why) : '';
          return w ? `${q} — ${w}` : q;
        }
        return String(o);
      })
    : [];
  const whatTheyCare = Array.isArray(profile.whatTheyCareAbout)
    ? (profile.whatTheyCareAbout as unknown[]).map((x) => String(x))
    : [];
  const red = Array.isArray(profile.redFlagsTheyWillProbe)
    ? (profile.redFlagsTheyWillProbe as unknown[]).map((x) => String(x))
    : [];
  return {
    personalityType: tags[0] || 'Investor profile',
    dominantTraits:
      tags.length > 1 ? tags : tags.length ? tags : ['Analytical', 'Data-driven'],
    communicationPreference: whatTheyCare.length
      ? whatTheyCare.join(' ')
      : String(profile.decisionStyle ?? ''),
    decisionStyle: String(profile.decisionStyle ?? ''),
    likelyObjections: objections,
    questionsToAsk: Array.isArray(profile.questionsToAsk)
      ? (profile.questionsToAsk as unknown[]).map((x) => String(x))
      : [],
    howToApproach: red.length
      ? `Prepare for questions on: ${red.join(', ')}.`
      : String(profile.decisionStyle ?? ''),
    confidenceLevel: 'medium',
  };
}

export function toFlutterImage(ex: Record<string, unknown>): Record<string, unknown> {
  const toItems = (arr: unknown, type: string) =>
    Array.isArray(arr)
      ? (arr as unknown[]).map((t) => ({
          text: String(t),
          type,
        }))
      : [];
  const tips = Array.isArray(ex.speechTips)
    ? (ex.speechTips as unknown[]).map((x) => String(x))
    : [];
  const avoid = Array.isArray(ex.avoidSignals)
    ? (ex.avoidSignals as unknown[]).map((x) => String(x))
    : [];
  return {
    dressItems: toItems(ex.dressCode, 'do'),
    bodyLanguage: toItems(ex.bodyLanguage, 'do'),
    speakingAdvice: tips.join(' '),
    keyTip: avoid[0] ?? tips[0] ?? '',
  };
}

export function toFlutterOffer(off: Record<string, unknown>): Record<string, unknown> {
  const fairScore = Number(off.fairScore) || 70;
  const neg = (off.negotiateRange ?? {}) as Record<string, unknown>;
  const mr = (off.marketRange ?? {}) as Record<string, unknown>;
  const walk = (off.walkAway ?? {}) as Record<string, unknown>;
  let verdict = 'fair';
  if (fairScore >= 82) verdict = 'aggressive';
  else if (fairScore <= 45) verdict = 'conservative';
  let fairEquityRange = 'See briefing details';
  if (neg.equityMin != null && neg.equityMax != null) {
    fairEquityRange = `${neg.equityMin}%–${neg.equityMax}%`;
  } else if (mr.equityMin != null && mr.equityMax != null) {
    fairEquityRange = `${mr.equityMin}%–${mr.equityMax}%`;
  }
  const walkAwayParts: string[] = [];
  if (walk.equityMax != null) walkAwayParts.push(`Max equity: ${walk.equityMax}%`);
  if (walk.valuationMin != null)
    walkAwayParts.push(`Min valuation: ${walk.valuationMin}`);
  const walkAwayLimit =
    walkAwayParts.join('; ') ||
    (typeof walk === 'object' && Object.keys(walk).length
      ? JSON.stringify(walk)
      : '');
  const supporting = Array.isArray(off.supportingArguments)
    ? (off.supportingArguments as unknown[]).map((x) => String(x))
    : [];
  return {
    fairScore,
    fairEquityRange,
    valuationVerdict: verdict,
    walkAwayLimit,
    recommendedCounter: String(off.yourOfferPositioning ?? ''),
    marketComparison: supporting.join('\n'),
    strategicAdvice: String(off.yourOfferPositioning ?? ''),
  };
}

export function toFlutterLocation(loc: Record<string, unknown>): Record<string, unknown> {
  const recs = Array.isArray(loc.recommendations)
    ? (loc.recommendations as Record<string, unknown>[])
    : [];
  const toVenue = (r: Record<string, unknown> | undefined, i: number) => {
    if (!r) return null;
    return {
      name: String(r.name ?? `Venue ${i + 1}`),
      address: '',
      rating: 4.2 + i * 0.15,
      priceLevel: 2,
      reason: String(r.why ?? ''),
      whyItWorks: String(r.bestFor ?? ''),
    };
  };
  const primary = recs[0] ? toVenue(recs[0], 0) : null;
  const secondary = recs[1] ? toVenue(recs[1], 1) : null;
  const avoidAreas = Array.isArray(loc.avoidAreas)
    ? (loc.avoidAreas as unknown[]).map((x) => String(x))
    : [];
  return {
    primary,
    secondary,
    avoidDescription: avoidAreas.join('; '),
    venueType: recs[0] ? String(recs[0].type ?? 'venue') : 'meeting',
    fallbackUsed: !primary,
    isVideoCall: false,
  };
}

export function toFlutterReport(
  fr: Record<string, unknown>,
  briefing: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const b = briefing ?? {};
  const culture = (b.culture ?? {}) as Record<string, unknown>;
  const profile = (b.profile ?? {}) as Record<string, unknown>;
  const offer = (b.offer ?? {}) as Record<string, unknown>;
  const executiveImage = (b.executiveImage ?? {}) as Record<string, unknown>;
  const location = (b.location ?? {}) as Record<string, unknown>;
  const readinessScore = Number(fr.readinessScore) || 0;
  const cards = Array.isArray(fr.intelligenceCards)
    ? (fr.intelligenceCards as Record<string, unknown>[])
    : [];
  const statusFrom = (needle: string) => {
    const c = cards.find((x) => {
      const id = `${x.id ?? ''} ${x.title ?? ''}`.toLowerCase();
      return id.includes(needle);
    });
    const st = String(c?.status ?? 'ready').toLowerCase();
    if (st.includes('review')) return 'review';
    if (st.includes('strong')) return 'strong';
    return 'ready';
  };
  const np = (fr.negotiationPlan ?? {}) as Record<string, unknown>;
  const tt = (fr.talkTrack ?? {}) as Record<string, unknown>;
  const locRecs = Array.isArray(location.recommendations)
    ? (location.recommendations as Record<string, unknown>[])
    : [];
  const negotiationSummary = Array.isArray(np.anchors)
    ? (np.anchors as unknown[]).map((x) => String(x)).join('; ')
    : String(np.walkAway ?? np.anchor ?? '');
  return {
    readinessScore,
    readiness_score: readinessScore,
    status: 'complete',
    sectionStatuses: {
      cultural: statusFrom('culture'),
      psych: statusFrom('psych') || statusFrom('profile'),
      negotiation: statusFrom('negot'),
      offer: statusFrom('offer'),
      image: statusFrom('image'),
      location: statusFrom('location'),
    },
    culturalSummary: String(culture.cultureSummary ?? tt.opening ?? ''),
    profileSummary: String(profile.decisionStyle ?? ''),
    negotiationSummary,
    offerSummary: String(offer.yourOfferPositioning ?? ''),
    imageSummary: Array.isArray(executiveImage.dressCode)
      ? (executiveImage.dressCode as unknown[]).map((x) => String(x)).join('; ')
      : '',
    locationSummary: locRecs.map((r) => r.name).filter(Boolean).join('; '),
    motivationalMessage: String(fr.avaQuote ?? ''),
    overallVerdict: Array.isArray(fr.top3Risks)
      ? (fr.top3Risks as unknown[]).map((x) => String(x)).join(' ')
      : '',
  };
}
