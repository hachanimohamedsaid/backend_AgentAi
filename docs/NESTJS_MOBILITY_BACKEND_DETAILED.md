# Mobility Backend Detaillee (NestJS + Railway)

## Objectif
Ce document definit l'implementation backend pour le module mobilite utilise par l'ecran Travel Flutter.

Le backend couvre:
- estimation Uber (produits Uber uniquement),
- regles quotidiennes,
- creation de propositions,
- confirmation manuelle avant reservation,
- suivi in-app des statuts provider (PENDING_PROVIDER -> ACCEPTED/FAILED/EXPIRED),
- persistence MongoDB.

Important:
- Le scenario `08:00 Centre Ville -> La Marsa` est un exemple editable.
- Les donnees sont dynamiques (origine, destination, coords GPS optionnelles).
- Mode produit actuel: Uber-only en production (`uberx`, `uberxl`).
- Bolt/Taxi meter restent en roadmap (phase future).
- Aucune fake data en runtime: estimations et propositions doivent venir du backend live.

## Contrat frontend couvert

Endpoints JWT:
- `POST /mobility/quotes/estimate`
- `GET /mobility/rules`
- `POST /mobility/rules`
- `PATCH /mobility/rules/:id`
- `POST /mobility/proposals`
- `GET /mobility/proposals/pending`
- `POST /mobility/proposals/:id/confirm`
- `POST /mobility/proposals/:id/reject`
- `POST /mobility/proposals/:proposalId/confirm` (alias compatible)
- `POST /mobility/proposals/:proposalId/reject` (alias compatible)
- `GET /mobility/bookings`

## Request / Response attendus

### `POST /mobility/quotes/estimate`
- Supporte `fromCoordinates` et `toCoordinates` (optionnels).
- Retourne:
  - `best`
  - `options[]` avec `provider`, `minPrice`, `maxPrice`, `etaMinutes`, `confidence`, `reasons`.
- Providers actifs en mode current-prod: `uberx`, `uberxl`.
- Pas de fallback mock: en indisponibilite provider, retourner `503 PROVIDER_UNAVAILABLE`.

### `POST /mobility/proposals`
- Cree une proposition en statut `PENDING_USER_APPROVAL`.
- Retourne une ressource compatible frontend:

```json
{
  "id": "proposal_abc",
  "from": "Current location",
  "to": "La Marsa",
  "status": "PENDING_USER_APPROVAL",
  "provider": "uberx"
}
```

### `GET /mobility/proposals/pending`
- Retourne une liste de propositions en attente.
- Chaque item expose au minimum: `id`, `from`, `to`, `status`, `provider`.

### `POST /mobility/proposals/:id/confirm`
- Confirme la proposition et cree/maj un booking en `PENDING_PROVIDER`.
- Ne retourne jamais `ACCEPTED` immediatement.
- Retourne:

```json
{
  "ok": true,
  "proposalId": "proposal_abc",
  "status": "PENDING_PROVIDER",
  "bookingId": "booking_xyz"
}
```

### `POST /mobility/proposals/:id/reject`
- Refuse/annule la proposition.
- Retourne `200` avec JSON.

### `POST /mobility/providers/uber/webhook`
- Callback provider pour transitions finales.
- Evenements supportes:
  - `DRIVER_ACCEPTED` -> `ACCEPTED`
  - `DRIVER_NOT_FOUND` -> `REJECTED`
  - `TIMEOUT` -> `EXPIRED`
  - `TRIP_FINISHED` -> `COMPLETED`

## Scheduler et securite

- Scheduler toutes les minutes via `@nestjs/schedule`.
- Ne jamais auto-booker si `requireUserApproval=true`.
- Expiration des propositions via `MOBILITY_PROPOSAL_TTL_MINUTES`.

## Variables Railway

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...

MOBILITY_DEFAULT_TIMEZONE=Africa/Tunis
MOBILITY_PROPOSAL_TTL_MINUTES=5
MOBILITY_RETRY_COUNT=2
MOBILITY_RETRY_DELAY_MS=1500

MAPS_API_KEY=...
TRAFFIC_API_KEY=...
UBER_CLIENT_ID=...
UBER_CLIENT_SECRET=...
UBER_QUOTES_API_URL=...
UBER_SERVER_TOKEN=...
BOLT_API_KEY=...
BOLT_API_SECRET=...
```

Notes env en mode actuel:
- `UBER_CLIENT_ID` / `UBER_CLIENT_SECRET` utiles pour l'integration live OAuth/provider.
- `UBER_QUOTES_API_URL` requis pour les estimations Uber live.
- `UBER_SERVER_TOKEN` optionnel selon ton gateway/provider.
- `BOLT_*` peut rester vide si Bolt est desactive en production.

## Checklist E2E

1. Login Flutter valide.
2. `POST /mobility/quotes/estimate` retourne `best` + `options`.
3. Rule ON/OFF via `POST/PATCH /mobility/rules`.
4. `POST /mobility/proposals` cree une proposition.
5. `POST /mobility/proposals/:id/confirm` confirme et genere booking.
6. Persistence Mongo verifiee: rules/proposals/bookings.
