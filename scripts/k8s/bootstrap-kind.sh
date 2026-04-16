#!/usr/bin/env bash
set -euo pipefail

KIND_NAME="${KIND_NAME:-pidevagentai}"

if ! command -v kind >/dev/null 2>&1; then
  echo "kind is required (brew install kind)"
  exit 1
fi
if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required"
  exit 1
fi

echo "Creating kind cluster: $KIND_NAME"
kind create cluster --name "$KIND_NAME" --wait 120s || true

echo "Using kind context"
kubectl config use-context "kind-$KIND_NAME"

echo "Installing metrics-server (required by HPA)"
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

echo "Installing ingress-nginx"
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=180s

echo "Optional: load local backend image into kind"
echo "Run this only if your backend image is local and not in remote registry:"
echo "kind load docker-image <your-image:tag> --name $KIND_NAME"

echo "Bootstrap complete"
