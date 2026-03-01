# Testing the Backend (Meeting & Location Agent)

## 1. Prerequisites

- **.env** in project root (copy from `.env.example`):
  - `MONGO_URI` or `MONGODB_URI` — required
  - `JWT_SECRET` — required for auth
  - `OPENAI_API_KEY` — required for all agents (cultural, psych, offer, image, location)
  - `GOOGLE_PLACES_API_KEY` — optional; if missing, location agent uses LLM-only fallback (`fallback_used: true`)

- **MongoDB** running and reachable (e.g. Atlas).

## 2. Start the backend

```bash
cd backend_AgentAi-main
npm run start:dev
```

Server runs at **http://localhost:3000** (or `PORT` from .env).

## 3. Get a JWT (login)

All meeting routes require `Authorization: Bearer <access_token>`.

**Option A — Register then login**

```bash
# Register
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"YourPassword123!\",\"name\":\"Test User\"}"

# Login (use same email/password)
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"YourPassword123!\"}"
```

Response includes `access_token`. Copy it for the next steps.

**Option B — PowerShell**

```powershell
$body = '{"email":"test@example.com","password":"YourPassword123!"}' 
$r = Invoke-RestMethod -Uri http://localhost:3000/auth/login -Method Post -Body $body -ContentType "application/json"
$r.access_token
```

## 4. Create a meeting (triggers all 5 agents)

Replace `YOUR_JWT` with the token from step 3.

```bash
curl -s -X POST http://localhost:3000/meeting \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{
    "investorName": "Marco Rossi",
    "investorCompany": "Italian Ventures",
    "country": "Italy",
    "city": "Milan",
    "meetingAt": "2025-04-15T19:00:00",
    "meetingType": "Dinner",
    "dealType": "Seed",
    "sector": "Fintech",
    "valuation": 1000000,
    "equity": 15
  }'
```

Response: `{ "sessionId": "<meeting_id>", "confirmationText": "...", "status": "pending" }`.  
Copy **sessionId** for the next steps.

**Meeting types** (for location agent):

- `Formal`, `Lunch`, `Dinner` → full location flow (LLM profile → Google Places → LLM reasoning).  
  Use **Milan**, **Paris**, **New York**, etc. for good Places results if you have `GOOGLE_PLACES_API_KEY`.
- To test **Video Call** (no venue cards, setup advice only), send `"meetingType": "Video Call"` in the create body.

## 5. Poll status (optional)

```bash
curl -s http://localhost:3000/meeting/SESSION_ID/status \
  -H "Authorization: Bearer YOUR_JWT"
```

Response: `{ "status": "pending" }` or `{ "status": "ready" }` when all 5 agents have finished.

You can also skip polling: the first time you request a section (e.g. location), the backend runs that agent on demand and caches the result.

## 6. Request each section (to test agents)

Replace `SESSION_ID` and `YOUR_JWT`.

| What you test | Endpoint | Notes |
|---------------|----------|--------|
| **Location** (real venues + reasoning) | `GET /meeting/:id/location` | Needs city + country + meetingType. With Google key: real names, addresses, ratings, `coordinates`, `website`. Without: LLM-only suggestions, `fallback_used: true`. |
| Image (dress + body language) | `GET /meeting/:id/image` | Returns `dress_items`, `body_language`, `speaking_advice`, `key_tip`. |
| Cultural | `GET /meeting/:id/cultural` | |
| Psych | `GET /meeting/:id/psych` | |
| Offer | `GET /meeting/:id/offer` | |

**Example — get location result**

```bash
curl -s http://localhost:3000/meeting/SESSION_ID/location \
  -H "Authorization: Bearer YOUR_JWT"
```

Example response (with Google Places):

```json
{
  "primary": {
    "name": "Bulgari Il Ristorante",
    "address": "Via Privata Fratelli Gabba 7b, Milan",
    "rating": 4.7,
    "price_level": 4,
    "website": "https://...",
    "coordinates": { "lat": 45.46, "lng": 9.18 },
    "reason": "Private hotel restaurant...",
    "why_it_works": "Analytical investors focus better in quiet environments."
  },
  "secondary": { ... },
  "avoid_description": "Avoid restaurants near the Duomo...",
  "venue_type": "fine_dining_restaurant",
  "fallback_used": false
}
```

## 7. Quick test script (PowerShell)

Save as `test-meeting.ps1` in the backend folder. Set `$token` after logging in.

```powershell
$base = "http://localhost:3000"
$token = "YOUR_JWT_HERE"

# Create meeting
$body = @{
  investorName = "Test Investor"
  country = "Italy"
  city = "Milan"
  meetingAt = "2025-04-15T19:00:00"
  meetingType = "Dinner"
  dealType = "Seed"
  sector = "Tech"
  valuation = 1000000
} | ConvertTo-Json

$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$create = Invoke-RestMethod -Uri "$base/meeting" -Method Post -Headers $headers -Body $body
$id = $create.sessionId
Write-Host "Created meeting: $id"

# Wait a few seconds for background agents (or skip and rely on on-demand run)
Start-Sleep -Seconds 5

# Get location
$location = Invoke-RestMethod -Uri "$base/meeting/$id/location" -Method Get -Headers @{ Authorization = "Bearer $token" }
$location | ConvertTo-Json -Depth 6
```

## 8. Unit / e2e tests (optional)

- **Unit:** `npm run test` (Jest).
- **E2E:** `npm run test:e2e` (requires DB and env; see `test/jest-e2e.json`).

There are no meeting-specific tests in the repo yet; you can add `meeting-agents.service.spec.ts` or e2e for `GET /meeting/:id/location` if you want automated regression tests.
