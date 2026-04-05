#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKEND_HEALTH_URL="http://localhost:3000/health"
BACKEND_ROOT_URL="http://localhost:3000/"
BACKEND_METRICS_URL="http://localhost:3000/metrics"
PROMETHEUS_HEALTH_URL="http://localhost:9090/-/healthy"
PROMETHEUS_TARGETS_URL="http://localhost:9090/api/v1/targets"
GRAFANA_HEALTH_URL="http://localhost:3001/api/health"
ALERTMANAGER_HEALTH_URL="http://localhost:9093/-/healthy"
LOKI_READY_URL="http://localhost:3100/ready"

check_url() {
  local name="$1"
  local url="$2"
  local retries="${3:-20}"
  local sleep_seconds="${4:-2}"

  local i
  for ((i = 1; i <= retries; i++)); do
    if curl -fsS -m 3 "$url" >/dev/null 2>&1; then
      echo "OK: $name -> $url"
      return 0
    fi
    sleep "$sleep_seconds"
  done

  echo "ERREUR: $name indisponible -> $url"
  return 1
}

generate_traffic() {
  local rounds="${1:-20}"
  local i

  echo "Generation de trafic HTTP de test (${rounds} requetes par route)..."
  for ((i = 1; i <= rounds; i++)); do
    curl -fsS -m 3 -H 'x-client-source: flutter-mobile' "$BACKEND_ROOT_URL" >/dev/null || true
    curl -fsS -m 3 -H 'x-client-source: flutter-mobile' "$BACKEND_HEALTH_URL" >/dev/null || true
    curl -fsS -m 3 -H 'x-client-source: web-admin' "$BACKEND_ROOT_URL" >/dev/null || true
    curl -fsS -m 3 -H 'x-client-source: internal-tools' "$BACKEND_METRICS_URL" >/dev/null || true
    curl -sS -m 3 -H 'x-client-source: flutter-mobile' "http://localhost:3000/not-found" >/dev/null || true
  done
  echo "Traffic de test termine."
}

echo "== Verification backend =="
if ! curl -fsS -m 3 "$BACKEND_HEALTH_URL" >/dev/null; then
  echo "ERREUR: backend NestJS non joignable sur $BACKEND_HEALTH_URL"
  echo "Lance le backend d'abord: npm run start:dev"
  exit 1
fi

echo "== Demarrage observability stack =="
docker compose -f docker-compose.observability.yml up -d

echo "== Verification endpoints observability =="
check_url "Prometheus" "$PROMETHEUS_HEALTH_URL"
check_url "Grafana" "$GRAFANA_HEALTH_URL"
check_url "Alertmanager" "$ALERTMANAGER_HEALTH_URL"
check_url "Loki" "$LOKI_READY_URL"

generate_traffic 25

echo "== Verification scrape Prometheus =="
if curl -fsS -m 5 "$PROMETHEUS_TARGETS_URL" | grep -q '"job":"nestjs-backend"'; then
  echo "OK: target nestjs-backend detecte dans Prometheus"
else
  echo "ATTENTION: target nestjs-backend non detecte dans Prometheus"
fi

echo ""
echo "Observability prete:"
echo "- Prometheus:   http://localhost:9090"
echo "- Grafana:      http://localhost:3001"
echo "- Alertmanager: http://localhost:9093"
echo "- Loki ready:   http://localhost:3100/ready"
