# Backend Observability Guide

## Objective

This guide explains how observability is implemented in the NestJS backend and how it connects with the Flutter frontend.

Goals:
- trace each request end-to-end with a request ID
- export metrics to Prometheus
- visualize dashboards in Grafana
- route alerts through Alertmanager
- keep logs correlated with request ID and client source

---

## Frontend Headers

The frontend should send these headers on API calls:

- `x-request-id`: unique ID per request
- `x-client-source`: `flutter-web`, `flutter-ios`, `flutter-android`, etc.
- `x-app-version`: optional app version
- `Authorization`: bearer token for authenticated users

Backend behavior:
- reuse `x-request-id` if present, otherwise generate one
- attach request ID to request context
- echo `x-request-id` in response headers
- include client `source` in metrics and logs

---

## Current Backend Files

Implemented files:
- `src/observability/request-id.middleware.ts`
- `src/observability/prometheus.middleware.ts`
- `src/observability/logger.service.ts`
- `src/app.module.ts`
- `src/main.ts`

Optional extensions:
- `src/observability/business-metrics.service.ts`
- `src/observability/metrics.controller.ts`

---

## Metrics Model

### Core metrics

Request counter:

```text
http_requests_total{method, route, status_code, source}
```

Request latency histogram:

```text
http_request_duration_seconds_bucket{method, route, status_code, source, le}
http_request_duration_seconds_sum{method, route, status_code, source}
http_request_duration_seconds_count{method, route, status_code, source}
```

Memory:

```text
app_process_resident_memory_bytes
app_process_heap_used_bytes
```

CPU (from default Node metrics):

```text
process_cpu_seconds_total
```

### Optional business metrics

```text
app_active_users
app_total_users
app_active_sessions
```

---

## PromQL Queries

Request rate:

```promql
sum(rate(http_requests_total[5m]))
```

Request rate by route:

```promql
sum by (route) (rate(http_requests_total[5m]))
```

Request rate by source:

```promql
sum by (source) (rate(http_requests_total[5m]))
```

Frontend-only traffic:

```promql
sum(rate(http_requests_total{source=~"flutter-.*"}[5m]))
```

5xx error rate:

```promql
sum(rate(http_requests_total{status_code=~"5.."}[5m]))
```

Frontend P95 latency:

```promql
histogram_quantile(
  0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{source=~"flutter-.*"}[5m]))
)
```

Memory:

```promql
app_process_resident_memory_bytes
```

CPU:

```promql
100 * sum(rate(process_cpu_seconds_total[5m]))
```

---

## Start And Verify

### 1) Start backend

```bash
npm run start:dev
```

### 2) Health check

```bash
curl http://localhost:3000/health
```

### 3) Metrics check

```bash
curl http://localhost:3000/metrics | head -30
```

### 4) Start observability stack

```bash
npm run obs:up
```

Or manually:

```bash
docker compose -f docker-compose.observability.yml up -d
```

### 5) Open UIs

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Alertmanager: `http://localhost:9093`

---

## Grafana Panel Suggestions

Stat:
- Backend Up
- CPU Current
- Memory RSS

Time series:
- Request Rate
- Latency P95
- 5xx Error Rate
- CPU/Memory over time

Bar chart:
- Requests by Route
- Requests by Source
- Errors by Status Code

Table:
- Top routes
- Request breakdown by source/route/status

Logs:
- Backend/Nest logs from Loki

---

## Common Issues

Prometheus shows no backend data:
- backend `/metrics` not reachable from Prometheus container
- target is down in `http://localhost:9090/targets`
- query labels do not match metric labels
- no recent traffic

Grafana shows "No data":
- wrong query/panel type combination
- no scraped series in selected time range
- scrape target down

Frontend not visible in dashboards:
- frontend not sending `x-client-source`
- backend not mapping `source` label
- queries missing `source` dimension

---

## Production Label Convention

Use consistent source labels:
- `source="flutter-web"`
- `source="flutter-ios"`
- `source="flutter-android"`
- `source="backend-job"`
- `source="internal-api"`

---

## Final Checklist

- [ ] backend echoes `x-request-id`
- [ ] `x-client-source` appears in metrics labels
- [ ] `/health` is reachable
- [ ] `/metrics` is reachable
- [ ] Prometheus backend target is `UP`
- [ ] Grafana panels show data
- [ ] logs include request ID and source
- [ ] alerts can route through Alertmanager
