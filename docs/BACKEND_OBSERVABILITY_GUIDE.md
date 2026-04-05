# Backend Observability Guide

## Objective

This backend guide explains how to make the NestJS API observable and how it works with the Flutter frontend.

The goal is to:
- trace each request end-to-end with a request id
- export metrics to Prometheus
- show dashboards in Grafana
- route alerts with Alertmanager
- keep logs correlated with the same request id

---

## What the frontend sends

The Flutter app sends these headers on API calls:

- `x-request-id`: unique id per request
- `x-client-source`: `flutter-web`, `flutter-ios`, `flutter-android`, etc.
- `x-app-version`: optional app version
- `Authorization`: bearer token when the user is authenticated

The backend reads these headers, stores them in logs/metrics, and echoes `x-request-id` in responses.

---

## What the backend must do

### 1. Read and propagate `x-request-id`

If the frontend sends a request id:
- reuse it
- attach it to request context
- return it in response headers

If it is missing:
- generate a new one
- attach it to request context
- return it in response headers

### 2. Collect Prometheus metrics

Expose at least:
- request counter
- request duration histogram
- memory usage
- optional CPU usage
- optional active users

### 3. Write structured logs

Every log line should include:
- request id
- client source
- route
- method
- status code
- latency

### 4. Expose `/metrics`

Prometheus scrapes this endpoint regularly.

### 5. Expose `/health`

Useful for health checks, uptime monitoring, and Grafana status panels.

---

## Recommended backend files

- `src/observability/request-id.middleware.ts`
- `src/observability/prometheus.middleware.ts`
- `src/observability/logger.service.ts`
- `src/app.module.ts`
- `src/main.ts`

Optional:
- `src/observability/business-metrics.service.ts`
- `src/observability/metrics.controller.ts`

---

## Metrics model

### Core metrics

Request counter:

```text
http_requests_total{method, route, status_code, source}
```

Latency histogram:

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

---

## PromQL queries for Grafana

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

Frontend traffic only:

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

Memory usage:

```promql
app_process_resident_memory_bytes
```

---

## Unified frontend + backend dashboard

Dashboard file in this repository:

- `observability/dashboards/frontend-backend-unified.json`

Includes:
- Backend Up
- Frontend Request Rate
- Frontend P95 Latency
- Frontend 5xx Rate
- Requests by Source
- P95 Latency by Source
- 5xx Errors by Source
- Backend Memory

---

## Test flow

1) Start backend:

```bash
npm run start:dev
```

2) Check health:

```bash
curl http://localhost:3000/health
```

3) Check metrics:

```bash
curl http://localhost:3000/metrics | head -30
```

4) Start observability:

```bash
npm run obs:up
```

5) Open UIs:
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Alertmanager: `http://localhost:9093`

---

## Common problems

Prometheus no data:
- backend `/metrics` unavailable
- target down
- no traffic

Grafana no data:
- wrong query
- wrong label filters
- scrape not running yet

Frontend not visible:
- `x-client-source` not sent
- backend not exporting `source` label
- queries not filtering by `source`

---

## Final check list

- [ ] `x-request-id` echoed by backend
- [ ] `x-client-source` visible in metrics
- [ ] `/metrics` up
- [ ] `/health` up
- [ ] Prometheus target `UP`
- [ ] Grafana shows data
- [ ] logs include request id and source
- [ ] alerts can fire through Alertmanager
