#!/usr/bin/env bash
# ==============================================================================
# NexusControl Enterprise Automated Deployment & Installation Engine
# Supported: Ubuntu 22.04/24.04/26.04+, Debian 11/12+, AlmaLinux/RHEL/Rocky 9/10+
# ==============================================================================

set -euo pipefail

# ANSI Color Palette
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
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
  echo "╔═════════════════════════════════════════════════════════════════════════════╗"
  echo "║                     NexusControl Enterprise Installer                       ║"
  echo "║             Automated Universal Host & Dashboard Deployment                 ║"
  echo "╚═════════════════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

banner

# ------------------------------------------------------------------------------
# 0. Root Privilege Check
# ------------------------------------------------------------------------------
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  log_error "This installer must be run as root (or with sudo)."
  exit 1
fi

INSTALL_DIR="/opt/NexusControl"
BACKUP_DIR="/opt/nexus_backups"

# ------------------------------------------------------------------------------
# Phase 1: OS Detection & Package Management
# ------------------------------------------------------------------------------
log_info "Phase 1: Detecting Operating System and Architecture..."

if [ ! -f /etc/os-release ]; then
  log_error "Cannot find /etc/os-release. Unsupported Linux environment."
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release

OS_ID="${ID:-unknown}"
OS_ID_LIKE="${ID_LIKE:-}"
OS_NAME="${NAME:-Linux}"
OS_VERSION="${VERSION_ID:-}"
OS_CODENAME="${VERSION_CODENAME:-}"
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
    if command -v apt-get >/dev/null 2>&1; then
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

# Core Dependencies Installation
log_info "Installing core runtime packages (git, curl, nginx, zstd, wireguard)..."

if [ "${OS_FAMILY}" = "debian" ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    git \
    nginx \
    zstd \
    wireguard \
    wireguard-tools \
    build-essential \
    python3 \
    tar \
    gzip \
    procps
elif [ "${OS_FAMILY}" = "rhel" ]; then
  PKG_MGR="dnf"
  if ! command -v dnf >/dev/null 2>&1; then
    PKG_MGR="yum"
  fi
  ${PKG_MGR} install -y epel-release || true
  ${PKG_MGR} install -y \
    curl \
    ca-certificates \
    git \
    nginx \
    zstd \
    wireguard-tools \
    gcc \
    gcc-c++ \
    make \
    python3 \
    tar \
    gzip \
    procps-ng
fi

log_success "Core dependencies installed successfully."

# Node.js Smart Version Check & NodeSource Setup
log_info "Configuring Node.js runtime environment..."

if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    echo "Detected existing Node.js version: v$NODE_VERSION"
    
    if [ "$NODE_VERSION" -ge 22 ]; then
        echo "✅ Compatible Node.js environment found. Skipping NodeSource installation."
    else
        echo "⚠️  WARNING: Node.js v$NODE_VERSION is too old."
        echo "NexusControl requires Node.js v22 or higher for native SQLite support."
        
        # Prompt the user for permission to upgrade
        read -p "Do you want the installer to upgrade your server to Node.js 22 LTS now? (Note: This may affect other apps running on this server) [y/N]: " UPGRADE_CONFIRM
        
        case "$UPGRADE_CONFIRM" in
            [yY][eE][sS]|[yY])
                echo "Proceeding with Node.js 22 LTS upgrade..."
                if [ "${OS_FAMILY}" = "debian" ]; then
                    export DEBIAN_FRONTEND=noninteractive
                    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
                    apt-get install -y nodejs
                elif [ "${OS_FAMILY}" = "rhel" ]; then
                    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
                    ${PKG_MGR} install -y nodejs
                fi
                log_success "Upgraded to Node.js $(node -v) and npm v$(npm -v)."
                ;;
            *)
                echo "❌ ERROR: Installation halted by user. NexusControl requires at least Node.js v22."
                exit 1
                ;;
        esac
    fi
else
    echo "Node.js not found. Installing Node.js 22 LTS..."
    if [ "${OS_FAMILY}" = "debian" ]; then
        export DEBIAN_FRONTEND=noninteractive
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y nodejs
    elif [ "${OS_FAMILY}" = "rhel" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
        ${PKG_MGR} install -y nodejs
    fi
    log_success "Installed Node.js $(node -v) and npm v$(npm -v)."
fi

# Docker Engine Installation & Activation
log_info "Configuring Docker Engine..."
if command -v docker >/dev/null 2>&1; then
  log_success "Docker Engine is already installed ($(docker --version))."
else
  log_info "Adding official Docker repository and installing docker-ce..."
  if [ "${OS_FAMILY}" = "debian" ]; then
    export DEBIAN_FRONTEND=noninteractive
    install -m 0755 -d /etc/apt/keyrings
    DOCKER_OS="${OS_ID}"
    if [ "${DOCKER_OS}" != "ubuntu" ] && [ "${DOCKER_OS}" != "debian" ]; then
      DOCKER_OS="ubuntu"
    fi
    curl -fsSL "https://download.docker.com/linux/${DOCKER_OS}/gpg" -o /etc/apt/keyrings/docker.asc 2>/dev/null || \
      curl -fsSL "https://download.docker.com/linux/ubuntu/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    DOCKER_CODENAME="${OS_CODENAME}"
    if [ -z "${DOCKER_CODENAME}" ]; then
      DOCKER_CODENAME="jammy"
    fi

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${DOCKER_OS} ${DOCKER_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io
  elif [ "${OS_FAMILY}" = "rhel" ]; then
    ${PKG_MGR} install -y yum-utils || true
    if command -v dnf-3 >/dev/null 2>&1 || command -v dnf >/dev/null 2>&1; then
      dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo || true
    else
      yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo || true
    fi
    ${PKG_MGR} install -y docker-ce docker-ce-cli containerd.io
  fi
fi

systemctl daemon-reload
systemctl enable docker
systemctl start docker || true
log_success "Docker Engine active and enabled."

# ------------------------------------------------------------------------------
# Phase 2: Directory Scaffolding & Security
# ------------------------------------------------------------------------------
log_info "Phase 2: Scaffolding Application Directories and Hardening..."

mkdir -p "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}/.trash"
mkdir -p "${INSTALL_DIR}/.uploads"
chmod 755 "${INSTALL_DIR}/.trash" "${INSTALL_DIR}/.uploads"

# Verify or copy repository files to /opt/NexusControl
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "${SCRIPT_DIR}" != "${INSTALL_DIR}" ]; then
  if [ -f "${SCRIPT_DIR}/backend/server.js" ]; then
    log_info "Deploying project files from ${SCRIPT_DIR} to ${INSTALL_DIR}..."
    cp -r "${SCRIPT_DIR}/." "${INSTALL_DIR}/"
  elif [ ! -f "${INSTALL_DIR}/backend/server.js" ]; then
    log_info "Cloning NexusControl source repository to ${INSTALL_DIR}..."
    git clone https://github.com/NexusControl/NexusControl.git "${INSTALL_DIR}" || {
      log_warn "Git clone fallback: ensure repository is placed in ${INSTALL_DIR}"
    }
  fi
fi

# Secure Backup Storage
log_info "Initializing secure root-only backup directory at ${BACKUP_DIR}..."
mkdir -p "${BACKUP_DIR}"
chmod 0700 "${BACKUP_DIR}"
log_success "Enforced 0700 permissions on ${BACKUP_DIR}."

# Network Tuning for WireGuard VPN
log_info "Enabling IPv4 packet forwarding for WireGuard VPN routing..."
mkdir -p /etc/sysctl.d
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-nexuscontrol-vpn.conf
sysctl -p /etc/sysctl.d/99-nexuscontrol-vpn.conf 2>/dev/null || sysctl -w net.ipv4.ip_forward=1 >/dev/null
log_success "Kernel IPv4 forwarding active."

# ------------------------------------------------------------------------------
# Phase 3: Cryptographic Environment Generation
# ------------------------------------------------------------------------------
log_info "Phase 3: Generating Cryptographic Secrets and Environment..."

ENV_FILE="${INSTALL_DIR}/backend/.env"
GLOBAL_ENV_FILE="${INSTALL_DIR}/.env"
ADMIN_PASSWORD=""
IS_NEW_ENV=0

if [ ! -f "${ENV_FILE}" ]; then
  # Check if legacy root .env exists
  if [ -f "${GLOBAL_ENV_FILE}" ]; then
    log_info "Migrating configuration from existing ${GLOBAL_ENV_FILE} to ${ENV_FILE}..."
    cp "${GLOBAL_ENV_FILE}" "${ENV_FILE}"
    ADMIN_PASSWORD="$(grep -E '^ADMIN_PASSWORD=' "${ENV_FILE}" | cut -d'=' -f2- | tr -d '\"'\'' ' || true)"
  fi
fi

if [ ! -f "${ENV_FILE}" ]; then
  IS_NEW_ENV=1
  log_info "Generating cryptographically secure random environment secrets..."
  
  # 32-byte JWT Secret
  JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32)"
  
  # 32-byte Backup Encryption Key
  BACKUP_ENCRYPTION_KEY="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32)"
  
  # 12-char Random Alphanumeric Admin Password
  ADMIN_PASSWORD="$(openssl rand -base64 16 2>/dev/null | tr -dc 'a-zA-Z0-9' | head -c 12)"
  if [ -z "${ADMIN_PASSWORD}" ] || [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
    ADMIN_PASSWORD="$(head -c 32 /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 12)"
  fi

  cat > "${ENV_FILE}" <<EOF
PORT=8787
HOST=127.0.0.1
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
BACKUP_ENCRYPTION_KEY=${BACKUP_ENCRYPTION_KEY}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

  log_success "Generated new cryptographic environment."
else
  if [ -z "${ADMIN_PASSWORD}" ]; then
    ADMIN_PASSWORD="$(grep -E '^ADMIN_PASSWORD=' "${ENV_FILE}" | cut -d'=' -f2- | tr -d '\"'\'' ' || true)"
  fi
  if [ -z "${ADMIN_PASSWORD}" ]; then
    ADMIN_PASSWORD="[Configured in .env]"
  fi
  log_info "Retaining existing environment from ${ENV_FILE}."
fi

chmod 0600 "${ENV_FILE}"
ln -sf "${ENV_FILE}" "${GLOBAL_ENV_FILE}" 2>/dev/null || true
log_success "Secured environment configuration (chmod 0600)."

# ------------------------------------------------------------------------------
# Phase 4: Application Build & Systemd Daemon
# ------------------------------------------------------------------------------
log_info "Phase 4: Resolving Dependencies & Compiling Production Builds..."

# Backend Dependencies
cd "${INSTALL_DIR}/backend"
log_info "Installing backend dependencies..."
if command -v npm >/dev/null 2>&1; then
  npm install-scripts approve bcrypt node-pty 2>/dev/null || true
fi
npm install
if [ -d "node_modules/node-pty" ]; then
  npx --no-install node-gyp rebuild --directory=node_modules/node-pty 2>/dev/null || true
fi
if [ -d "node_modules/bcrypt" ]; then
  npx --no-install node-gyp rebuild --directory=node_modules/bcrypt 2>/dev/null || true
fi
log_success "Backend dependencies resolved."

# Frontend Compilation
cd "${INSTALL_DIR}/frontend"
log_info "Building frontend static assets with Vite..."
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run build
log_success "Frontend compiled to ${INSTALL_DIR}/frontend/dist."

# Systemd Service Creation
log_info "Configuring systemd service (/etc/systemd/system/nexuscontrol.service)..."
NODE_BIN="$(command -v node || echo "/usr/bin/node")"

cat > /etc/systemd/system/nexuscontrol.service <<EOF
[Unit]
Description=NexusControl Enterprise Daemon
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}/backend
ExecStart=${NODE_BIN} server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=-${INSTALL_DIR}/backend/.env
EnvironmentFile=-${INSTALL_DIR}/.env
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
log_success "nexuscontrol.service enabled and started."

# ------------------------------------------------------------------------------
# Phase 5: Nginx Reverse Proxy
# ------------------------------------------------------------------------------
log_info "Phase 5: Configuring Nginx Reverse Proxy with WebSocket Support..."

# Remove default Debian/Ubuntu/RHEL welcome pages to prevent port 80 collisions
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true

NGINX_TARGET_CONF=""
if [ -d /etc/nginx/conf.d ]; then
  NGINX_TARGET_CONF="/etc/nginx/conf.d/nexuscontrol.conf"
elif [ -d /etc/nginx/sites-available ]; then
  NGINX_TARGET_CONF="/etc/nginx/sites-available/nexuscontrol.conf"
fi

if [ -n "${NGINX_TARGET_CONF}" ]; then
  cat > "${NGINX_TARGET_CONF}" <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }
}
EOF

  if [ -d /etc/nginx/sites-enabled ] && [ -f /etc/nginx/sites-available/nexuscontrol.conf ]; then
    ln -sf /etc/nginx/sites-available/nexuscontrol.conf /etc/nginx/sites-enabled/nexuscontrol.conf
  fi

  nginx -t && systemctl restart nginx
  systemctl enable nginx || true
  log_success "Nginx reverse proxy active on port 80."
else
  log_warn "Nginx configuration directory not found. Please configure reverse proxy manually."
fi

# ------------------------------------------------------------------------------
# Phase 6: Post-Install Output & Health Check
# ------------------------------------------------------------------------------
log_info "Verifying daemon health check at http://127.0.0.1:8787/health..."

HEALTHY=0
for i in {1..15}; do
  if curl -s http://127.0.0.1:8787/health 2>/dev/null | grep -q '"status":"ok"'; then
    HEALTHY=1
    break
  fi
  sleep 1
done

PUBLIC_IP="$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || \
            curl -s --max-time 3 https://ifconfig.me 2>/dev/null || \
            curl -s --max-time 3 https://icanhazip.com 2>/dev/null || \
            hostname -I 2>/dev/null | awk '{print $1}' || \
            echo "SERVER_IP")"

echo ""
if [ "${HEALTHY}" -eq 1 ]; then
  log_success "NexusControl Enterprise Daemon is active and healthy!"
else
  log_warn "Daemon is still initializing. Check logs with 'journalctl -u nexuscontrol -n 50'."
fi

echo -e "${GREEN}${BOLD}"
echo "╔═════════════════════════════════════════════════════════════════════════════╗"
echo "║                  NexusControl Deployed Successfully!                        ║"
echo "╚═════════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Dashboard URL:${NC}       ${CYAN}http://${PUBLIC_IP}${NC} (or http://127.0.0.1:8787)"
echo -e "  ${BOLD}Administrator:${NC}       ${YELLOW}admin${NC}"
echo -e "  ${BOLD}Initial Password:${NC}    ${PURPLE}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "  ${BOLD}Security & Configuration:${NC}"
echo -e "    1. Access your dashboard at ${CYAN}http://${PUBLIC_IP}${NC} and authenticate."
echo -e "    2. Set up SSL certificates via ${BOLD}Settings -> Let's Encrypt / Domains${NC}."
echo -e "    3. Connect to your Zero Trust network via ${BOLD}WireGuard VPN${NC} (Port 51820 UDP)."
echo -e "    4. Configure backup targets (Local / AWS S3 / Google Drive) under ${BOLD}Backups${NC}."
echo ""
echo -e "  ${BOLD}Service Control:${NC}"
echo -e "    Status:            systemctl status nexuscontrol"
echo -e "    Live Logs:         journalctl -u nexuscontrol -f"
echo -e "    Restart:           systemctl restart nexuscontrol"
echo -e "    Configuration:     ${ENV_FILE}"
echo ""
echo -e "${GREEN}${BOLD}===============================================================================${NC}"
