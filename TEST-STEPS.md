# Step-by-step: How to test your backend

Follow these steps in order. Use a terminal (PowerShell or Command Prompt) and, if you prefer, a tool like **Postman** or **Thunder Client** for the HTTP requests.

---

## Step 1 — Prepare the environment

1. **Create `.env`** in the project root (copy from `.env.example`).
2. **Set at least:**
   - `MONGO_URI` or `MONGODB_URI` — your MongoDB connection string (e.g. Atlas).
   - `JWT_SECRET` — any long random string (e.g. `my-super-secret-key-123`).
   - `OPENAI_API_KEY` — your OpenAI API key (needed for all agents).
3. **Optional:** `GOOGLE_PLACES_API_KEY` — if set, the **Location** agent returns real venues from Google; if not, it uses LLM-only suggestions and `fallback_used: true`.
4. Ensure **MongoDB** is running and reachable.

---

## Step 2 — Start the backend

Open a terminal in the project folder and run:

```powershell
cd c:\Users\chern\Downloads\backend_AgentAi-main\backend_AgentAi-main
npm run start:dev
```

Wait until you see something like: `Nest application successfully started` or `listening on port 3000`.  
The API base URL is **http://localhost:3000** (or the `PORT` in `.env`).

---

## Step 3 — Get a JWT (login)

All meeting endpoints require a JWT. First create a user, then log in.

**3a. Register (once):**

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/auth/register" -Method Post -ContentType "application/json" -Body '{"email":"test@example.com","password":"YourPassword123!","name":"Test User"}'
```

**3b. Login and copy the token:**

```powershell
$login = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"test@example.com","password":"YourPassword123!"}'
$login.access_token
```

Copy the printed **access_token** and keep it; you will use it as `YOUR_JWT` in the next steps.

---

## Step 4 — Create a meeting

Replace `YOUR_JWT` with the token from Step 3.

```powershell
$headers = @{
  "Authorization" = "Bearer YOUR_JWT"
  "Content-Type"  = "application/json"
}
$body = @{
  investorName   = "Marco Rossi"
  investorCompany = "Italian Ventures"
  country        = "Italy"
  city           = "Milan"
  meetingAt      = "2025-04-15T19:00:00"
  meetingType    = "Dinner"
  dealType       = "Seed"
  sector         = "Fintech"
  valuation      = 1000000
  equity         = 15
} | ConvertTo-Json

$create = Invoke-RestMethod -Uri "http://localhost:3000/meeting" -Method Post -Headers $headers -Body $body
$create
```

From the response, copy **sessionId** (the meeting id). Use it as `SESSION_ID` in the next steps.

---

## Step 5 — Wait for agents (optional)

The backend runs 5 agents in the background after create. You can poll status:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/meeting/SESSION_ID/status" -Method Get -Headers @{ "Authorization" = "Bearer YOUR_JWT" }
```

When you see `"status": "ready"`, all 5 agents have finished. You can also skip this and go to Step 6; the first time you request a section, the backend will run that agent on demand and cache the result.

---

## Step 6 — Test each section (page)

Replace `SESSION_ID` and `YOUR_JWT` in each request.

**6a. Cultural (Page 4)**  
`GET /meeting/:id/cultural`

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/meeting/SESSION_ID/cultural" -Method Get -Headers @{ "Authorization" = "Bearer YOUR_JWT" }
```

Check: `dos`, `donts`, `communication_style`, `negotiation_approach`, `opening_line`, `meeting_flow`.

---

**6b. Psych (Page 5)**  
`GET /meeting/:id/psych`

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/meeting/SESSION_ID/psych" -Method Get -Headers @{ "Authorization" = "Bearer YOUR_JWT" }
```

Check: `personality_type`, `dominant_traits`, `likely_objections`, `how_to_approach`, `confidence_level`.

---

**6c. Offer (Page 7)**  
`GET /meeting/:id/offer`

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/meeting/SESSION_ID/offer" -Method Get -Headers @{ "Authorization" = "Bearer YOUR_JWT" }
```

Check: `fair_score`, `valuation_verdict`, `fair_equity_range`, `walk_away_limit`, `strategic_advice`.

---

**6d. Image (Page 8)**  
`GET /meeting/:id/image`

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/meeting/SESSION_ID/image" -Method Get -Headers @{ "Authorization" = "Bearer YOUR_JWT" }
```

Check: `dress_items` (array of `{ text, type: "do"|"caution"|"avoid" }`), `body_language`, `speaking_advice`, `key_tip`.

---

**6e. Location (Page 9)**  
`GET /meeting/:id/location`

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/meeting/SESSION_ID/location" -Method Get -Headers @{ "Authorization" = "Bearer YOUR_JWT" }
```

Check: `primary` (name, address, rating, website, coordinates, reason), `secondary`, `avoid_description`, `venue_type`, `fallback_used`. With Google key you get real venues; without, `fallback_used: true` and no real addresses.

---

## Step 7 — Test negotiation (Page 6)

**7a. Start negotiation**

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/meeting/SESSION_ID/negotiation/start" -Method Post -Headers @{ "Authorization" = "Bearer YOUR_JWT" }
```

Check: `openingLine` (investor’s first message).

**7b. Send a message (replace with your own text)**

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/meeting/SESSION_ID/negotiation/message" -Method Post -Headers @{ "Authorization" = "Bearer YOUR_JWT"; "Content-Type" = "application/json" } -Body '{"message":"We are valuing at €1M based on comparables in the region and our traction."}'
```

Check: `investorReply`, `confidence_score`, `logic_score`, `emotional_control_score`, `feedback`, `color`, `suggested_improvement`. Repeat 7b to test several exchanges and progressive strictness.

---

## Step 8 — Test report (Page 10)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/meeting/SESSION_ID/report" -Method Get -Headers @{ "Authorization" = "Bearer YOUR_JWT" }
```

Check: `readinessScore`, `sectionStatuses`, `cultural_summary`, `profile_summary`, `negotiation_summary`, `offer_summary`, `image_summary`, `location_summary`, `motivational_message`, `overall_verdict`.

---

## Step 9 — Test PDF export

Report must exist first (Step 8). This downloads the PDF:

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/meeting/SESSION_ID/export" -Method Post -Headers @{ "Authorization" = "Bearer YOUR_JWT" } -OutFile "executive-briefing.pdf"
```

Open `executive-briefing.pdf` in the current directory.

---

## Step 10 — Optional: test Video Call

Create a **new** meeting with `meetingType: "Video Call"`:

```powershell
$body = @{
  investorName = "Jane Doe"
  country      = "USA"
  city         = "New York"
  meetingAt    = "2025-05-01T14:00:00"
  meetingType  = "Video Call"
  dealType     = "Seed"
} | ConvertTo-Json

$create2 = Invoke-RestMethod -Uri "http://localhost:3000/meeting" -Method Post -Headers $headers -Body $body
```

Then:

- **Image:** `GET /meeting/{new_sessionId}/image` — advice should focus on camera, lighting, background.
- **Location:** `GET /meeting/{new_sessionId}/location` — response should have `is_video_call: true`, `primary: null`, `secondary: null`, and `avoid_description` with setup advice only.

---

## Quick checklist

| Step | What you test | Success looks like |
|------|----------------|--------------------|
| 2 | Server | Server starts without errors |
| 3 | Auth | You get an `access_token` |
| 4 | Create meeting | You get `sessionId` and `status: "pending"` |
| 5 | Status | Eventually `status: "ready"` (or skip) |
| 6a–e | Cultural, Psych, Offer, Image, Location | JSON with the expected keys for each section |
| 7 | Negotiation | Opening line, then reply + scores + color per message |
| 8 | Report | Readiness score + all summaries + motivational message |
| 9 | PDF | File downloads and opens |
| 10 | Video Call | Image/location adapted to video (no venues, setup advice) |

If any step fails, check: JWT is valid and not expired; `SESSION_ID` is correct; `.env` has `MONGO_URI`, `JWT_SECRET`, and `OPENAI_API_KEY`; and the backend terminal for error messages.
