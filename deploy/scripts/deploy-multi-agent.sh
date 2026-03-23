#!/usr/bin/env bash
###############################################################################
# DTE Level 5+ Multi-Agent Deployment Script
#
# Deploys 4 DTE instances in System 5 tetradic topology:
#   Perceiver → Reasoner → Actor → Reflector
#
# Prerequisites:
#   - Docker + Docker Compose v2
#   - NVIDIA GPU (optional, for Lucy acceleration)
#   - Neon PostgreSQL project (dte-hypergraph-memory)
#
# Usage:
#   ./deploy-multi-agent.sh --neon-url <URL> [--gpu] [--model-url <URL>]
#
# Environment:
#   DTE_NEON_URL     — Neon PostgreSQL connection string
#   LUCY_MODEL_URL   — URL to download Lucy GGUF model
###############################################################################

set -euo pipefail

# ─── Defaults ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$DEPLOY_DIR")"
DOCKER_DIR="$DEPLOY_DIR/docker"

GPU_MODE=false
NEON_URL="${DTE_NEON_URL:-}"
MODEL_URL="${LUCY_MODEL_URL:-https://huggingface.co/drzo/lucy-dte/resolve/main/lucy_128k-Q4_K_M.gguf}"
MODEL_FILE="lucy_128k-Q4_K_M.gguf"
COMPOSE_FILE="docker-compose.multi-agent.yml"

# ─── Parse Arguments ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --gpu)        GPU_MODE=true; shift ;;
    --neon-url)   NEON_URL="$2"; shift 2 ;;
    --model-url)  MODEL_URL="$2"; shift 2 ;;
    --model-file) MODEL_FILE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 --neon-url <URL> [--gpu] [--model-url <URL>]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$NEON_URL" ]]; then
  echo "ERROR: --neon-url is required (or set DTE_NEON_URL)"
  exit 1
fi

# ─── Banner ───────────────────────────────────────────────────
cat << 'EOF'
╔═══════════════════════════════════════════════════════════════╗
║  DTE Level 5+ Multi-Agent Deployment                        ║
║  System 5 Tetradic Topology                                 ║
║                                                             ║
║  Perceiver ←→ Reasoner                                      ║
║      ↕    ╲  ╱    ↕                                         ║
║  Reflector ←→ Actor                                         ║
║                                                             ║
║  Shared: Lucy GGUF | Neon pgvector | Prometheus | Grafana   ║
╚═══════════════════════════════════════════════════════════════╝
EOF

echo ""
echo "Configuration:"
echo "  GPU Mode:    $GPU_MODE"
echo "  Neon URL:    ${NEON_URL:0:50}..."
echo "  Model URL:   ${MODEL_URL:0:50}..."
echo "  Model File:  $MODEL_FILE"
echo ""

# ─── Step 1: Create .env file ────────────────────────────────
echo "→ Step 1: Creating .env configuration..."
cat > "$DOCKER_DIR/.env" << ENVEOF
# DTE Level 5+ Multi-Agent Configuration
DTE_NEON_URL=$NEON_URL
DTE_EMBEDDING_DIM=384

# Lucy GGUF
LUCY_MODEL_FILE=$MODEL_FILE
LUCY_CTX_SIZE=32768
LUCY_GPU_LAYERS=$( [[ "$GPU_MODE" == true ]] && echo 99 || echo 0 )
LUCY_THREADS=8
LUCY_PORT=8081

# Ports
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_PASSWORD=dte-multi-agent
ENVEOF

echo "  ✓ .env created"

# ─── Step 2: Download Lucy model ─────────────────────────────
echo "→ Step 2: Downloading Lucy GGUF model..."
MODELS_DIR="$DOCKER_DIR/models"
mkdir -p "$MODELS_DIR"

if [[ ! -f "$MODELS_DIR/$MODEL_FILE" ]]; then
  echo "  Downloading from $MODEL_URL..."
  curl -L -o "$MODELS_DIR/$MODEL_FILE" "$MODEL_URL" || {
    echo "  WARNING: Model download failed. You can manually place the model at:"
    echo "  $MODELS_DIR/$MODEL_FILE"
  }
else
  echo "  ✓ Model already exists"
fi

# ─── Step 3: Build Docker images ─────────────────────────────
echo "→ Step 3: Building Docker images..."
cd "$DOCKER_DIR"

# Remove GPU deploy section if not using GPU
if [[ "$GPU_MODE" != true ]]; then
  echo "  (CPU mode — removing GPU resource reservations)"
  # Docker Compose will ignore missing GPU gracefully with deploy override
fi

docker compose -f "$COMPOSE_FILE" build --parallel 2>/dev/null || \
  docker compose -f "$COMPOSE_FILE" build

echo "  ✓ Images built"

# ─── Step 4: Start the multi-agent topology ──────────────────
echo "→ Step 4: Starting multi-agent topology..."
docker compose -f "$COMPOSE_FILE" up -d

echo "  ✓ All services started"

# ─── Step 5: Wait for health checks ──────────────────────────
echo "→ Step 5: Waiting for services to become healthy..."
AGENTS=("dte-perceiver" "dte-reasoner" "dte-actor" "dte-reflector")
MAX_WAIT=180
WAITED=0

for agent in "${AGENTS[@]}"; do
  echo -n "  Waiting for $agent..."
  while [[ $WAITED -lt $MAX_WAIT ]]; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$agent" 2>/dev/null || echo "starting")
    if [[ "$STATUS" == "healthy" ]]; then
      echo " ✓"
      break
    fi
    sleep 5
    WAITED=$((WAITED + 5))
    echo -n "."
  done
  if [[ $WAITED -ge $MAX_WAIT ]]; then
    echo " ⚠ timeout (may still be starting)"
  fi
done

# ─── Step 6: Verify A2A mesh connectivity ────────────────────
echo "→ Step 6: Verifying A2A mesh connectivity..."
for port in 9470 9471 9472 9473; do
  HEALTH=$(curl -sf "http://localhost:$port/a2a/health" 2>/dev/null || echo '{"status":"unreachable"}')
  echo "  Port $port: $HEALTH"
done

# ─── Summary ─────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  Deployment Complete!                                       ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Service          │ Port  │ URL                             ║"
echo "║──────────────────────────────────────────────────────────────║"
echo "║  Lucy (llama.cpp) │ 8081  │ http://localhost:8081/health    ║"
echo "║  DTE Perceiver    │ 5173  │ http://localhost:5173           ║"
echo "║  DTE Reasoner     │ 5174  │ http://localhost:5174           ║"
echo "║  DTE Actor        │ 5175  │ http://localhost:5175           ║"
echo "║  DTE Reflector    │ 5176  │ http://localhost:5176           ║"
echo "║  A2A Perceiver    │ 9470  │ http://localhost:9470/a2a/peers ║"
echo "║  A2A Reasoner     │ 9471  │ http://localhost:9471/a2a/peers ║"
echo "║  A2A Actor        │ 9472  │ http://localhost:9472/a2a/peers ║"
echo "║  A2A Reflector    │ 9473  │ http://localhost:9473/a2a/peers ║"
echo "║  Prometheus       │ 9090  │ http://localhost:9090           ║"
echo "║  Grafana          │ 3001  │ http://localhost:3001           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Grafana login: admin / dte-multi-agent"
echo ""
echo "To view logs:  docker compose -f $COMPOSE_FILE logs -f"
echo "To stop:       docker compose -f $COMPOSE_FILE down"
