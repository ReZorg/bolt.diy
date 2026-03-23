#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# bolt.diy × DTE — Level 5 (True Autonomy) VM Deployment Script
# ═══════════════════════════════════════════════════════════════════
#
# Deploys the full Level 5 stack on a fresh VM:
#   1. System dependencies (Node.js, pnpm, Docker, cmake)
#   2. llama.cpp build (CPU or GPU)
#   3. Lucy GGUF model download
#   4. bolt.diy build
#   5. State directories
#   6. Systemd services (lucy, bolt-cognitive, telemetry)
#   7. Prometheus + Grafana (optional Docker)
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/ReZorg/bolt.diy/main/deploy/scripts/deploy-level5.sh | bash
#
#   Or with options:
#   ./deploy-level5.sh --gpu --model-url https://huggingface.co/drzo/lucy-dte/resolve/main/lucy_128k-Q4_K_M.gguf
#
# Options:
#   --gpu                 Build llama.cpp with CUDA support
#   --model-url URL       Download Lucy GGUF from this URL
#   --home DIR            Set DTE home directory (default: ~/dte-level5)
#   --skip-monitoring     Skip Prometheus + Grafana installation
#   --docker-mode         Use Docker Compose instead of systemd
#
# ═══════════════════════════════════════════════════════════════════

# ── Parse Arguments ────────────────────────────────────────────────
USE_GPU=false
LUCY_MODEL_URL=""
DTE_HOME="${HOME}/dte-level5"
SKIP_MONITORING=false
DOCKER_MODE=false
LUCY_CTX_SIZE=32768

while [[ $# -gt 0 ]]; do
  case $1 in
    --gpu)          USE_GPU=true; shift ;;
    --model-url)    LUCY_MODEL_URL="$2"; shift 2 ;;
    --home)         DTE_HOME="$2"; shift 2 ;;
    --skip-monitoring) SKIP_MONITORING=true; shift ;;
    --docker-mode)  DOCKER_MODE=true; shift ;;
    --ctx-size)     LUCY_CTX_SIZE="$2"; shift 2 ;;
    *)              echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  bolt.diy × DTE — Level 5 Deployment                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Home:     ${DTE_HOME}"
echo "║  GPU:      ${USE_GPU}"
echo "║  Docker:   ${DOCKER_MODE}"
echo "║  Monitor:  $([ "$SKIP_MONITORING" = true ] && echo "skip" || echo "install")"
echo "╚══════════════════════════════════════════════════════════╝"

mkdir -p "$DTE_HOME"

# ─── 1. System Dependencies ───────────────────────────────────────
echo ""
echo "[1/7] Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  build-essential cmake git curl wget jq \
  python3 python3-pip

# Node.js 22
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  echo "  Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi

# pnpm
if ! command -v pnpm &>/dev/null; then
  echo "  Installing pnpm..."
  npm install -g pnpm
fi

# Docker (for monitoring or docker-mode)
if ! command -v docker &>/dev/null; then
  echo "  Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$(whoami)"
fi

# NVIDIA Container Toolkit (if GPU mode)
if [ "$USE_GPU" = true ]; then
  if ! command -v nvidia-smi &>/dev/null; then
    echo "  ⚠ GPU mode requested but nvidia-smi not found."
    echo "  Install NVIDIA drivers first, then re-run."
    exit 1
  fi
  if ! dpkg -l | grep -q nvidia-container-toolkit; then
    echo "  Installing NVIDIA Container Toolkit..."
    distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L "https://nvidia.github.io/libnvidia-container/${distribution}/libnvidia-container.list" | \
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
      sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt-get update -qq
    sudo apt-get install -y -qq nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
  fi
fi

# ─── 2. Build llama.cpp ───────────────────────────────────────────
echo ""
echo "[2/7] Building llama.cpp..."
LLAMA_DIR="${DTE_HOME}/llama.cpp"
if [ ! -d "$LLAMA_DIR" ]; then
  git clone --depth 1 https://github.com/ggerganov/llama.cpp.git "$LLAMA_DIR"
fi
cd "$LLAMA_DIR"
git pull origin master --depth 1 2>/dev/null || true

CMAKE_ARGS="-DLLAMA_NATIVE=ON"
if [ "$USE_GPU" = true ]; then
  echo "  GPU mode enabled — building with CUDA support"
  CMAKE_ARGS="$CMAKE_ARGS -DGGML_CUDA=ON"
fi

cmake -B build $CMAKE_ARGS 2>&1 | tail -5
cmake --build build --config Release -j"$(nproc)" 2>&1 | tail -5
sudo cp build/bin/llama-server /usr/local/bin/llama-server
echo "  llama-server installed: $(llama-server --version 2>&1 | head -1 || echo 'OK')"

# ─── 3. Download Lucy Model ───────────────────────────────────────
echo ""
echo "[3/7] Setting up Lucy model..."
MODELS_DIR="${DTE_HOME}/models"
mkdir -p "$MODELS_DIR"

if [ ! -f "$MODELS_DIR/lucy_128k-Q4_K_M.gguf" ]; then
  if [ -n "$LUCY_MODEL_URL" ]; then
    echo "  Downloading from $LUCY_MODEL_URL..."
    wget -q --show-progress -O "$MODELS_DIR/lucy_128k-Q4_K_M.gguf" "$LUCY_MODEL_URL"
  else
    echo "  ⚠ No model URL provided."
    echo "  Place lucy_128k-Q4_K_M.gguf in $MODELS_DIR/"
    echo "  Or re-run with: --model-url https://huggingface.co/drzo/lucy-dte/resolve/main/lucy_128k-Q4_K_M.gguf"
  fi
else
  echo "  Lucy model already present: $(ls -lh "$MODELS_DIR/lucy_128k-Q4_K_M.gguf" | awk '{print $5}')"
fi

# ─── 4. Clone and Build bolt.diy ──────────────────────────────────
echo ""
echo "[4/7] Building bolt.diy with cognitive modules..."
BOLT_DIR="${DTE_HOME}/bolt.diy"
if [ ! -d "$BOLT_DIR" ]; then
  git clone https://github.com/ReZorg/bolt.diy.git "$BOLT_DIR"
fi
cd "$BOLT_DIR"
git pull origin main

pnpm install
pnpm run build

echo "  bolt.diy built successfully"

# ─── 5. Create State Directories ──────────────────────────────────
echo ""
echo "[5/7] Creating state directories..."
mkdir -p "${DTE_HOME}/state"/{identity,reservoir,memory,modifications,logs}

# ─── 6. Install Systemd Services ──────────────────────────────────
echo ""
echo "[6/7] Installing systemd services..."

if [ "$DOCKER_MODE" = true ]; then
  echo "  Docker mode — skipping systemd, use docker compose instead"
  # Copy docker-compose and config
  cp -r "${BOLT_DIR}/deploy/docker/docker-compose.level5.yml" "${DTE_HOME}/docker-compose.yml"
  cp "${BOLT_DIR}/deploy/docker/.env.example" "${DTE_HOME}/.env"
  ln -sf "$MODELS_DIR" "${DTE_HOME}/models" 2>/dev/null || true
  echo "  Docker Compose ready at ${DTE_HOME}/docker-compose.yml"
  echo "  Edit ${DTE_HOME}/.env then run: cd ${DTE_HOME} && docker compose up -d"
else
  # Lucy systemd service
  cat > /tmp/dte-lucy.service << SERVICEEOF
[Unit]
Description=DTE Level 5 — Lucy Inference Server (llama.cpp)
After=network.target
Wants=network.target

[Service]
Type=simple
User=$(whoami)
ExecStart=/usr/local/bin/llama-server \\
  --model ${MODELS_DIR}/lucy_128k-Q4_K_M.gguf \\
  --host 127.0.0.1 \\
  --port 8081 \\
  --ctx-size ${LUCY_CTX_SIZE} \\
  --threads $(( $(nproc) / 2 )) \\
  --batch-size 512 \\
  --n-predict 2048 \\
  --parallel 1 \\
  --cont-batching \\
  --flash-attn \\
  --mlock \\
  --log-disable
Restart=always
RestartSec=10
LimitNOFILE=65536
Environment=GGML_METAL_LOG_LEVEL=0

[Install]
WantedBy=multi-user.target
SERVICEEOF
  sudo mv /tmp/dte-lucy.service /etc/systemd/system/dte-lucy.service

  # bolt.diy cognitive daemon service
  cat > /tmp/dte-bolt-cognitive.service << SERVICEEOF
[Unit]
Description=DTE Level 5 — bolt.diy Cognitive Runtime
After=network.target dte-lucy.service
Wants=dte-lucy.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${BOLT_DIR}
ExecStart=/usr/bin/node node_modules/.bin/wrangler pages dev ./build/client --ip 0.0.0.0 --port 5173 --no-show-interactive-dev-session
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=RUNNING_IN_DOCKER=false
Environment=LUCY_BASE_URL=http://127.0.0.1:8081
Environment=LUCY_MODEL_NAME=lucy_128k-Q4_K_M
Environment=IDENTITY_STATE_DIR=${DTE_HOME}/state/identity
Environment=RESERVOIR_STATE_DIR=${DTE_HOME}/state/reservoir
Environment=MEMORY_STATE_DIR=${DTE_HOME}/state/memory
Environment=MODIFICATION_LOG_DIR=${DTE_HOME}/state/modifications
Environment=ENABLE_AUTONOMY_PIPELINE=true
Environment=ENABLE_ECHOBEATS=true
Environment=ENABLE_ONLINE_LEARNING=true
Environment=ENABLE_SELF_MODIFICATION=true
Environment=ENABLE_PROACTIVE_PERCEPTION=true
Environment=TELEMETRY_ENABLED=true
Environment=TELEMETRY_PORT=9464
Environment=LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
SERVICEEOF
  sudo mv /tmp/dte-bolt-cognitive.service /etc/systemd/system/dte-bolt-cognitive.service

  sudo systemctl daemon-reload
  sudo systemctl enable dte-lucy dte-bolt-cognitive
  echo "  Systemd services installed and enabled"
fi

# ─── 7. Monitoring Stack (Prometheus + Grafana) ───────────────────
echo ""
if [ "$SKIP_MONITORING" = true ]; then
  echo "[7/7] Skipping monitoring stack (--skip-monitoring)"
else
  echo "[7/7] Deploying monitoring stack (Prometheus + Grafana)..."
  MONITOR_DIR="${DTE_HOME}/monitoring"
  mkdir -p "$MONITOR_DIR"

  # Copy config
  cp -r "${BOLT_DIR}/deploy/config" "$MONITOR_DIR/"

  # Create monitoring docker-compose
  cat > "${MONITOR_DIR}/docker-compose.yml" << 'MONITOREOF'
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: dte-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./config/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
    extra_hosts:
      - "host.docker.internal:host-gateway"
    network_mode: host

  grafana:
    image: grafana/grafana:10.4.0
    container_name: dte-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    volumes:
      - ./config/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./config/grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: dte-level5
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH: /var/lib/grafana/dashboards/dte-system5.json

volumes:
  prometheus-data:
  grafana-data:
MONITOREOF

  # Update prometheus config for host networking
  sed -i "s/bolt:9464/localhost:9464/g" "${MONITOR_DIR}/config/prometheus.yml"
  sed -i "s/lucy:8080/localhost:8081/g" "${MONITOR_DIR}/config/prometheus.yml"
  sed -i "s/prometheus:9090/localhost:9090/g" "${MONITOR_DIR}/config/grafana/provisioning/datasources/prometheus.yml"

  cd "$MONITOR_DIR"
  docker compose up -d 2>/dev/null || echo "  ⚠ Docker compose failed — start manually: cd $MONITOR_DIR && docker compose up -d"
fi

# ─── Summary ──────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  DTE Level 5 — Deployment Complete                      ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Lucy Server:    http://127.0.0.1:8081                  ║"
echo "║  bolt.diy:       http://127.0.0.1:5173                  ║"
echo "║  Telemetry:      http://127.0.0.1:9464/metrics          ║"
echo "║  Prometheus:     http://127.0.0.1:9090                  ║"
echo "║  Grafana:        http://127.0.0.1:3001 (admin/dte-level5)║"
echo "║  State Dir:      ${DTE_HOME}/state/                     ║"
echo "║  Models Dir:     ${MODELS_DIR}/                         ║"
echo "╠══════════════════════════════════════════════════════════╣"
if [ "$DOCKER_MODE" = true ]; then
echo "║  Start:   cd ${DTE_HOME} && docker compose up -d        ║"
echo "║  Logs:    docker compose logs -f                        ║"
echo "║  Stop:    docker compose down                           ║"
else
echo "║  Start:   sudo systemctl start dte-lucy                 ║"
echo "║           sudo systemctl start dte-bolt-cognitive        ║"
echo "║  Logs:    journalctl -u dte-lucy -f                     ║"
echo "║           journalctl -u dte-bolt-cognitive -f            ║"
echo "║  Stop:    sudo systemctl stop dte-bolt-cognitive         ║"
echo "║           sudo systemctl stop dte-lucy                   ║"
fi
echo "╚══════════════════════════════════════════════════════════╝"
