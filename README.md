# NexusControl — Enterprise VPS Monitoring & Operations Engine

**NexusControl** is an enterprise-grade, high-performance Linux VPS monitoring, operations, and file management platform engineered to run directly on production Linux servers (Ubuntu/Debian) with an ultra-low resident resource footprint (<45 MB RAM, <0.2% CPU). 

Designed with a defense-in-depth security perimeter, NexusControl unifies real-time host telemetry, systemd supervision, live journal streaming, an enterprise filesystem management suite, and a flagship in-browser persistent root terminal within a modern, reactive single-page dashboard.

---

## 1. Architecture & Technology Stack

```
+-----------------------------------------------------------------------------------+
|                              Client Web Browser                                   |
|   React 18 SPA (Vite) + Tailwind CSS + Xterm.js v6 + Monaco + Lucide Icons        |
+-----------------------------------------------------------------------------------+
                                         |
                       HTTPS :443 (Let's Encrypt TLS)
                       WSS   :443 (/api/terminal/ws)
                                         v
+-----------------------------------------------------------------------------------+
|                        Nginx Reverse Proxy & Perimeter                            |
|             (/etc/nginx/conf.d/nxpanel.xus.me.conf)                               |
|   - Non-buffered SSE streaming (proxy_buffering off)                              |
|   - Dedicated WebSocket upgrade (Upgrade $http_upgrade; Connection "upgrade";)    |
|   - Real-IP forwarding (proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for) |
+-----------------------------------------------------------------------------------+
                                         |
                             HTTP / WS :8787 (Loopback)
                                         v
+-----------------------------------------------------------------------------------+
|                         NexusControl Node.js Daemon                               |
|                      (Bound strictly to 127.0.0.1:8787)                           |
|                                                                                   |
|  [Security Perimeter]                                                             |
|    * Helmet (Security Headers)                                                    |
|    * IP Whitelist Middleware (Perimeter defense via X-Forwarded-For)              |
|    * WebSocket Upgrade Gatekeeper (IP Whitelist + Bearer Token Validation)        |
|    * Express Rate Limiting (Brute-force protection)                               |
|    * Three-Step Auth Pipeline (Master Pass -> TOTP 2FA -> Email OTP / Journal)    |
|                                                                                   |
|  [Telemetry & Ingestion]       [Enterprise Terminal Engine]   [Files Engine]      |
|    * Native /proc & /sys         * node-pty Root PTY spawner    * fs.promises     |
|    * 1.5s SSE Engine             * 256KB Ring Buffer Replay     * Multipart Chunk |
|    * SQLite Time-Series WAL      * 24h Idle Session TTL         * tar / zip async |
|      (30-day downsampling)       * SQLite Command Presets       * .trash recycle  |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        Host Linux Kernel & Subsystems                             |
|          sysfs / procfs | systemd (PID 1) | journald | block storage | /bin/bash  |
+-----------------------------------------------------------------------------------+
```

### Technical Specifications

| Layer | Technology | Specification & Characteristics |
| :--- | :--- | :--- |
| **Backend Runtime** | Node.js v22 (Express 5.x) | Lightweight daemon resident memory footprint: **~35–45 MB**. Non-blocking asynchronous event loop; zero subshells spawned on high-frequency loops. |
| **Telemetry Push** | Server-Sent Events (SSE) | Real-time push at **1.5-second intervals** via `/api/stream` with persistent keepalive heartbeats every 15s. Operates across tabs without disconnecting. |
| **Time-Series Buffer**| Node.js Native SQLite (`node:sqlite`) | Embedded SQLite database (`metrics.db`) with Write-Ahead Logging (`WAL`) mode. Automatically downsamples into 1h, 6h, 24h, and 7d ring buffer buckets with automatic 30-day pruning. |
| **Terminal PTY Engine**| `node-pty` (native C++ / aarch64) | Spawns persistent `/bin/bash` pseudo-terminals under `/root` with `xterm-256color` capability. Includes 256KB output ring buffer and 24-hour idle session TTL before termination. |
| **Terminal Transport**| WebSockets (`ws`) | High-throughput bi-directional streaming over `/api/terminal/ws`. Handshake enforces strict client IP whitelisting and Bearer token verification before spawning any PTY process. |
| **Frontend Terminal**| `@xterm/xterm` (v6.0) | GPU-accelerated terminal with WebGL renderer (and automatic canvas fallback), FitAddon, SearchAddon, SerializeAddon, WebLinksAddon, and Unicode11. |
| **Frontend Framework**| React 18 + Vite | Modular Single Page Application (SPA), dark theme (`#09090b` / `zinc-950`), responsive flex/grid layouts, dynamic view switching without dropping SSE streams. |
| **Styling & Icons** | Tailwind CSS + Lucide Icons | High-contrast dark theme, curated status palettes (`emerald-500`, `amber-500`, `rose-500`), Lucide SVG vector iconography, Google Fonts (`Inter` and `JetBrains Mono`). |
| **Code Editor** | Monaco Editor (`@monaco-editor/react`) | Full-featured in-browser code editor with syntax highlighting, search/replace, line counter, and `Ctrl+S` hotkey persistence. |
| **Reverse Proxy** | Nginx (Reverse Proxy + SSL) | Configured at `/etc/nginx/conf.d/nxpanel.xus.me.conf` with TLS termination, unbuffered chunked SSE proxying, and dedicated `/api/terminal/ws` WebSocket upgrade proxying. |

---

## 2. Core Modules & Features

### A. Enterprise Terminal Module (Flagship)
The Enterprise Terminal delivers full browser-based root access with tmux-style persistence:
- **Persistent Tmux-Style Sessions:** Each terminal session spawns a dedicated native PTY (`node-pty`) process with an interactive `/bin/bash` shell in `/root`. If a user closes the browser or disconnects, the session survives for **24 hours** before automatic cleanup.
- **256KB History Ring Buffer:** In-memory FIFO ring buffer captures all terminal output. Upon reconnecting or opening a session in a new tab, the complete buffer is replayed instantly with zero state loss.
- **Multi-Tab Sessions:** Browser UI manages multiple concurrent shell tabs (`bash #1`, `bash #2`, etc.) with tab switcher, individual session IDs, and `localStorage` session state persistence.
- **Mobile Virtual Touch Bar:** Dedicated touch bar for mobile and tablet devices with haptic feedback:
  - Escape (`\x1B`), Tab (`\x09`), Enter (`\r`).
  - Interactive modifiers: **CTRL** and **ALT** toggles.
  - Dedicated signals: `Ctrl+C` (`\x03`), `Ctrl+D` (`\x04`), `Ctrl+Z` (`\x1A`), `Ctrl+L` (`\x0C`).
  - Terminal navigation: Arrow keys (`↑`, `↓`, `←`, `→`).
  - Common shell operators: `|` (pipe), `/` (slash), `-` (dash), `~` (home), `>` (redirect), `$` (env), `&` (background), `;` (sequence).
- **In-Terminal Buffer Search:** Powered by `@xterm/addon-search` with real-time match highlighting, case sensitivity toggle, and previous/next navigation.
- **Session Log Exporter:** Uses `@xterm/addon-serialize` to dump the complete session history to a downloadable `.log` text file with a single click.
- **Command Presets Library:** SQLite-backed command repository (`terminal_presets` in `metrics.db`) with categorized defaults (System, Docker, Network) and custom preset creation/deletion. Commands can be either typed into the prompt ("Insert") or executed immediately with Enter ("Run").
- **Hardware-Accelerated WebGL with Canvas Fallback:** Loads `WebglAddon` for high-FPS scrolling, automatically falling back to the standard canvas renderer if the browser or system restricts WebGL contexts.

### B. VPS Hardware & System Profile (Hero Header)
- **Host Metrics:** Hostname, Public IP, Private Network IP with one-click clipboard copying.
- **Kernel & Architecture:** OS version (e.g. Ubuntu 26.04), Linux Kernel release, CPU architecture (`aarch64` / `x86_64`).
- **Hardware Specs:** CPU core model & base clock, total installed RAM, total block storage capacity.
- **Uptime & Status:** Exact boot timestamp, human-readable uptime tracker, dynamic health status (`HEALTHY`, `DEGRADED`, `CRITICAL`), and real-time SSE stream status badge (`LIVE 1.5s`).

### C. Live System Telemetry Gauges & Sparklines
- **CPU Gauges:** Aggregate utilization meter, individual per-core meters, and Load Averages (`1m`, `5m`, `15m`) color-graded against core count thresholds.
- **Memory Breakdown:** Segmented bar displaying Active Memory, Buffers/Cached, and Free Available RAM, alongside Swap allocation metrics.
- **Storage Subsystem:** Root filesystem utilization percentage, available disk space, Inode consumption, Read/Write IOPS, and disk throughput (MB/s).
- **Network Interface Monitor:** Primary network interface metrics, real-time RX/TX transfer bandwidth, cumulative session transfer volume, and an upstream latency ping tracker.
- **Historical Time-Series Charts:** Interactive timeline selector (**1h**, **6h**, **24h**, **7d**) rendering historical trend lines for CPU/RAM utilization, network throughput, and disk I/O.

### D. System Operations & Supervisory Suite
- **Live Process Manager:**
  - Real-time top resource consumers sorted dynamically by CPU % or Memory %.
  - Columns: `PID`, `User`, `CPU %`, `RAM %`, `Elapsed Time`, `Command`.
  - Filter and regex search by process name, PID, or user.
  - Safe two-step confirmation modal to dispatch `SIGTERM` (15) or `SIGKILL` (9) signals via sanitized `child_process.execFile` execution.
- **Systemd Service Supervisor:**
  - Real-time unit status inspection for core system daemons (`OpenSSH`, `Nginx`, `Docker`, `UFW`, `Cron`, `PostgreSQL`, `Redis`, `NexusControl`).
  - Supervisory action controls: `Restart`, `Stop`, `Start` with immediate feedback toasts.
  - Self-preservation safeguard preventing accidental stoppage of the `nexuscontrol` daemon itself.
- **Security & Port Audit:**
  - **Listening Ports:** Comprehensive table mapping open network sockets (`ss -tulpn`) to daemon processes and PIDs.
  - **Firewall Status (UFW):** Active policy status and rule matrix.
  - **SSH Intrusion Log:** Failed authentication counter, failed login attempts log with origin IP, username, and timestamp.
- **Centralized System Journal Streamer:**
  - Collapsible terminal viewer tailing `journalctl -f`.
  - Severity level filters (`ALL`, `ERROR`, `WARN`, `INFO`), pattern grep search, line limit selector (50, 100, 200), and auto-scroll freeze lock.
  - Confined internal scroll container preventing viewport jumping.

### E. Enterprise Files Manager Module
The Files Manager provides desktop-grade filesystem management with complete multi-mount support:
- **Filesystem Navigation:** Interactive breadcrumb bar, history back/forward/up navigation, and double-click manual path input.
- **State Reconciliation & Selection Preservation:** Directory polling and SSE telemetry refreshes preserve active multi-selections (`selectedPaths`), preventing state wiping during shift-clicks or lasso selections.
- **Dual Display Modes:** High-density detail table (Name, symlink target `-> /dest`, Size, POSIX Mode, Owner:Group, Modification Date) and responsive Grid view.
- **Recycle Bin Engine (`.trash`):** Dedicated recycle directory at `/opt/NexusControl/.trash` initialized automatically on boot with `0o755` permissions and `metadata.json` tracking.
- **Chunked Upload Engine:** Direct-to-disk chunked file uploads (`/opt/NexusControl/.uploads/`) supporting multi-gigabyte files with Pause, Resume, and Cancel controls.
- **Archive Engine:** Native `tar` and `zip` compression and extraction executed asynchronously with explicit `{ cwd: parentDir }` options.
- **Smart Icon Engine:** Real-time classification engine (`fileIcons.jsx`) rendering tailored Lucide icons across Table and Grid views.
- **Mobile-First Responsive Suite (Native iOS/Android Feel):**
  - **Off-Canvas Sidebar Drawer:** On mobile (`< md`), sidebar slides out as a touch drawer with backdrop blur, triggered via the Top Bar hamburger menu (`Menu`).
  - **Swipeable Breadcrumbs:** Deep paths scroll horizontally (`touch-pan-x`, `whitespace-nowrap`) preventing multi-line overflow on narrow phone screens.
  - **Responsive Table-to-Card Layout:** On mobile, high-density desktop columns are collapsed into touch-friendly list cards with stacked titles and metadata, ensuring a minimum 44x44px touch target.
  - **Bottom Sheet Context Menus:** Three-dot icons (`⋮`) and long-press touch gestures open context menus as swipeable bottom sheets anchored to the screen bottom with drag handles and cancel buttons.
  - **Speed-Dial Floating Action Button (FAB):** Replaces desktop creation buttons on mobile with a persistent, drop-shadowed `+` FAB anchored at `bottom-6 right-6` for quick Folder, File, and Upload actions.
  - **Dynamic Viewport Code Editor (`100dvh`):** Monaco Editor expands to `100dvh` preventing URL bar overlap, with the minimap automatically disabled on mobile devices.
  - **Touch Viewers with Pinch-to-Zoom:** Image and PDF viewers feature explicit `touch-action: pinch-zoom` with smooth two-finger pinch zoom and touch dragging.
- **Internal Viewers:** Pan/zoom Image Viewer (`ImageViewerModal.jsx`), universal PDF Viewer (`PdfViewerModal.jsx`), and Hex Dump Viewer (`HexViewerModal.jsx`).
- **Monaco Code Editor Overlay (`CodeEditorModal.jsx`):** Syntax detection for 30+ languages, smart indentation, bracket matching, wrap toggle, live status bar (Ln X, Col Y), and save safety guardrails.

### F. Enterprise Tamper-Evident Audit Log (SHA-256 Chained)
Privileged root operations and access attempts are cryptographically secured using an immutable SHA-256 hash-chaining ledger:
- **Append-Only SQLite Ledger (`audit_logs` in `metrics.db`):** Stores `id` (UUID), `timestamp`, `action`, `user`, `ip`, `user_agent`, `target_resource`, `payload`, `prev_hash`, and `event_hash`.
- **Deterministic Canonical Serialization:** All event fields are serialized with sorted JSON keys before hashing, guaranteeing reproducible cross-platform byte streams.
- **Sequential Hash Chaining:**
  - Genesis Block points to `prev_hash: "000000"`.
  - Every subsequent block calculates `event_hash = SHA256(prev_hash + ":" + canonicalJson(eventData))`.
  - Synchronous SQLite operations prevent race conditions during hash computation.
- **Mathematical Tamper Detection:** Full chain validation endpoint (`GET /api/audit/verify`) replays the entire sequence from Genesis to Head. Any manual mutation of row contents or pointers instantly triggers verification failure and isolates the exact tampered record ID and index.
- **Deep Privilege Hooks:** Comprehensive automatic logging across:
  - **Authentication:** `AUTH_STEP1_SUCCESS`, `AUTH_STEP1_FAILED`, `AUTH_2FA_FAILED`, `AUTH_LOGIN_SUCCESS`, `AUTH_LOGOUT`.
  - **Filesystem Operations:** `FILE_WRITE`, `FILE_CHMOD`, `FILE_TRASH`, `FILE_DELETE_PERMANENT`, `ARCHIVE_EXTRACT`.
  - **Supervisory Controls:** `SERVICE_START`, `SERVICE_STOP`, `SERVICE_RESTART`, `PROCESS_SIGNAL`.
  - **Interactive Terminal:** `TERMINAL_SESSION_CONNECT`.
- **Dedicated Dashboard UI (`AuditLogView.jsx`):**
  - Instant chain integrity verification button with animated status alerts.
  - Multi-attribute search (user, resource, payload) and action-based filtering.
  - Full cryptographic block inspection drawer showing parent pointer, event hash, raw payload, and quick clipboard copying.

### G. Automated Integration Test Suite (Jest + Supertest)
Comprehensive regression and security test suite testing backend systems with zero mock flakiness:
- **Test Framework:** `jest` configured for Node.js environment (`jest.config.js`) with custom setup scaffold (`tests/setup.js`).
- **Core Test Suites:**
  - `tests/auth.test.js`: Multi-step authentication handshake, master password verification, token lifecycle, and session revocation.
  - `tests/audit.test.js`: Deterministic serialization, cryptographic chaining, payload tamper detection, and query filtering.
  - `tests/files.test.js`: Path traversal sanitization, octal mode formatting, file read/write lifecycles, conflict detection, and permanent deletion.
  - `tests/telemetry.test.js`: Hardware profile detection, live telemetry structure validation, and process sampling.
  - `tests/terminal.test.js`: Pseudo-terminal (PTY) session spawning, ring buffer history replay, geometry resizing, and clean process teardown.


### H. Enterprise Nginx vHost & Domain Manager (Flagship)
The Enterprise Nginx vHost & Domain Manager provides unified domain orchestration, reverse-proxy routing, static web app hosting, and automated Let's Encrypt SSL certificate issuance directly from the NexusControl dashboard:
- **Atomic Configuration Pipeline & Rollback:** Zero-downtime virtual host lifecycle. Staging files are rendered, verified against `nginx -t` via child process, and immediately rolled back if syntax validation fails, ensuring the web server never crashes.
- **Signature Header Isolation:** All managed configurations in `/etc/nginx/conf.d/nexus_vhost_<domain>.conf` include `# Managed by NexusControl - Do Not Edit Manually Outside UI`, ensuring host configs (e.g., `nxpanel.xus.me.conf`, `xus.me.conf`) remain untouched.
- **Multi-Type Virtual Host Engine:**
  - **Reverse Proxy:** Directs traffic to local services and containers. Includes full duplex WebSockets, Server-Sent Events non-buffering (`proxy_buffering off; proxy_cache off; chunked_transfer_encoding off;`), real IP headers (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`), and customizable body limits.
  - **Static Sites:** Fast static asset hosting from `/var/www/<domain>/html`. Automatically creates directories with proper permissions and fallback default index files.
  - **HTTP Redirects:** 301 Permanent or 302 Temporary redirects.
- **Zero-Config Docker Integration:** The creation wizard features a "Pick from Running Docker Containers" dropdown that scans local containers (e.g. `nexus-demo-service`) and automatically maps upstream ports.
- **Automated Let's Encrypt SSL Engine:**
  - **Pre-Flight DNS Resolution:** Verifies domain A-records against the host's public IP (`132.145.70.205`) using Node's native DNS resolver before invoking Certbot.
  - **Automated Certbot Issuance:** Executes `certbot --nginx` with automatic certificate renewals and HTTP-to-HTTPS redirects.
  - **X509 Certificate Tracking:** Reads certificates to display real-time expiration dates and countdowns.
- **State Toggling:** Instantly enable or disable virtual hosts by renaming between `.conf` and `.conf.disabled` with automated syntax testing and Nginx reloads.
- **Tamper-Evident Audit Integration:** All vHost mutations append `VHOST_CREATE`, `VHOST_UPDATE`, `VHOST_DELETE`, `VHOST_TOGGLE`, and `SSL_ISSUE` events to the SHA-256 cryptographic audit ledger.

---

## 3. Terminal REST & WebSocket Endpoints

| Endpoint | Protocol | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/api/terminal/ws` | `WS/WSS` | Bearer Token / Cookie | Bi-directional streaming connection to root pseudo-terminal. Query parameters: `token`, `sessionId`, `cols`, `rows`. Validates IP whitelist and token at upgrade before spawning PTY. |
| `/api/terminal/presets` | `GET` | Bearer Token | Retrieves all command presets grouped by category from SQLite. |
| `/api/terminal/presets` | `POST` | Bearer Token | Creates a new custom command preset (`{ title, command, category, description }`). |
| `/api/terminal/presets/:id` | `DELETE`| Bearer Token | Deletes a custom command preset. |
| `/api/terminal/sessions` | `GET` | Bearer Token | Lists all active in-memory terminal sessions and metadata. |
| `/api/terminal/sessions` | `POST` | Bearer Token | Pre-allocates a new terminal session (`{ title, cols, rows }`). |
| `/api/terminal/sessions/:id`| `DELETE`| Bearer Token | Immediately destroys and terminates a running terminal session. |
| `/api/audit/logs` | `GET` | Bearer Token | Returns paginated audit events with action/IP filtering and search. |
| `/api/audit/verify` | `GET` | Bearer Token | Performs full cryptographic SHA-256 verification of the audit chain. |
| `/api/docker/status` | `GET` | Bearer Token | Returns Docker daemon availability, engine version, platform info, and container counts. |
| `/api/docker/containers` | `GET` | Bearer Token | Lists all containers with live cached resource metrics (CPU %, RAM, Network I/O). |
| `/api/docker/containers/:id` | `GET` | Bearer Token | Inspects container configuration, environment variables, mounts, and network aliases. |
| `/api/docker/containers/:id/action` | `POST` | Bearer Token | Dispatches container lifecycle action (`start`, `stop`, `restart`, `kill`) and appends `DOCKER_*` event to audit ledger. |
| `/api/docker/containers/:id` | `DELETE` | Bearer Token | Removes container (optional `?force=true&v=true`) and appends `DOCKER_DELETE` event to audit ledger. |
| `/api/vhosts` | `GET` | Bearer Token | Lists all managed virtual hosts with service type, target, and SSL expiration metadata. |
| `/api/vhosts` | `POST` | Bearer Token | Validates, stages, tests with `nginx -t`, and creates a new virtual host (`VHOST_CREATE`). |
| `/api/vhosts/:domain` | `GET` | Bearer Token | Retrieves raw Nginx configuration and parsed metadata for a domain. |
| `/api/vhosts/:domain` | `PUT` | Bearer Token | Updates virtual host configuration with atomic rollback on syntax error (`VHOST_UPDATE`). |
| `/api/vhosts/:domain/toggle` | `POST` | Bearer Token | Enables or disables a virtual host by toggling between `.conf` and `.conf.disabled` (`VHOST_TOGGLE`). |
| `/api/vhosts/:domain` | `DELETE` | Bearer Token | Safely deletes virtual host with signature verification and reloads Nginx (`VHOST_DELETE`). |
| `/api/vhosts/dns-check/:domain` | `GET` | Bearer Token | Runs pre-flight DNS A-record lookup against VPS public IP (`132.145.70.205`). |
| `/api/vhosts/:domain/ssl` | `POST` | Bearer Token | Executes Certbot to provision and activate Let's Encrypt SSL certificate (`SSL_ISSUE`). |

---

## 4. Security Posture & Hardening

Because the NexusControl backend runs with `root` privileges to supervise systemd units and spawn terminal sessions, strict defense-in-depth measures are enforced across all layers:

```
[Incoming Connection / Upgrade Request]
       |
       v
[1. Nginx Reverse Proxy] -----> Enforces TLS, drops malformed headers, injects X-Forwarded-For
       |
       v
[2. IP Whitelist Interceptor] -> Evaluates req.clientIp (via X-Forwarded-For) against ALLOWED_IPS
       |                         * If not in whitelist: Immediately returns 403 Forbidden
       v
[3. WebSocket Upgrade Gatekeeper] -> Evaluates Bearer token & IP BEFORE spawning any PTY process
       |
       v
[4. Rate Limiting] ------------> Brute-force protection on /api/auth/* (20 attempts / 15 mins)
       |
       v
[5. Three-Step Auth Pipeline]
       |---> Step 1: Master Password Verification (returns tempToken challenge)
       |---> Step 2: TOTP 2FA Verification (otplib against TOTP_SECRET)
       |---> Step 3: Perimeter Email Verification (Nodemailer 6-digit OTP to ADMIN_EMAIL)
       |             * Resilient Fallback: If SMTP fails, OTP code is printed
       |               directly to systemd journal (journalctl -u nexuscontrol) to avoid lockout.
       v
[6. Session Token Validation] -> 256-bit cryptographically secure Bearer session token
       |
       v
[7. Isolated PTY Sandbox] ------> Dedicated node-pty process with strict 24h TTL cleanup
```

---

## 5. Directory Structure

```
/opt/NexusControl/
├── .env                          # Master environment variables & secrets (chmod 600)
├── .trash/                       # Recycle Bin storage
│   └── metadata.json             # Recycle Bin tracking database (originalPath, size, ts)
├── .uploads/                     # Staging directory for chunked multipart file uploads
├── package.json                  # Root workspace package manifest
├── nexuscontrol.service          # Systemd unit file (/etc/systemd/system/nexuscontrol.service)
├── nxpanel.xus.me.conf           # Nginx reverse proxy configuration
├── test_audit_chain.js           # Standalone mathematical proof & tamper detection test script
├── README.md                     # Comprehensive Living Architecture & Operations Manual
├── backend/                      # Node.js backend daemon
│   ├── package.json              # Backend package dependencies (express, node-pty, jest, etc.)
│   ├── jest.config.js            # Jest test framework configuration
│   ├── server.js                 # HTTP & WebSocket Server entry point (:8787)
│   ├── osAdapter.js              # OS-agnostic command abstraction engine (/etc/os-release)
│   ├── auth.js                   # 3-Step Defense-in-Depth Authentication Pipeline
│   ├── ipWhitelist.js            # IP Whitelisting interceptor middleware & helper
│   ├── auditLogger.js            # Cryptographic append-only SHA-256 hash chaining engine
│   ├── auditRouter.js            # REST API router mounted at /api/audit/*
│   ├── dockerEngine.js           # Native zero-dependency Docker socket client & telemetry sampler
│   ├── dockerRouter.js           # REST API router mounted at /api/docker/*
│   ├── vhostEngine.js            # Enterprise Nginx vHost & Let's Encrypt Certbot engine
│   ├── vhostRouter.js            # REST API router mounted at /api/vhosts/*
│   ├── terminalSessions.js       # Persistent tmux-style PTY session manager & ring buffer
│   ├── terminalWs.js             # Hardened WebSocket server with upgrade gatekeeper
│   ├── terminalPresets.js        # SQLite-backed command presets library
│   ├── terminalRouter.js         # REST API router mounted at /api/terminal/*
│   ├── collector.js              # Native /proc and /sys telemetry collector
│   ├── history.js                # SQLite WAL time-series historical ring buffer
│   ├── services.js               # Systemd supervisor & journal streamer engine
│   ├── security.js               # Network port scanner & security auditor
│   ├── files.js                  # Native filesystem operations engine (chmod, copy, move, etc.)
│   ├── filesRouter.js            # REST API router mounted at /api/files/*
│   ├── trash.js                  # Linux recycle bin manager with restore logic
│   ├── upload.js                 # Chunked file upload assembler
│   ├── archive.js                # Native tar/zip subprocess archiving engine
│   ├── tasks.js                  # Asynchronous background tasks tracker
│   ├── metrics.db                # SQLite historical database, audit log & presets (WAL mode)
│   ├── tests/                    # Automated Integration Test Suite
│   │   ├── setup.js              # Test environment & scaffold initialization
│   │   ├── auth.test.js          # Authentication pipeline tests
│   │   ├── audit.test.js         # Cryptographic audit chaining & tamper tests
│   │   ├── docker.test.js        # Docker socket & audit integration tests
│   │   ├── files.test.js         # Filesystem operations & guardrail tests
│   │   ├── osAdapter.test.js     # OS detection & abstraction engine tests
│   │   ├── telemetry.test.js     # Hardware profile & metrics tests
│   │   ├── terminal.test.js      # PTY session management & ring buffer tests
│   │   └── vhost.test.js         # Virtual host atomic staging, validation & SSL tests
│   └── node_modules/             # Installed backend dependencies
├── frontend/                     # React 18 / Vite Single Page Application
│   ├── package.json              # Frontend dependencies (xterm, monaco, tailwind, etc.)
│   ├── vite.config.js            # Vite build configuration
│   ├── tailwind.config.js        # Tailwind CSS configuration
│   ├── postcss.config.js         # PostCSS plugins
│   ├── index.html                # SPA HTML template
│   ├── dist/                     # Optimized production bundle served by backend
│   └── src/                      # Source code
│       ├── main.jsx              # React application entry point
│       ├── App.jsx               # Main container with Tab Switcher (Telemetry / Files / Terminal / Audit)
│       ├── index.css             # Global CSS, typography, and scrollbar styling
│       ├── hooks/
│       │   └── useTelemetry.js   # Custom hook managing SSE stream and auth state
│       └── components/
│           ├── AuthGate.jsx          # 3-Step interactive login authentication wizard
│           ├── HeaderProfile.jsx     # System Hero header card & live stream status
│           ├── TelemetryGauges.jsx   # Live CPU, RAM, Storage, Network meters
│           ├── HistoricalCharts.jsx  # Time-series area charts (1h/6h/24h/7d)
│           ├── ProcessManager.jsx    # Live top processes table & signal dispatcher
│           ├── ServiceSupervisor.jsx # Systemd supervisor action panel
│           ├── SecurityOverview.jsx  # Listening ports, UFW rules, SSH fail log
│           ├── JournalStreamer.jsx   # Centralized journalctl log terminal
│           ├── ConfirmModal.jsx      # Generic safe confirmation dialog
│           ├── ToastNotification.jsx # Floating operational feedback toast
│           ├── audit/                # Enterprise Tamper-Evident Audit Log components
│           │   └── AuditLogView.jsx  # Audit ledger table, verification bar, & block inspector
│           ├── docker/               # Enterprise Docker Engine components
│           │   ├── DockerView.jsx        # Container grid/list, action dispatcher, stats
│           │   └── ContainerInspectModal.jsx # Monaco JSON & deep resource inspector
│           ├── vhost/                # Enterprise Nginx vHost & Domain Manager components
│           │   ├── VHostView.jsx         # Managed domains table, metrics banner, toggles
│           │   ├── VHostCreateModal.jsx  # 3-step creation wizard with Docker port auto-map
│           │   └── VHostConfigModal.jsx  # Read-only Monaco Nginx configuration viewer
│           ├── terminal/             # Enterprise Terminal module components
│           │   ├── TerminalView.jsx      # Xterm.js v6 container with WebGL/canvas fallback
│           │   ├── VirtualTouchBar.jsx   # Mobile touch bar injecting ANSI escape sequences
│           │   ├── TerminalActionBar.jsx # Session tabs, in-terminal search, log export
│           │   └── PresetsDropdown.jsx   # Command library and custom preset creator
│           └── files/                # Enterprise Files Manager components
│               ├── FileManager.jsx       # Files Manager orchestrator
│               ├── FileSidebar.jsx       # Quick access roots & dynamic storage mounts
│               ├── FileTopBar.jsx        # Breadcrumb bar, search filters, actions
│               ├── FileTable.jsx         # High-density List & Grid file views
│               ├── FileStatusBar.jsx     # Item stats, selected bytes, task launcher
│               ├── FileContextMenu.jsx   # Global right-click context menu
│               ├── fileIcons.jsx         # Smart Icon Engine & file type classification
│               ├── CodeEditorModal.jsx   # Monaco Code Editor overlay with Ctrl+S & IDE bar
│               ├── HexViewerModal.jsx    # Low-level binary Hex & ASCII inspector
│               ├── ImageViewerModal.jsx  # Responsive Image previewer with pan/zoom/rotate
│               ├── PdfViewerModal.jsx    # Universal PDF document viewer with react-pdf
│               ├── ChmodModal.jsx        # Visual POSIX permission matrix & octal calc
│               ├── ConflictModal.jsx     # Copy/move 409 Conflict resolution dialog
│               ├── UploadModal.jsx       # Chunked uploader with pause/resume controls
│               ├── TrashModal.jsx        # Recycle bin viewer, restore, & purge dialog
│               ├── TaskPopover.jsx       # Floating background task progress monitor
│               └── KeyboardShortcutsModal.jsx # Hotkeys reference modal and shortcut guide
└── scripts/                      # Operational CLI utilities
    ├── setup-2fa.js              # TOTP 2FA secret generator & terminal QR code display
    └── test-email.js             # SMTP connectivity & Nodemailer diagnostic CLI
```

---

## 6. Service Management & Operations

NexusControl is managed as a standard `systemd` service running on the host.

### Running the Automated Test Suite

```bash
# Execute all backend integration tests (Auth, Files, Telemetry, Terminal, Audit)
cd /opt/NexusControl/backend
npm test

# Run the standalone cryptographic chain proof & manual tamper verification script
cd /opt/NexusControl
node test_audit_chain.js
```

### Daemon Management Commands

```bash
# Check service status and resident memory consumption
sudo systemctl status nexuscontrol

# Restart the service (e.g. after backend code modifications)
sudo systemctl restart nexuscontrol

# View real-time application logs and authentication output
sudo journalctl -u nexuscontrol -f -n 50
```

### Nginx Reverse Proxy Management

```bash
# Validate Nginx configuration syntax
sudo nginx -t

# Reload Nginx configuration without dropping connections
sudo systemctl reload nginx
```

### Frontend Build & Deployment

```bash
cd /opt/NexusControl/frontend
npm run build
sudo systemctl restart nexuscontrol
```

---

## 7. Standard Operating Procedure: The Living Document Directive

> [!IMPORTANT]
> **Strict Engineering Directive:** This `README.md` is a **Living Document** and the absolute source of truth for the NexusControl project.
>
> Whenever:
> 1. A new feature or module is implemented,
> 2. An architectural or dependency change is introduced,
> 3. An API endpoint or configuration variable is added or altered, or
> 4. The security pipeline or permissions model is modified,
>
> The documentation in this file **MUST** be automatically updated as the final execution step of the task. Keep this document permanently synchronized with the state of the codebase at all times.
