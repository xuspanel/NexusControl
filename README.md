# NexusControl — Enterprise VPS Control Plane & Operations Engine

[![Node.js](https://img.shields.io/badge/Node.js-v22%20LTS-68a063?style=flat-square&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Architecture](https://img.shields.io/badge/Arch-x86__64%20%7C%20aarch64-8957e5?style=flat-square)](https://github.com/xuspanel/NexusControl)
[![Memory Footprint](https://img.shields.io/badge/Memory%20Footprint-~35MB%20RAM-emerald?style=flat-square)](https://github.com/xuspanel/NexusControl)
[![WireGuard](https://img.shields.io/badge/VPN-Zero%20Trust%20WireGuard-88171a?style=flat-square&logo=wireguard)](https://www.wireguard.com/)
[![Tests](https://img.shields.io/badge/Test%20Suites-14%20Passed%20%7C%20157%20Tests-success?style=flat-square)](https://github.com/xuspanel/NexusControl)

**NexusControl** is an ultra-lightweight, zero-bloat, enterprise-grade Linux VPS control plane, monitoring platform, and operations engine. Built directly on native Linux kernel primitives and modern Node.js v22 APIs, NexusControl delivers real-time host telemetry, zero-trust WireGuard mesh VPN management, fine-grained access control (FGAC), Docker socket orchestration, atomic Nginx virtual host management, cryptographic audit logging, streaming disaster recovery, and in-browser root terminals with tmux-style session persistence.

Designed for high-density production environments, single-board computers, and high-performance cloud instances, NexusControl runs entirely as an unprivileged or root systemd daemon with a resident footprint of **~35MB RAM** and **<0.2% CPU utilization**.

---

## Quick Start (One-Line Automated Installation)

Deploy the entire NexusControl panel, dependencies, WireGuard network routing, Docker engine, and Nginx reverse proxy on fresh **Ubuntu**, **Debian**, or **AlmaLinux/RHEL** servers with a single command:

```bash
curl -sSL https://raw.githubusercontent.com/xuspanel/NexusControl/main/install.sh | sudo bash
```

The unattended installer verifies system prerequisites, performs automated OS detection, configures the native NodeSource v22 runtime, scaffold directories, provisions cryptographic secrets (`.env`), compiles the Vite frontend, sets up systemd supervision, and prints your auto-generated administrative credentials.

---

## 1. Architectural Pillars

```
+---------------------------------------------------------------------------------------+
|                                  Client Browser                                       |
|    React 18 + Vite | Tailwind CSS | Xterm.js v6 (WebGL) | Monaco Editor | Lucide     |
+---------------------------------------------------------------------------------------+
                                           |
                 HTTPS / WSS (:443) or Zero-Trust WireGuard Tunnel (:51820 UDP)
                                           v
+---------------------------------------------------------------------------------------+
|                             Nginx Reverse Proxy Layer                                 |
|               (/etc/nginx/conf.d/nexuscontrol.conf / nxpanel.xus.me.conf)             |
|   - Non-buffered SSE streaming (proxy_buffering off)                                  |
|   - Dedicated WebSocket upgrade (Upgrade $http_upgrade; Connection "upgrade";)        |
|   - Real-IP forwarding (X-Real-IP, X-Forwarded-For, X-Forwarded-Proto)                |
+---------------------------------------------------------------------------------------+
                                           |
                              HTTP / WS :8787 (Loopback)
                                           v
+---------------------------------------------------------------------------------------+
|                                NexusControl Daemon                                    |
|              (Bound strictly to 127.0.0.1:8787 or WireGuard 10.8.0.1:8787)            |
|                                                                                       |
|  [Defense-in-Depth Security Perimeter]                                                |
|    * Fine-Grained Access Control (FGAC Jails)  * IP Whitelist Interceptor             |
|    * Three-Step Auth Pipeline (Pass + 2FA + OTP) * Cryptographic Audit Chaining       |
|                                                                                       |
|  [Core Autonomous Subsystems]                                                         |
|    * WireGuard Mesh VPN (10.8.0.0/24)          * Docker Engine (/var/run/docker.sock)|
|    * Atomic Nginx vHost Staging & Port Scanner * Zstd / AES-256-GCM Streaming Backups |
|    * Webhook & SMTP Alerting Worker            * Telemetry Engine (/proc & /sys)      |
|    * Persistent Node-PTY Terminal Supervisor   * Chunked Disk & Trash File Manager    |
|                                                                                       |
|  [Embedded Storage Layer]                                                             |
|    * Node 22 Synchronous SQLite (node:sqlite) in Write-Ahead Logging (WAL) Mode       |
|    * Ring-Buffer Time-Series Metrics | Users & FGAC Policies | Hash-Chained Audit Log |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                             Host Linux Kernel & Subsystems                            |
|    sysfs / procfs | systemd (PID 1) | journald | iptables / nftables | WireGuard wg0  |
+---------------------------------------------------------------------------------------+
```

### 1. Ultra-Lean Footprint (~35MB RAM)
NexusControl discards the memory overhead typical of legacy web panels:
- **Native Synchronous SQLite (`node:sqlite`):** Bypasses external database servers using Node 22's built-in `node:sqlite` engine running in Write-Ahead Logging (`WAL`) mode. High-throughput time-series metrics, FGAC user policies, and configuration stores reside in an atomic local file (`metrics.db`) with microsecond query latencies.
- **Native Networking & Stream Buffers (`node:net`, `crypto`):** Port inspection, cryptographic hash chaining, and socket communication execute directly against Node core modules without third-party middleware overhead.
- **Native Fetch Dispatcher:** Event alerting and cloud replication use Node 22's native global `fetch` with `AbortSignal.timeout()`, eliminating redundant HTTP client dependencies.
- **Direct Kernel Telemetry:** Ingests live host statistics directly from `/proc/stat`, `/proc/meminfo`, `/proc/net/dev`, and `/proc/diskstats`, spawning zero external subshells during telemetry gathering loops.

### 2. Zero Heavy Dependencies
- **No Redis:** Session state, ring buffers, and terminal histories are maintained in structured, garbage-collected V8 memory pools.
- **No PostgreSQL / MySQL:** Eliminates multi-hundred-megabyte database runtime requirements.
- **No Heavy ORMs:** Zero Prisma, TypeORM, or Sequelize overhead; all queries utilize raw parameterized prepared statements.
- **No Bloated Cloud SDKs:** S3 and Google Drive replication engines are custom-engineered using pure RFC HTTP/1.1 and streaming REST standards, avoiding hundreds of megabytes of third-party cloud SDK packages.

### 3. Enterprise Minimalist UI
- **Functional, High-Density Interface:** Built with clean, dark-mode administrative typography (`Inter` and `JetBrains Mono`), crisp high-contrast border delineations, and zero performative glassmorphic blur filters.
- **Lightning-Fast Single Page Application:** Compiled using Vite and React 18, ensuring rapid view switching and persistent Server-Sent Events (SSE) connections across tabs without dropped telemetry packets.

---

## 2. Flagship Features

### 🔐 Zero-Trust WireGuard VPN Module
NexusControl features a native, host-level WireGuard mesh VPN engine (`backend/wireguardEngine.js`) that transforms your VPS into a secure bastion host:
- **Automated Host Provisioning:** Instantiates `wg0` on `10.8.0.1/24` listening on UDP port `51820`, complete with public/private server keypairs and automatic IP assignment across `10.8.0.2` – `10.8.0.254`.
- **QR Code Client Provisioning:** Generates RFC-compliant client configurations and terminal/web SVG/PNG QR codes for instant mobile device onboarding (iOS, Android, macOS, Windows, Linux).
- **Split & Full Tunnel Routing:** Configurable client routing allowing full-tunnel gateway redirection (`0.0.0.0/0`) or split-tunnel access (`10.8.0.0/24`).
- **Cloud-Hardened Routing (Oracle OCI / AWS / GCP):** Automatically detects default egress interfaces (`eth0`, `ens3`, `enp0s6`) and applies top-inserted iptables forward rules (`iptables -I FORWARD 1 -i wg0 -j ACCEPT`) and dynamic NAT masquerade, bypassing cloud virtual network restrictions.
- **Private Panel Binding:** Allows binding NexusControl strictly to the internal VPN IP (`10.8.0.1:8787`), taking your management dashboard completely off the public internet.

### 🛡️ Security, Cryptographic Ledger & FGAC
- **SHA-256 Tamper-Evident Audit Ledger:** Every privileged administrative operation is canonically serialized and cryptographically chained to its predecessor (`event_hash = SHA256(prev_hash + ":" + canonicalPayload)`). The integrity verification endpoint mathematically walks the ledger from Genesis to Head to immediately expose any manual row modifications.
- **Fine-Grained Access Control (FGAC) Jailing:** Restrict delegated operators or contractors to isolated directory trees (`allowed_directories`) and specific Docker containers (`allowed_containers`). Directory traversal attacks (`../`, null bytes, symlink breakouts) are actively blocked at the middleware layer with immediate `SECURITY_VIOLATION` event generation.
- **Three-Step Defense-in-Depth Authentication:**
  1. Master Password Verification (Bcrypt hashing, 10 rounds).
  2. Time-Based One-Time Password (TOTP 2FA via RFC 6238).
  3. Perimeter IP Verification via 6-digit email OTP (with automatic systemd journal fallback to prevent administrative lockout).

### 🐳 Native Docker & Atomic Nginx Orchestration
- **UNIX Domain Socket Docker Engine:** Communicates directly with `/var/run/docker.sock` over native HTTP without external dependencies. Features container inspection, real-time CPU/memory stats caching, container restarts, log tailing, and safe lifecycle controls.
- **Atomic Nginx Virtual Host Engine:** Stages and validates reverse proxies, static sites, and redirects against `nginx -t` with automatic rollback on syntax failure, preventing web server downtime.
- **Smart Port Inspector & Auto-Allocator:** Scans local TCP sockets using native `node:net` and cross-references existing allocated ports across all managed vHosts, auto-suggesting free ports in the 8080–9999 range.
- **Automated Let's Encrypt SSL Engine:** Pre-flight DNS validation checks domain A-records against the host's public IP before invoking Certbot for zero-failure SSL issuance.

### 💾 Disaster Recovery Engine
- **Streaming Zstandard (`zstd`) Compression:** High-speed, high-ratio compression of application configurations, databases, and system paths.
- **AES-256-GCM Streaming Encryption:** Encrypts backups on the fly without intermediate plaintext disk exposure.
- **Zero-SDK Cloud Replication:**
  - **Amazon S3 & S3-Compatible (MinIO, Wasabi, Cloudflare R2):** Implements AWS Signature Version 4 signing using native Node crypto streams.
  - **Google Drive:** Resumable chunked upload protocol using native OAuth2 token refresh flows.

### 🔔 Webhook & SMTP Alerting Worker
- **Multi-Channel Interceptor:** Dispatches formatted incident cards and threshold alerts to Discord, Telegram, and Email (SMTP via `nodemailer`).
- **Hardware Spikes & Thresholds:** Evaluates CPU and RAM consumption every 5 minutes. Stateful in-memory flags trigger an alert upon initial breach and dispatch an automated recovery alert once usage normalizes, preventing notification spam.
- **Security Interception:** Automatically fires high-priority alerts upon FGAC directory jailbreak attempts, repeated failed logins, or backup replication errors.

### 💻 Enterprise Workspace (Terminal & Editor)
- **WebGL-Accelerated Terminal:** Persistent `/bin/bash` pseudo-terminals powered by native `node-pty` with 256KB ring-buffer history replay, tmux-like session survivability across browser disconnects, in-terminal search, and session log export.
- **Mobile Virtual Touch Bar:** Injects escape sequences (`Ctrl`, `Alt`, `Esc`, `Tab`, arrow keys, signals) for mobile and tablet SSH sessions.
- **Monaco Code Editor Overlay:** Full desktop IDE experience with syntax highlighting across 30+ languages, search/replace, bracket matching, and `Ctrl+S` persistence.

---

## 3. Deployment & Lifecycle Scripts

NexusControl includes a robust suite of shell utilities located in `/opt/NexusControl/`:

| Utility Script | Path | Description |
| :--- | :--- | :--- |
| **`install.sh`** | `/opt/NexusControl/install.sh` | Automated multi-distro installer supporting Ubuntu, Debian, and AlmaLinux/RHEL with interactive Node.js version verification. |
| **`update.sh`** | `/opt/NexusControl/update.sh` | Pulls upstream code from `main`, updates dependencies, rebuilds frontend assets, and restarts the daemon while preserving all `.env` secrets, databases, and user configs. |
| **`uninstall.sh`** | `/opt/NexusControl/uninstall.sh` | Safely halts services, removes Nginx virtual hosts, and interactively prompts whether to purge all data or preserve databases and backups for reinstallation. |
| **`diagnose.sh`** | `/opt/NexusControl/diagnose.sh` | Level-1 troubleshooting wizard inspecting memory footprint, port bindings (`:8787`, `:51820`), SQLite integrity (`PRAGMA integrity_check`), and IPv4 forwarding. |
| **`logs.sh`** | `/opt/NexusControl/logs.sh` | Real-time log multiplexer concurrently streaming the systemd daemon journal, Nginx error logs, and the cryptographic audit ledger. |
| **`health.sh`** | `/opt/NexusControl/health.sh` | POSIX-compliant health checker validating systemd status, Nginx status, and HTTP `/health` probes. Exits with code `0` (healthy) or `1` (unhealthy) for crontabs or external monitoring agents (Uptime Kuma, Zabbix). |

### Smart Node.js Version Check (`install.sh`)
When running `install.sh` on an existing server, the installer prevents breaking co-located applications:
1. **Compatible Runtime (Node >= 22):** Skips NodeSource repository installation and uses the existing engine.
2. **Outdated Runtime (Node < 22):** Warns the user of incompatibility and pauses for interactive confirmation (`[y/N]`) before applying an upgrade.
3. **Fresh Host (No Node):** Automatically configures NodeSource v22 LTS non-interactively.

---

## 4. Directory Structure

```
/opt/NexusControl/
├── install.sh                    # Automated universal host deployment engine
├── update.sh                     # Zero-downtime codebase updater
├── uninstall.sh                  # Interactive daemon & data uninstaller
├── diagnose.sh                   # System diagnostic wizard & port inspector
├── logs.sh                       # Multi-source real-time log aggregator
├── health.sh                     # Cron-friendly UNIX health checker
├── package.json                  # Root workspace package manifest
├── README.md                     # Official Production Documentation
├── backend/                      # Core Node.js v22 Daemon
│   ├── server.js                 # HTTP & WebSocket entrypoint (:8787)
│   ├── db.js                     # Native SQLite engine & schema migrations
│   ├── auth.js                   # 3-step authentication & session verification
│   ├── security.js               # FGAC jailing, port inspector & UFW auditor
│   ├── wireguardEngine.js        # Native WireGuard VPN configuration engine
│   ├── wireguardRouter.js        # REST API for WireGuard peer management
│   ├── dockerEngine.js           # Native UNIX domain socket Docker client
│   ├── dockerRouter.js           # REST API for container orchestration
│   ├── vhostEngine.js            # Atomic Nginx vHost & Certbot manager
│   ├── vhostRouter.js            # REST API for domain and SSL routing
│   ├── backupEngine.js           # Zstandard streaming backup engine
│   ├── backupRouter.js           # REST API for local & cloud backup management
│   ├── s3Engine.js               # Zero-SDK AWS Signature v4 S3 replicator
│   ├── gdriveEngine.js           # Native OAuth2 resumable Google Drive replicator
│   ├── alertEngine.js            # Webhook (Discord/Telegram) & Email (SMTP) worker
│   ├── alertRouter.js            # REST API for alert thresholds & credentials
│   ├── auditLogger.js            # SHA-256 tamper-evident cryptographic ledger
│   ├── auditRouter.js            # REST API for audit verification and search
│   ├── terminalSessions.js       # Persistent node-pty shell supervisor
│   ├── terminalWs.js             # Hardened WebSocket transport layer
│   ├── files.js                  # Native filesystem operations engine
│   ├── filesRouter.js            # REST API for files, uploads, and archives
│   ├── collector.js              # Native /proc and /sys telemetry collector
│   ├── scheduler.js              # Cron worker for backups & resource monitoring
│   ├── metrics.db                # High-speed SQLite database (WAL Mode)
│   ├── nexus_audit.log           # Cryptographic audit ledger
│   └── tests/                    # Integration Test Suite (14 suites, 157 tests)
└── frontend/                     # React 18 + Vite SPA Dashboard
    ├── vite.config.js            # Vite build configuration
    ├── tailwind.config.js        # Tailwind CSS styling definitions
    ├── src/                      # Single Page Application source code
    │   ├── App.jsx               # Main application container & view router
    │   ├── components/           # UI modules (Telemetry, Files, Terminal, Docker, VPN, Alerts)
    │   └── hooks/                # Custom hooks (SSE streaming, Auth state)
    └── dist/                     # Optimized static distribution served by backend
```

---

## 5. Security & Access Model

NexusControl implements strict Role-Based Access Control (RBAC) enforced across all REST and WebSocket routes:

| Role | Telemetry | Files | Terminal | Docker | vHosts | Backups | VPN | Alerts | Audit Log |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **SuperAdmin** | Full | Full Root | Full Root | Full | Full | Full | Full | Full | Full |
| **Operator** | Read | Restricted | Disabled | Actions | Read | Create | Peers | Test | Read |
| **Viewer** | Read | Disabled | Disabled | Read | Read | Disabled| Disabled | Disabled | Disabled |
| **Custom (FGAC)** | Policy | Jailed Dir | Policy | Jailed Containers | Disabled | Disabled | Policy | Disabled | Disabled |

---

## 6. Service Management & Operations

```bash
# Check service status and memory footprint
systemctl status nexuscontrol

# Tail live application logs
journalctl -u nexuscontrol -f

# Run comprehensive system diagnostics
/opt/NexusControl/diagnose.sh

# Run health check (exit code 0 on success)
/opt/NexusControl/health.sh

# Update NexusControl to the latest upstream release
/opt/NexusControl/update.sh
```

---

## 7. License

NexusControl is open-source software licensed under the [MIT License](LICENSE).
