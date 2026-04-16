# Kubernetes A to Z Guide

This folder gives a complete local-to-prod style Kubernetes starter for:

- NestJS backend
- Prometheus
- Grafana
- Loki
- Alertmanager
- Promtail
- kube-state-metrics (Kubernetes metrics for Grafana)

## 1) Prerequisites

- A running Kubernetes cluster (minikube, kind, k3d, EKS, GKE, AKS)
- kubectl configured on your current context
- docker image for backend available in your registry

Useful checks:

	kubectl version --short
	kubectl config current-context
	kubectl get nodes

If you do not have a cluster yet, use local kind bootstrap:

	npm run k8s:bootstrap

or:

	bash scripts/k8s/bootstrap-kind.sh

## 2) Configure before first deploy

Edit these files first:

- k8s/deployment.yaml
  - change image to your backend image
- k8s/secret.yaml
	- set real MONGO_URI, JWT_SECRET, API keys
	- do not keep placeholder values (`replace-me`, `cluster.mongodb.net` sample)
- k8s/ingress.yaml
  - replace api.myapp.com

Optional:

- k8s/hpa.yaml for min/max replicas
- k8s/configmap.yaml for app flags and paths

## 3) Deploy everything (backend + observability)

From repository root:

	npm run k8s:deploy

or:

	bash scripts/k8s/deploy-all.sh

Execution order from zero:

1. npm run k8s:bootstrap
2. npm run k8s:deploy
3. npm run k8s:test

The script will:

1. create namespace and backend resources
2. sync Grafana dashboards from observability/dashboards
3. apply observability configmaps/secrets
4. deploy Prometheus, Grafana, Loki, Alertmanager, Promtail
5. deploy kube-state-metrics for cluster dashboards
6. wait for rollouts and print resource status

Docker Desktop note:

- If your context is `docker-desktop`, run only `npm run k8s:deploy`.
- `npm run k8s:bootstrap` is for kind clusters and is not required on Docker Desktop.

## 4) Validate and test end to end

Run:

	npm run k8s:test

or:

	bash scripts/k8s/test-all.sh

The test script checks:

1. pods/services/ingress/hpa visibility
2. deployment readiness
3. backend /health and /metrics
4. Prometheus healthy targets
5. Grafana API health
6. Loki readiness

## 5) Quick manual checks

Resource status:

	kubectl -n pidevagentai get pods,svc,ingress,hpa

Backend logs:

	kubectl -n pidevagentai logs deploy/backend --tail=120

Grafana logs:

	kubectl -n pidevagentai logs deploy/grafana --tail=120

Prometheus targets:

	kubectl -n pidevagentai port-forward svc/prometheus 9090:9090

then open:

	http://127.0.0.1:9090/targets

Grafana UI:

	kubectl -n pidevagentai port-forward svc/grafana 3001:3000

then open:

	http://127.0.0.1:3001

Default user is admin. Password is from k8s/observability/grafana-secret.yaml.

## 6) Troubleshooting

If backend is CrashLoopBackOff:

- check k8s/secret.yaml values
- check image name/tag in k8s/deployment.yaml
- inspect logs of backend pod

Quick secret update without editing files:

	kubectl -n pidevagentai create secret generic backend-secret \
	  --from-literal=JWT_SECRET='your-jwt-secret' \
	  --from-literal=MONGO_URI='your-real-mongodb-uri' \
	  --from-literal=OPENAI_API_KEY='your-openai-key' \
	  --from-literal=GOOGLE_CLIENT_SECRET='your-google-client-secret' \
	  --dry-run=client -o yaml | kubectl apply -f -
	kubectl -n pidevagentai rollout restart deploy/backend

If Grafana has no data:

- verify backend /metrics endpoint works
- verify Prometheus target backend is up
- verify dashboard time range is not too narrow

Kubernetes dashboard in Grafana:

- Open Grafana and go to Dashboards > Observability > Kubernetes Overview.
- Data is sourced from `kube-state-metrics` via Prometheus.

If Promtail has no logs in Loki:

- check DaemonSet pods are running on nodes
- check promtail logs for permission or path issues
- verify Loki service is healthy

## 7) Optional CRD integration

If you use Prometheus Operator, apply:

	kubectl apply -f k8s/prometheus-servicemonitor.yaml

This enables ServiceMonitor scraping workflow.
