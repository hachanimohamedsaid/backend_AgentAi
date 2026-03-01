# Meeting flow: how each page is created and what options it contains

This document describes **how each “page” (screen) is created** in the backend and **what required vs optional fields** each one uses or returns. All meeting endpoints live under `GET/POST/PUT /meeting` and require **JWT** (`Authorization: Bearer <access_token>`).

---

## Page 1–2: Meeting setup (create / update)

**How it’s created**

- **Create:** `POST /meeting` with body = **CreateMeetingDto**
- **Update:** `PUT /meeting/:id` with body = **UpdateMeetingDto** (all fields optional, partial update)

**Options (CreateMeetingDto)**

| Field | Required | Notes |
|-------|----------|--------|
| **investorName** | ✅ Yes | Max 200 chars |
| **investorCompany** | ❌ Optional | Max 200 chars |
| **country** | ✅ Yes | Max 100 chars |
| **city** | ✅ Yes | Max 100 chars |
| **meetingAt** | ✅ Yes | ISO 8601, e.g. `"2025-03-06T18:00:00"` |
| **dealType** | ❌ Optional | Max 100 chars (e.g. Seed, Series A) |
| **meetingType** | ❌ Optional | One of: `Formal`, `Lunch`, `Dinner`, `Video Call` |
| **sector** | ❌ Optional | Max 100 chars |
| **valuation** | ❌ Optional | Number ≥ 0 |
| **equity** | ❌ Optional | Number 0–100 (%) |
| **investmentAsked** | ❌ Optional | Number ≥ 0 |
| **revenue** | ❌ Optional | Number ≥ 0 |
| **teamSize** | ❌ Optional | Number ≥ 0 |
| **investorBio** | ❌ Optional | Free text; improves Psych agent |
| **investorPosts** | ❌ Optional | Quotes/posts; improves Psych agent |

**Update (UpdateMeetingDto)**  
Same field names; **all fields optional**. Only send fields you want to change.

**Response (create)**  
`{ sessionId, confirmationText, status }`. Background runs 5 agents (cultural, psych, offer, image, location) after create.

---

## Page 3: Loading / status

**How it’s created**

- Frontend polls `GET /meeting/:id/status` (e.g. every 2s).

**Options**

- No body. Path param: meeting `id`.

**Response**

| Field | Type | Notes |
|-------|------|--------|
| **status** | `"pending"` \| `"ready"` \| `"complete"` | `ready` = all 5 agent results present; `complete` = report generated |

---

## Page 4: Cultural briefing

**How it’s created**

- First time you call `GET /meeting/:id/cultural`, backend runs the **Cultural agent** (LLM), saves result, returns it. Later calls return the cached result.

**Options**

- No body. Uses meeting data: **country**, **city**, **dealType**, **meetingType**, **sector**.

**Response (options the page can show)**

| Field | Type | Notes |
|-------|------|--------|
| **dos** | `string[]` | Exactly 3 positive behaviors |
| **donts** | `string[]` | Exactly 3 mistakes to avoid |
| **communication_style** | string | One paragraph |
| **negotiation_approach** | string | One paragraph |
| **opening_line** | string | One sentence |
| **meeting_flow** | `string[]` | Exactly 4 ordered steps (e.g. warm-up, context, pitch, close) |

---

## Page 5: Investor psychological profile (Psych)

**How it’s created**

- First time you call `GET /meeting/:id/psych`, backend runs the **Psych agent** (LLM) using meeting text (bio, posts, uploaded docs), saves result, returns it. Uploading a file (`POST /meeting/:id/upload`) clears psych result so next GET re-runs with new content.

**Options**

- No body. Uses: **investorName**, **investorCompany**, **investorBio**, **investorPosts**, **attachmentTexts** (from uploads), **sector**, **dealType**.

**Response (options the page can show)**

| Field | Type | Notes |
|-------|------|--------|
| **personality_type** | string | One label (e.g. Analytical Pragmatist, Relationship-Driven Visionary) |
| **dominant_traits** | `string[]` | Exactly 4 traits |
| **communication_preference** | string | One paragraph |
| **decision_style** | string | One paragraph |
| **likely_objections** | `string[]` | Exactly 3 likely questions |
| **questions_to_ask** | `string[]` | Exactly 2 questions entrepreneur should ask |
| **how_to_approach** | string | One paragraph (main coaching) |
| **confidence_level** | `"high"` \| `"medium"` \| `"low"` | For disclaimers when input is limited |

---

## Page 6: Negotiation simulation

**How it’s created**

- **Start:** `POST /meeting/:id/negotiation/start` → returns investor’s opening line and saves it as first assistant message.
- **Send message:** `POST /meeting/:id/negotiation/message` with body `{ "message": "user text" }` (max 4000 chars) → returns investor reply + scores + feedback.

**Options**

- **Start:** No body.
- **Message:** Body = **NegotiationMessageDto**: `{ message: string }` (required, max 4000).

**Response (start)**  
`{ openingLine: string }`

**Response (message)**

| Field | Type | Notes |
|-------|------|--------|
| **investorReply** | string | Simulated investor reply |
| **confidence_score** | number | 0–100 |
| **logic_score** | number | 0–100 |
| **emotional_control_score** | number | 0–100 |
| **feedback** | string | Short feedback on the reply |
| **color** | `"green"` \| `"amber"` \| `"red"` | For UI |
| **suggested_improvement** | string | Optional improvement tip |

---

## Page 7: Offer strategy

**How it’s created**

- First time you call `GET /meeting/:id/offer`, backend runs the **Offer agent** (LLM), saves result, returns it.

**Options**

- No body. Uses: **valuation**, **equity**, **investmentAsked**, **sector**, **dealType**, **revenue**, **teamSize**.

**Response (options the page can show)**

| Field | Type | Notes |
|-------|------|--------|
| **fair_score** | number | 0–100 |
| **fair_equity_range** | string | e.g. `"12-18%"` |
| **valuation_verdict** | `"fair"` \| `"aggressive"` \| `"conservative"` | |
| **walk_away_limit** | string | Suggested max equity / walk-away |
| **recommended_counter** | string | Recommended negotiation range |
| **market_comparison** | string | One paragraph |
| **strategic_advice** | string | One paragraph |

---

## Page 8: Executive image (dress & presentation)

**How it’s created**

- First time you call `GET /meeting/:id/image`, backend runs the **Image agent** (LLM), saves result, returns it. Uses **country**, **city**, **meetingType**, **psychResult.personality_type**, **psychResult.dominant_traits**, **sector**, **dealType**. For “Video Call” meeting type, advice focuses on camera/setup.

**Options**

- No body. Optional on **meeting**: **meetingType** (Formal / Lunch / Dinner / Video Call). For Video Call, image advice focuses on camera/setup.

**Response (options the page can show)**

| Field | Type | Notes |
|-------|------|--------|
| **dress_items** | `Array<{ text: string, type: "do" \| "caution" \| "avoid" }>` | Single list; frontend maps type → green / amber / red dot |
| **body_language** | `Array<{ text: string, type: "do" \| "caution" \| "avoid" }>` | Same structure |
| **speaking_advice** | string | One paragraph (pace, tone) |
| **key_tip** | string | One sentence (e.g. for report / morning-of card) |

---

## Page 9: Smart location (venues)

**How it’s created**

- First time you call `GET /meeting/:id/location`, backend runs the **Location agent**: (1) LLM venue profile, (2) Google Places for real venues (if `GOOGLE_PLACES_API_KEY` set), (3) LLM reasoning for each venue. Uses **country**, **city**, **meetingType**, **dealType**, **valuation**, **psychResult.personality_type**. If **meetingType** is “Video Call”, no venues; only setup advice and `is_video_call: true`.

**Options**

- No body. Optional on **meeting**: **meetingType** (Formal / Lunch / Dinner / Video Call). For Video Call, no venues; setup advice only.

**Response (options the page can show) — in-person meeting**

| Field | Type | Notes |
|-------|------|--------|
| **primary** | object | See below |
| **secondary** | object \| null | Same shape as primary (optional) |
| **avoid_description** | string | One paragraph |
| **venue_type** | string | e.g. fine_dining_restaurant |
| **fallback_used** | boolean | true = no Google Places, LLM-only suggestions |

**primary / secondary (when not video call)**

| Field | Type | Notes |
|-------|------|--------|
| **name** | string | Venue name |
| **address** | string \| null | Full address (null in fallback) |
| **rating** | number \| null | e.g. 4.7 |
| **price_level** | number \| null | 1–4 |
| **website** | string \| null | When available from Places |
| **coordinates** | `{ lat, lng }` \| null | For map pin |
| **reason** | string | Why this venue fits |
| **why_it_works** | string \| null | Primary only |

**Video call**  
`primary: null`, `secondary: null`, `is_video_call: true`, `avoid_description` = setup advice (lighting, background, etc.).

---

## Page 10: Executive briefing (report)

**How it’s created**

- First time you call `GET /meeting/:id/report`, backend computes **readinessScore** and **sectionStatuses**, runs the **Report agent** (LLM) to generate narrative summaries, saves report and sets meeting **status** to `complete`. Later calls return the cached report.

**Options**

- No body. Uses all stored agent results + negotiation scores.

**Response (options the page can show)**

| Field | Type | Notes |
|-------|------|--------|
| **readinessScore** | number | 0–100 (backend formula) |
| **sectionStatuses** | `Record<string, string>` | cultural, psych, offer, image, location, negotiation → `"ready"` \| `"strong"` \| `"review"` |
| **cultural_summary** | string | One sentence |
| **profile_summary** | string | One sentence |
| **negotiation_summary** | string | One sentence |
| **offer_summary** | string | One sentence |
| **image_summary** | string | One sentence (can use imageResult.key_tip) |
| **location_summary** | string | One sentence |
| **motivational_message** | string | 2 sentences from AVA |
| **overall_verdict** | string | One sentence |

---

## Export PDF

**How it’s created**

- `POST /meeting/:id/export` (no body). Call **after** report exists (e.g. after `GET /meeting/:id/report`). Returns PDF stream; filename: `executive-briefing-{id}.pdf`.

**Options**

- No body. Uses stored **reportResult**, **readinessScore**, **sectionStatuses**.

---

## Upload document (for Psych)

**How it’s created**

- `POST /meeting/:id/upload` with **multipart form**: field name **file**, file (e.g. PDF). Backend stores file, extracts text from PDFs, appends to **attachmentTexts**, and **clears psychResult** so the next `GET /meeting/:id/psych` re-runs the Psych agent with the new content.

**Options**

- Form field: **file** (required). Optional: any other metadata your app sends (backend uses `file` only).

**Response**  
`{ ok: true, attachment: { name, url, type } }`

---

## Summary table: endpoint → page and main options

| Page | Endpoint(s) | Main options (inputs / outputs) |
|------|-------------|----------------------------------|
| 1–2 Setup | `POST /meeting`, `PUT /meeting/:id` | Create: investorName, country, city, meetingAt required; dealType, meetingType, sector, valuation, equity, investorBio, investorPosts, etc. optional. Update: all optional. |
| 3 Status | `GET /meeting/:id/status` | Output: status (pending / ready / complete). |
| 4 Cultural | `GET /meeting/:id/cultural` | Output: dos, donts, communication_style, negotiation_approach, opening_line, meeting_flow. |
| 5 Psych | `GET /meeting/:id/psych` | Output: personality_type, dominant_traits, communication_preference, decision_style, likely_objections, questions_to_ask, how_to_approach, confidence_level. Optional input: upload via POST /meeting/:id/upload. |
| 6 Negotiation | `POST /meeting/:id/negotiation/start`, `POST /meeting/:id/negotiation/message` | Start: output openingLine. Message: body `{ message }`; output investorReply, scores, feedback, color, suggested_improvement. |
| 7 Offer | `GET /meeting/:id/offer` | Output: fair_score, fair_equity_range, valuation_verdict, walk_away_limit, recommended_counter, market_comparison, strategic_advice. |
| 8 Image | `GET /meeting/:id/image` | Output: dress_items, body_language, speaking_advice, key_tip. |
| 9 Location | `GET /meeting/:id/location` | Output: primary, secondary, avoid_description, venue_type, fallback_used; for video: is_video_call, no primary/secondary. |
| 10 Report | `GET /meeting/:id/report` | Output: readinessScore, sectionStatuses, *_summary fields, motivational_message, overall_verdict. |
| Export | `POST /meeting/:id/export` | No body; returns PDF. |
| Upload | `POST /meeting/:id/upload` | Form file; optional for Psych quality. |

All of the above assume the meeting is created first with `POST /meeting` and that the frontend uses the returned `sessionId` as `:id` in subsequent requests.
