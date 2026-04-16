#!/usr/bin/env bash
set -euo pipefail

NS="${NS:-pidevagentai}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required"
  exit 1
fi

echo "[1/5] Apply namespace and backend manifests"
kubectl apply -f "$ROOT/k8s/namespace.yaml"
kubectl apply -f "$ROOT/k8s/configmap.yaml"
kubectl apply -f "$ROOT/k8s/secret.yaml"
kubectl apply -f "$ROOT/k8s/deployment.yaml"
kubectl apply -f "$ROOT/k8s/service.yaml"
kubectl apply -f "$ROOT/k8s/ingress.yaml"
kubectl apply -f "$ROOT/k8s/hpa.yaml"

echo "[2/5] Sync Grafana dashboards from repository JSON files"
kubectl -n "$NS" create configmap grafana-dashboards \
  --from-file="$ROOT/observability/dashboards" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "[3/5] Apply observability configuration manifests"
kubectl apply -f "$ROOT/k8s/observability/prometheus-configmap.yaml"
kubectl apply -f "$ROOT/k8s/observability/alertmanager-configmap.yaml"
kubectl apply -f "$ROOT/k8s/observability/loki-configmap.yaml"
kubectl apply -f "$ROOT/k8s/observability/promtail-configmap.yaml"
kubectl apply -f "$ROOT/k8s/observability/grafana-datasources-configmap.yaml"
kubectl apply -f "$ROOT/k8s/observability/grafana-dashboards-provider-configmap.yaml"
kubectl apply -f "$ROOT/k8s/observability/grafana-secret.yaml"

echo "[4/5] Apply observability workloads"
kubectl apply -f "$ROOT/k8s/observability/prometheus-deployment.yaml"
kubectl apply -f "$ROOT/k8s/observability/prometheus-service.yaml"
kubectl apply -f "$ROOT/k8s/observability/loki-deployment.yaml"
kubectl apply -f "$ROOT/k8s/observability/loki-service.yaml"
kubectl apply -f "$ROOT/k8s/observability/alertmanager-deployment.yaml"
kubectl apply -f "$ROOT/k8s/observability/alertmanager-service.yaml"
kubectl apply -f "$ROOT/k8s/observability/grafana-deployment.yaml"
kubectl apply -f "$ROOT/k8s/observability/grafana-service.yaml"
kubectl apply -f "$ROOT/k8s/observability/kube-state-metrics-rbac.yaml"
kubectl apply -f "$ROOT/k8s/observability/kube-state-metrics-deployment.yaml"
kubectl apply -f "$ROOT/k8s/observability/kube-state-metrics-service.yaml"
kubectl apply -f "$ROOT/k8s/observability/promtail-rbac.yaml"
kubectl apply -f "$ROOT/k8s/observability/promtail-daemonset.yaml"
kubectl apply -f "$ROOT/k8s/observability/promtail-service.yaml"

echo "[5/5] Wait for core rollouts"
kubectl -n "$NS" rollout status deployment/backend --timeout=180s || true
kubectl -n "$NS" rollout status deployment/prometheus --timeout=180s || true
kubectl -n "$NS" rollout status deployment/loki --timeout=180s || true
kubectl -n "$NS" rollout status deployment/alertmanager --timeout=180s || true
kubectl -n "$NS" rollout status deployment/grafana --timeout=180s || true
kubectl -n "$NS" rollout status deployment/kube-state-metrics --timeout=180s || true
kubectl -n "$NS" rollout status daemonset/promtail --timeout=180s || true

echo "Done. Current resources:"
kubectl -n "$NS" get pods,svc,ingress,hpa
