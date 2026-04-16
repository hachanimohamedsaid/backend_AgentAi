#!/usr/bin/env bash
set -euo pipefail

NS="${NS:-pidevagentai}"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required"
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required"
  exit 1
fi

cleanup() {
  for pid in ${PIDS:-}; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

echo "[1/6] Cluster objects"
kubectl -n "$NS" get pods,svc,ingress,hpa

echo "[2/6] Wait for backend and observability readiness"
kubectl -n "$NS" wait --for=condition=available deployment/backend --timeout=180s
kubectl -n "$NS" wait --for=condition=available deployment/prometheus --timeout=180s
kubectl -n "$NS" wait --for=condition=available deployment/loki --timeout=180s
kubectl -n "$NS" wait --for=condition=available deployment/alertmanager --timeout=180s
kubectl -n "$NS" wait --for=condition=available deployment/grafana --timeout=180s

echo "[3/6] Backend health and metrics"
kubectl -n "$NS" port-forward svc/backend 38000:80 >/tmp/pf-backend.log 2>&1 &
PIDS="$!"
sleep 2
curl -sf http://127.0.0.1:38000/health >/dev/null
echo "backend /health OK"
curl -sf http://127.0.0.1:38000/metrics | head -n 5
kill "$PIDS" >/dev/null 2>&1 || true
PIDS=""

echo "[4/6] Prometheus targets"
kubectl -n "$NS" port-forward svc/prometheus 39090:9090 >/tmp/pf-prometheus.log 2>&1 &
PIDS="$!"
sleep 2
curl -sf http://127.0.0.1:39090/api/v1/targets | grep -q '"health":"up"'
echo "Prometheus has healthy targets"
kill "$PIDS" >/dev/null 2>&1 || true
PIDS=""

echo "[5/6] Grafana health"
kubectl -n "$NS" port-forward svc/grafana 33001:3000 >/tmp/pf-grafana.log 2>&1 &
PIDS="$!"
sleep 2
curl -sf http://127.0.0.1:33001/api/health | grep -q '"database": "ok"\|"database":"ok"'
echo "Grafana API health OK"
kill "$PIDS" >/dev/null 2>&1 || true
PIDS=""

echo "[6/6] Loki readiness"
kubectl -n "$NS" port-forward svc/loki 33100:3100 >/tmp/pf-loki.log 2>&1 &
PIDS="$!"
sleep 2
curl -sf http://127.0.0.1:33100/ready >/dev/null
echo "Loki /ready OK"
kill "$PIDS" >/dev/null 2>&1 || true
PIDS=""

echo "All checks passed"
