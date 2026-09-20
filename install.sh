#!/usr/bin/env bash
# ==============================================================================
# NexusControl Enterprise Universal Installer
# Compatible with Ubuntu, Debian, AlmaLinux, RHEL, CentOS, Rocky Linux & Fedora
# ==============================================================================

set -euo pipefail

# Visual Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

banner() {
  echo -e "${CYAN}${BOLD}"
  echo "╔═════════════════════════════════════════════════════════════════════╗"
  echo "║                   NexusControl Enterprise Installer                 ║"
  echo "║            Universal Multi-Distro Installation Engine               ║"
  echo "╚═════════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

banner

# 1. Root Check
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  log_error "This installer must be run as root (or with sudo)."
  exit 1
fi

INSTALL_DIR="/opt/NexusControl"

# 2. Phase 1: Operating System Detection
log_info "Detecting Operating System and Architecture..."

if [ ! -f /etc/os-release ]; then
  log_error "Cannot find /etc/os-release. Unsupported Linux environment."
  exit 1
fi

# Source os-release
# shellcheck disable=SC1091
. /etc/os-release

OS_ID="${ID:-unknown}"
OS_ID_LIKE="${ID_LIKE:-}"
OS_NAME="${NAME:-Linux}"
OS_VERSION="${VERSION_ID:-}"
ARCH="$(uname -m)"

log_info "Detected OS: ${BOLD}${OS_NAME} ${OS_VERSION}${NC} (${ARCH})"

OS_FAMILY="unknown"
COMBINED_ID="${OS_ID} ${OS_ID_LIKE}"

case "${COMBINED_ID}" in
  *ubuntu*|*debian*|*pop*|*mint*|*kali*)
    OS_FAMILY="debian"
    ;;
  *rhel*|*almalinux*|*centos*|*rocky*|*fedora*|*amzn*|*ol*)
    OS_FAMILY="rhel"
    ;;
  *)
    # Fallback to package manager check
    if command -v apt >/dev/null 2>&1; then
      OS_FAMILY="debian"
    elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
      OS_FAMILY="rhel"
    else
      log_warn "Unknown OS family '${COMBINED_ID}'. Defaulting to Debian toolchain."
      OS_FAMILY="debian"
    fi
    ;;
esac

log_success "Normalized OS Family: ${BOLD}${OS_FAMILY^^}${NC}"

# 3. Phase 2: Toolchains & Compilation Dependencies
log_info "Installing development toolchains and build dependencies..."

if [ "${OS_FAMILY}" = "debian" ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    build-essential \
    python3 \
    git \
    tar \
    gzip \
    procps \
    zstd
elif [ "${OS_FAMILY}" = "rhel" ]; then
  PKG_MGR="dnf"
  if ! command -v dnf >/dev/null 2>&1; then
    PKG_MGR="yum"
  fi
  ${PKG_MGR} install -y \
    curl \
    ca-certificates \
    gcc \
    gcc-c++ \
    make \
    python3 \
    git \
    tar \
    gzip \
    procps-ng \
    zstd
fi

log_success "Compilation toolchains successfully installed."

# 4. Phase 3: Node.js (v22) Verification & NodeSource Setup
log_info "Verifying Node.js runtime environment..."

NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  CURRENT_NODE_VER="$(node -v | tr -d 'v' | cut -d'.' -f1)"
  if [ "${CURRENT_NODE_VER}" -ge 20 ]; then
    log_success "Node.js v$(node -v) is already installed."
    NEED_NODE=0
  else
    log_warn "Detected Node.js v$(node -v) which is below v20 LTS. Upgrading to Node.js 22 LTS..."
  fi
fi

if [ "${NEED_NODE}" -eq 1 ]; then
  log_info "Pulling Node.js v22 LTS via NodeSource..."
  if [ "${OS_FAMILY}" = "debian" ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif [ "${OS_FAMILY}" = "rhel" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    ${PKG_MGR} install -y nodejs
  fi
  log_success "Installed Node.js v$(node -v) and npm v$(npm -v)."
fi

# 5. Phase 4: Application Staging & Directory Setup
log_info "Setting up NexusControl application directory at ${INSTALL_DIR}..."

mkdir -p "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}/.trash"
mkdir -p "${INSTALL_DIR}/.uploads"
chmod 755 "${INSTALL_DIR}/.trash" "${INSTALL_DIR}/.uploads"

# Check if script is executed from inside /opt/NexusControl
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "${SCRIPT_DIR}" != "${INSTALL_DIR}" ] && [ ! -f "${INSTALL_DIR}/backend/server.js" ]; then
  if [ -f "${SCRIPT_DIR}/backend/server.js" ]; then
    log_info "Copying project files from ${SCRIPT_DIR} to ${INSTALL_DIR}..."
    cp -r "${SCRIPT_DIR}/." "${INSTALL_DIR}/"
  else
    log_error "Could not locate NexusControl source repository. Please run from the repository root."
    exit 1
  fi
fi

cd "${INSTALL_DIR}"

# Setup .env if missing
if [ ! -f "${INSTALL_DIR}/.env" ]; then
  log_info "Generating production .env configuration..."
  RANDOM_SECRET="$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)"
  cat > "${INSTALL_DIR}/.env" <<EOF
PORT=8787
HOST=127.0.0.1
JWT_SECRET=${RANDOM_SECRET}
MASTER_PASSWORD=admin
NODE_ENV=production
EOF
  chmod 600 "${INSTALL_DIR}/.env"
  log_success "Generated secure .env file."
fi

# 6. Phase 5: Compile Dependencies (node-pty, native sqlite3) & Build Frontend
log_info "Compiling backend native modules (node-pty, sqlite)..."
cd "${INSTALL_DIR}/backend"
npm install --production=false
if [ -d "node_modules/node-pty" ]; then
  npx --no-install node-gyp rebuild --directory=node_modules/node-pty || true
fi
log_success "Backend dependencies compiled successfully."

log_info "Verifying and building frontend static distribution..."
cd "${INSTALL_DIR}/frontend"
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run build
log_success "Frontend production bundle compiled to ${INSTALL_DIR}/frontend/dist."

# 7. Phase 6: Systemd Service Installation & Activation
log_info "Configuring systemd service supervisor..."

NODE_BIN="$(command -v node)"

cat > /etc/systemd/system/nexuscontrol.service <<EOF
[Unit]
Description=NexusControl VPS Monitoring & Operations Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_BIN} ${INSTALL_DIR}/backend/server.js
Restart=always
RestartSec=5
EnvironmentFile=${INSTALL_DIR}/.env
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nexuscontrol

[Install]
WantedBy=multi-user.target
EOF

chmod 644 /etc/systemd/system/nexuscontrol.service
systemctl daemon-reload
systemctl enable nexuscontrol
systemctl restart nexuscontrol

log_success "nexuscontrol.service enabled and restarted."

# 8. Phase 7: Health Verification
log_info "Verifying daemon health check at http://127.0.0.1:8787/health..."
HEALTHY=0
for i in {1..10}; do
  if curl -s http://127.0.0.1:8787/health | grep -q '"status":"ok"'; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "${HEALTHY}" -eq 1 ]; then
  echo ""
  log_success "NexusControl is LIVE and operational!"
  echo -e "${GREEN}${BOLD}"
  echo "====================================================================="
  echo " NexusControl Dashboard Deployed Successfully!"
  echo " Local endpoint:   http://127.0.0.1:8787"
  echo " System Service:   systemctl status nexuscontrol"
  echo " Service Logs:     journalctl -u nexuscontrol -f"
  echo " Configuration:    ${INSTALL_DIR}/.env"
  echo "====================================================================="
  echo -e "${NC}"
else
  log_warn "Health check timed out. Please check service logs: journalctl -u nexuscontrol -e"
fi
