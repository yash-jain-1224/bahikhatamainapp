#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Bahi Khata Pro - Azure Deployment Script
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
K8S_DIR="$ROOT_DIR/infra/k8s"
DOCKER_DIR="$ROOT_DIR/infra/docker"
BICEP_DIR="$ROOT_DIR/infra/azure"

# ---- Configuration (override via env vars) -----------------
RESOURCE_GROUP="${RESOURCE_GROUP:-MyBahiKhata-RG}"
LOCATION="${LOCATION:-eastus2}"
PROJECT="${PROJECT:-bahikhata}"
ENV_NAME="${ENV_NAME:-prod}"
SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-d36d32c2-b96d-4666-bfc6-be9830f67d13}"
TENANT_ID="${TENANT_ID:-02b70906-c568-452f-85fd-1fbc1f66f2f6}"
AKS_NODE_COUNT="${AKS_NODE_COUNT:-3}"
AKS_NODE_SIZE="${AKS_NODE_SIZE:-Standard_D2s_v3}"
PG_ADMIN_USER="${PG_ADMIN_USER:-bahikhataadmin}"
PG_ADMIN_PASSWORD="${PG_ADMIN_PASSWORD:-$(openssl rand -base64 24)}"
NAMESPACE="${NAMESPACE:-bahi-khata}"

# Derived names (must match bicep)
ACR_NAME="${PROJECT}${ENV_NAME}acr"
AKS_NAME="${PROJECT}${ENV_NAME}aks"
PG_NAME="bahikhatapgprod"           # named separately due to regional restriction
REDIS_NAME="${PROJECT}${ENV_NAME}redis"
KV_NAME="${PROJECT}${ENV_NAME}kv"
STORAGE_NAME="${PROJECT}${ENV_NAME}storage"
PG_LOCATION="${PG_LOCATION:-northeurope}"  # PG not available in eastus2 on this sub

SERVICES="api-gateway auth-service business-service purchase-service sales-service \
          inventory-service ledger-service subscription-service billing-service \
          notification-service admin-service profile-service referral-service"

log()  { echo -e "\033[0;34m[INFO]\033[0m  $*"; }
ok()   { echo -e "\033[0;32m[ OK ]\033[0m  $*"; }
warn() { echo -e "\033[0;33m[WARN]\033[0m  $*"; }
die()  { echo -e "\033[0;31m[FAIL]\033[0m  $*"; exit 1; }

step() {
  echo ""
  echo "============================================================"
  echo "  STEP $1: $2"
  echo "============================================================"
}

# ---- Prerequisites check -----------------------------------
check_prereqs() {
  step 0 "Checking prerequisites"
  for cmd in az docker kubectl helm openssl; do
    command -v "$cmd" &>/dev/null && ok "$cmd found" || die "$cmd not found. Please install it."
  done
  az account show &>/dev/null || die "Not logged in to Azure. Run: az login --tenant $TENANT_ID"
  # Set correct subscription
  az account set --subscription "$SUBSCRIPTION_ID" || die "Failed to set subscription $SUBSCRIPTION_ID"
  ok "Using subscription: $SUBSCRIPTION_ID"
  ok "All prerequisites satisfied."
}

# ---- Resource group ----------------------------------------
create_resource_group() {
  step 1 "Creating resource group: $RESOURCE_GROUP"
  if az group show --name "$RESOURCE_GROUP" &>/dev/null; then
    warn "Resource group $RESOURCE_GROUP already exists."
  else
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
    ok "Resource group created."
  fi
}

# ---- Bicep deployment (ACR, Redis, Storage, KeyVault, Postgres, Log Analytics) ---
deploy_infrastructure() {
  step 2 "Deploying Azure infrastructure (Bicep — skips AKS)"
  log "PG admin password: $PG_ADMIN_PASSWORD (save this!)"

  az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$BICEP_DIR/main.bicep" \
    --parameters \
        environment="$ENV_NAME" \
        location="$LOCATION" \
        projectName="$PROJECT" \
        aksNodeCount="$AKS_NODE_COUNT" \
        aksNodeSize="$AKS_NODE_SIZE" \
        pgAdminUser="$PG_ADMIN_USER" \
        pgAdminPassword="$PG_ADMIN_PASSWORD" \
        pgLocation="$PG_LOCATION" \
    --name "bahikhata-infra" \
    --output none

  ok "Infrastructure deployed."

  _export_bicep_outputs
}

_export_bicep_outputs() {
  BICEP_OUT=$(az deployment group show \
    --resource-group "$RESOURCE_GROUP" \
    --name "bahikhata-infra" \
    --query "properties.outputs" -o json 2>/dev/null || echo "{}")

  ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" -g "$RESOURCE_GROUP" --query loginServer -o tsv 2>/dev/null || echo "")
  PG_HOST=$(az postgres flexible-server show -g "$RESOURCE_GROUP" -n "$PG_NAME" --query fullyQualifiedDomainName -o tsv 2>/dev/null || echo "")
  REDIS_HOST=$(az redis show -g "$RESOURCE_GROUP" -n "$REDIS_NAME" --query hostName -o tsv 2>/dev/null || echo "")
  STORAGE_ACCOUNT=$(az storage account show -g "$RESOURCE_GROUP" -n "${STORAGE_NAME}" --query name -o tsv 2>/dev/null || echo "")
  KV_URI=$(az keyvault show -g "$RESOURCE_GROUP" -n "$KV_NAME" --query properties.vaultUri -o tsv 2>/dev/null || echo "")

  log "ACR:     $ACR_LOGIN_SERVER"
  log "PG:      $PG_HOST"
  log "Redis:   $REDIS_HOST"
  log "Storage: $STORAGE_ACCOUNT"
  log "KV:      $KV_URI"
}

# ---- AKS creation (via CLI — more reliable than Bicep for AKS) ----
create_aks() {
  step 3 "Creating AKS cluster"

  if az aks show -g "$RESOURCE_GROUP" -n "$AKS_NAME" --query provisioningState -o tsv 2>/dev/null | grep -q "Succeeded"; then
    warn "AKS cluster $AKS_NAME already exists and is healthy. Skipping."
    return
  fi

  # Delete if in failed state
  local state
  state=$(az aks show -g "$RESOURCE_GROUP" -n "$AKS_NAME" --query provisioningState -o tsv 2>/dev/null || echo "NotFound")
  if [[ "$state" == "Failed" ]]; then
    warn "AKS in Failed state — deleting and recreating..."
    az aks delete -g "$RESOURCE_GROUP" -n "$AKS_NAME" --yes
    ok "Deleted failed AKS cluster."
  fi

  log "Creating AKS cluster $AKS_NAME in $LOCATION (takes ~8 mins)..."
  az aks create \
    -g "$RESOURCE_GROUP" \
    -n "$AKS_NAME" \
    --location "$LOCATION" \
    --node-count "$AKS_NODE_COUNT" \
    --node-vm-size "$AKS_NODE_SIZE" \
    --network-plugin azure \
    --load-balancer-sku standard \
    --enable-cluster-autoscaler \
    --min-count 2 \
    --max-count 5 \
    --generate-ssh-keys \
    --enable-managed-identity \
    --os-sku Ubuntu \
    --node-osdisk-size 128 \
    --output none

  ok "AKS cluster created."

  # Grant AKS kubelet identity pull access to ACR
  local kubelet_id
  kubelet_id=$(az aks show -g "$RESOURCE_GROUP" -n "$AKS_NAME" \
    --query identityProfile.kubeletidentity.objectId -o tsv)
  local acr_id
  acr_id=$(az acr show -n "$ACR_NAME" -g "$RESOURCE_GROUP" --query id -o tsv)
  az role assignment create \
    --assignee "$kubelet_id" \
    --role "AcrPull" \
    --scope "$acr_id" \
    --output none 2>/dev/null || warn "AcrPull role may already be assigned."
  ok "ACR pull access granted to AKS."
}

# ---- ACR login & Docker build ------------------------------
build_and_push_images() {
  step 3 "Building and pushing Docker images to ACR"

  # Get ACR name from resource group if not set via bicep output
  ACR_LOGIN_SERVER="${ACR_LOGIN_SERVER:-$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)}"

  az acr login --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP"

  # Build frontend
  log "Building frontend..."
  docker build \
    -f "$DOCKER_DIR/Dockerfile.frontend" \
    -t "$ACR_LOGIN_SERVER/frontend:latest" \
    "$ROOT_DIR"
  docker push "$ACR_LOGIN_SERVER/frontend:latest"
  ok "frontend pushed."

  # Build website
  log "Building website..."
  docker build \
    -f "$DOCKER_DIR/Dockerfile.website" \
    -t "$ACR_LOGIN_SERVER/website:latest" \
    "$ROOT_DIR"
  docker push "$ACR_LOGIN_SERVER/website:latest"
  ok "website pushed."

  # Build all microservices
  for svc in $SERVICES; do
    log "Building $svc..."
    docker build \
      -f "$DOCKER_DIR/Dockerfile.service" \
      --build-arg SERVICE_NAME="$svc" \
      -t "$ACR_LOGIN_SERVER/$svc:latest" \
      "$ROOT_DIR"
    docker push "$ACR_LOGIN_SERVER/$svc:latest"
    ok "$svc pushed."
  done
}

# ---- AKS credentials ---------------------------------------
get_aks_credentials() {
  step 4 "Getting AKS credentials"
  az aks get-credentials \
    --resource-group "$RESOURCE_GROUP" \
    --name "$AKS_NAME" \
    --overwrite-existing
  ok "kubectl context set to $AKS_NAME."
}

# ---- Nginx Ingress Controller ------------------------------
install_nginx_ingress() {
  step 5 "Installing NGINX Ingress Controller"
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx &>/dev/null || true
  helm repo update &>/dev/null

  if helm list -n ingress-nginx 2>/dev/null | grep -q ingress-nginx; then
    warn "ingress-nginx already installed."
  else
    helm install ingress-nginx ingress-nginx/ingress-nginx \
      --namespace ingress-nginx \
      --create-namespace \
      --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz \
      --set controller.nodeSelector."kubernetes\.io/os"=linux \
      --wait
    ok "NGINX Ingress installed."
  fi
}

# ---- Cert-Manager ------------------------------------------
install_cert_manager() {
  step 6 "Installing cert-manager"
  helm repo add jetstack https://charts.jetstack.io &>/dev/null || true
  helm repo update &>/dev/null

  if helm list -n cert-manager 2>/dev/null | grep -q cert-manager; then
    warn "cert-manager already installed."
  else
    helm install cert-manager jetstack/cert-manager \
      --namespace cert-manager \
      --create-namespace \
      --set installCRDs=true \
      --wait
    ok "cert-manager installed."
  fi
}

# ---- K8s namespace + config --------------------------------
apply_k8s_base() {
  step 7 "Applying Kubernetes namespace and configuration"

  # Create namespace
  kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: $NAMESPACE
  labels:
    name: $NAMESPACE
EOF

  # Get Redis access key
  REDIS_KEY=$(az redis list-keys \
    --resource-group "$RESOURCE_GROUP" \
    --name "$REDIS_NAME" \
    --query primaryKey -o tsv)

  # Get storage connection string
  STORAGE_CONN=$(az storage account show-connection-string \
    --resource-group "$RESOURCE_GROUP" \
    --name "$STORAGE_NAME" \
    --query connectionString -o tsv)

  # Apply configmap
  kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: bahi-khata-config
  namespace: $NAMESPACE
data:
  NODE_ENV: "production"
  AUTH_SERVICE_URL: "http://auth-service:3001"
  BUSINESS_SERVICE_URL: "http://business-service:3002"
  PURCHASE_SERVICE_URL: "http://purchase-service:3003"
  SALES_SERVICE_URL: "http://sales-service:3004"
  INVENTORY_SERVICE_URL: "http://inventory-service:3005"
  LEDGER_SERVICE_URL: "http://ledger-service:3006"
  SUBSCRIPTION_SERVICE_URL: "http://subscription-service:3007"
  BILLING_SERVICE_URL: "http://billing-service:3008"
  NOTIFICATION_SERVICE_URL: "http://notification-service:3009"
  ADMIN_SERVICE_URL: "http://admin-service:3010"
  PROFILE_SERVICE_URL: "http://profile-service:3011"
  REFERRAL_SERVICE_URL: "http://referral-service:3012"
  AUTH_SERVICE_PORT: "3001"
  BUSINESS_SERVICE_PORT: "3002"
  PURCHASE_SERVICE_PORT: "3003"
  SALES_SERVICE_PORT: "3004"
  INVENTORY_SERVICE_PORT: "3005"
  LEDGER_SERVICE_PORT: "3006"
  SUBSCRIPTION_SERVICE_PORT: "3007"
  BILLING_SERVICE_PORT: "3008"
  NOTIFICATION_SERVICE_PORT: "3009"
  ADMIN_SERVICE_PORT: "3010"
  PROFILE_SERVICE_PORT: "3011"
  REFERRAL_SERVICE_PORT: "3012"
  LOG_LEVEL: "info"
  CORS_ORIGIN: "https://app.bahikhata.pro,https://bahikhata.pro"
EOF

  # Apply secrets
  kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: bahi-khata-secrets
  namespace: $NAMESPACE
type: Opaque
stringData:
  DATABASE_URL: "postgresql://${PG_ADMIN_USER}:${PG_ADMIN_PASSWORD}@${PG_HOST:-localhost}:5432/bahi_khata_pro?sslmode=require"
  REDIS_URL: "rediss://:${REDIS_KEY:-changeme}@${REDIS_HOST:-localhost}:6380/0"
  JWT_SECRET: "$(openssl rand -hex 32)"
  JWT_REFRESH_SECRET: "$(openssl rand -hex 32)"
  RAZORPAY_KEY_ID: "${RAZORPAY_KEY_ID:-}"
  RAZORPAY_KEY_SECRET: "${RAZORPAY_KEY_SECRET:-}"
  RAZORPAY_WEBHOOK_SECRET: "${RAZORPAY_WEBHOOK_SECRET:-}"
  WHATSAPP_ACCESS_TOKEN: "${WHATSAPP_ACCESS_TOKEN:-}"
  AZURE_STORAGE_CONNECTION_STRING: "${STORAGE_CONN}"
  PG_ADMIN_PASSWORD: "${PG_ADMIN_PASSWORD}"
EOF

  ok "Namespace, ConfigMap, and Secrets applied."
}

# ---- Deploy all services -----------------------------------
deploy_services() {
  step 8 "Deploying microservices to AKS"

  ACR_LOGIN_SERVER="${ACR_LOGIN_SERVER:-$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)}"

  declare -A PORTS=(
    ["api-gateway"]="3000"
    ["auth-service"]="3001"
    ["business-service"]="3002"
    ["purchase-service"]="3003"
    ["sales-service"]="3004"
    ["inventory-service"]="3005"
    ["ledger-service"]="3006"
    ["subscription-service"]="3007"
    ["billing-service"]="3008"
    ["notification-service"]="3009"
    ["admin-service"]="3010"
    ["profile-service"]="3011"
    ["referral-service"]="3012"
  )

  for svc in $SERVICES; do
    PORT="${PORTS[$svc]}"
    SVC_TYPE="ClusterIP"
    REPLICAS=2
    [[ "$svc" == "api-gateway" ]] && SVC_TYPE="ClusterIP" && REPLICAS=2

    kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $svc
  namespace: $NAMESPACE
  labels:
    app: $svc
spec:
  replicas: $REPLICAS
  selector:
    matchLabels:
      app: $svc
  template:
    metadata:
      labels:
        app: $svc
    spec:
      containers:
        - name: $svc
          image: ${ACR_LOGIN_SERVER}/${svc}:latest
          ports:
            - containerPort: $PORT
          envFrom:
            - secretRef:
                name: bahi-khata-secrets
            - configMapRef:
                name: bahi-khata-config
          env:
            - name: PORT
              value: "$PORT"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: $PORT
            initialDelaySeconds: 20
            periodSeconds: 15
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: $PORT
            initialDelaySeconds: 10
            periodSeconds: 5
      imagePullPolicy: Always
---
apiVersion: v1
kind: Service
metadata:
  name: $svc
  namespace: $NAMESPACE
spec:
  type: $SVC_TYPE
  ports:
    - port: $PORT
      targetPort: $PORT
      protocol: TCP
  selector:
    app: $svc
EOF
    ok "$svc deployed."
  done

  # Deploy frontend
  kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: $NAMESPACE
  labels:
    app: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: ${ACR_LOGIN_SERVER}/frontend:latest
          ports:
            - containerPort: 80
          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "256Mi"
              cpu: "250m"
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: $NAMESPACE
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 80
  selector:
    app: frontend
EOF

  # Deploy website
  kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website
  namespace: $NAMESPACE
  labels:
    app: website
spec:
  replicas: 2
  selector:
    matchLabels:
      app: website
  template:
    metadata:
      labels:
        app: website
    spec:
      containers:
        - name: website
          image: ${ACR_LOGIN_SERVER}/website:latest
          ports:
            - containerPort: 80
          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "256Mi"
              cpu: "250m"
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: website
  namespace: $NAMESPACE
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 80
  selector:
    app: website
EOF

  ok "Frontend and website deployed."
}

# ---- ClusterIssuer for TLS ---------------------------------
apply_cluster_issuer() {
  step 9 "Applying cert-manager ClusterIssuer (Let's Encrypt)"
  kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${ACME_EMAIL:-admin@bahikhata.pro}
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
  ok "ClusterIssuer applied."
}

# ---- Ingress -----------------------------------------------
apply_ingress() {
  step 10 "Applying Ingress rules"
  kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: bahi-khata-ingress
  namespace: $NAMESPACE
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "30"
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-headers: "DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Authorization"
spec:
  tls:
    - hosts:
        - app.bahikhata.pro
        - api.bahikhata.pro
        - bahikhata.pro
        - www.bahikhata.pro
      secretName: bahi-khata-tls
  rules:
    - host: api.bahikhata.pro
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-gateway
                port:
                  number: 3000
    - host: app.bahikhata.pro
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
    - host: bahikhata.pro
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: website
                port:
                  number: 80
    - host: www.bahikhata.pro
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: website
                port:
                  number: 80
EOF
  ok "Ingress applied."
}

# ---- Wait for ingress IP -----------------------------------
get_ingress_ip() {
  step 11 "Waiting for Load Balancer IP (may take 2-5 minutes)"
  local attempts=0
  local max_attempts=30
  local ip=""

  while [ -z "$ip" ] && [ $attempts -lt $max_attempts ]; do
    ip=$(kubectl get svc -n ingress-nginx ingress-nginx-controller \
      --template="{{range .status.loadBalancer.ingress}}{{.ip}}{{end}}" 2>/dev/null || echo "")
    if [ -z "$ip" ]; then
      log "Waiting for external IP... ($((attempts+1))/$max_attempts)"
      sleep 15
    fi
    attempts=$((attempts+1))
  done

  if [ -z "$ip" ]; then
    warn "Could not get external IP automatically. Run: kubectl get svc -n ingress-nginx"
  else
    ok "Load Balancer IP: $ip"
    echo ""
    echo "================================================================"
    echo "  DNS RECORDS TO CREATE:"
    echo "================================================================"
    echo "  Type: A   Name: @           Value: $ip   (bahikhata.pro)"
    echo "  Type: A   Name: www         Value: $ip   (bahikhata.pro)"
    echo "  Type: A   Name: app         Value: $ip   (bahikhata.pro)"
    echo "  Type: A   Name: api         Value: $ip   (bahikhata.pro)"
    echo "================================================================"
    INGRESS_IP="$ip"
  fi
}

# ---- Database migration ------------------------------------
run_db_migration() {
  step 12 "Running database migrations"
  # Run migration as a K8s job
  ACR_LOGIN_SERVER="${ACR_LOGIN_SERVER:-$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)}"

  kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  namespace: $NAMESPACE
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ${ACR_LOGIN_SERVER}/auth-service:latest
          command: ["sh", "-c", "cd /app && npx prisma migrate deploy --schema packages/shared/prisma/schema.prisma"]
          envFrom:
            - secretRef:
                name: bahi-khata-secrets
            - configMapRef:
                name: bahi-khata-config
  backoffLimit: 3
EOF

  log "Waiting for migration job to complete..."
  kubectl wait -n "$NAMESPACE" --for=condition=complete job/db-migrate --timeout=120s || \
    warn "Migration job did not complete in time. Check: kubectl logs -n $NAMESPACE job/db-migrate"

  ok "Database migration done."
}

# ---- Summary -----------------------------------------------
print_summary() {
  echo ""
  echo "================================================================"
  echo "  DEPLOYMENT COMPLETE!"
  echo "================================================================"
  echo ""
  echo "  Resource Group : $RESOURCE_GROUP"
  echo "  AKS Cluster    : $AKS_NAME"
  echo "  ACR            : ${ACR_NAME}.azurecr.io"
  echo ""
  echo "  Endpoints (after DNS propagation):"
  echo "    App       : https://app.bahikhata.pro"
  echo "    API       : https://api.bahikhata.pro"
  echo "    Website   : https://bahikhata.pro"
  echo ""
  echo "  Useful commands:"
  echo "    kubectl get pods -n $NAMESPACE"
  echo "    kubectl get ingress -n $NAMESPACE"
  echo "    kubectl logs -n $NAMESPACE deploy/api-gateway"
  echo ""
  echo "  PG Admin Password saved in K8s secret 'bahi-khata-secrets':"
  echo "    kubectl get secret -n $NAMESPACE bahi-khata-secrets -o jsonpath='{.data.PG_ADMIN_PASSWORD}' | base64 -d"
  echo ""
  echo "================================================================"
}

# ---- MAIN --------------------------------------------------
main() {
  log "Starting Bahi Khata Pro Azure Deployment"
  log "Resource Group: $RESOURCE_GROUP | Location: $LOCATION"
  echo ""

  check_prereqs
  create_resource_group
  deploy_infrastructure
  create_aks
  build_and_push_images
  get_aks_credentials
  install_nginx_ingress
  install_cert_manager
  apply_k8s_base
  deploy_services
  apply_cluster_issuer
  apply_ingress
  get_ingress_ip
  run_db_migration
  print_summary
}

main "$@"
