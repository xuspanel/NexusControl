# Changelog

All notable changes to NexusControl will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.4.0] - 2026-09-27

### Added
- **PostgreSQL Database Management (Phase 1):** Dedicated database supervisor with auto-bootstrapping `SUPERUSER` engine (`backend/postgresEngine.js`), native connection pooling, and credential persistence in `.env`.
- **Database Catalog & Provisioning APIs:** Added `GET /api/postgres/status`, `GET /api/postgres/databases`, `POST /api/postgres/databases`, and `DELETE /api/postgres/databases/:name` endpoints with cryptographic audit logging and SQL injection guards.
- **PostgresManager Dashboard Component:** Interactive management UI featuring cluster metrics (catalogs, disk space, active pool user), database search, quick provisioning modal, strict deletion safeguards, and graceful empty state for uninstalled environments.

## [v1.3.1] - 2026-09-27

### Fixed
- **Systemd Cgroup Isolation for In-App Updates:** Spawns `update.sh` inside an independent transient scope (`systemd-run --scope`) with `nohup` fallback, preventing systemd from aborting the update process during daemon restart.
- **Subshell Environment & PATH Hardening:** Explicitly exports comprehensive binary search paths in `update.sh` and streams output directly to `/opt/NexusControl/update.log`.
- **Live Build Progress Stream:** Added `GET /api/system/update-log` endpoint and integrated live auto-scrolling terminal output in the in-app update modal.

## [v1.3.0] - 2026-09-27

### Added
- **System Optimization Wizard:** Smart heuristic analysis engine scanning for major tools (Apache, Nginx, PHP, MySQL, Redis, Docker, Postfix) and orphaned packages (`apt-get autoremove` / `dnf repoquery`).
- **Interactive Cleaner UI:** Radar scan animation, categorized Smart Cards (Keep, Review, Purge), and selective batch removal controls.
- **Real-Time Deep Purge Streaming:** Server-Sent Events (SSE) live purge runner with terminal streaming output, audit logging, and automated daemon refresh.

## [v1.2.1] - 2026-09-27

### Fixed
- **Strict Pipeline Error Handling:** Enforced strict error handling in update script to prevent silent frontend build failures.

## [v1.2.0] - 2026-09-27

### Added
- **OS Package Manager & Update Scanner:** Cross-platform OS update detection supporting Ubuntu/Debian (`apt-get`) and AlmaLinux/RHEL (`dnf`) with pending package parsing via `GET /api/system/os-packages`.
- **Real-Time Streaming SSE Upgrader:** Live Server-Sent Events execution endpoint (`GET /api/system/os-packages/upgrade`) with interactive glassmorphism terminal modal, color-coded output, and auto-scroll telemetry.
- **Selective & Bulk Package Upgrades:** Intuitive UI table supporting individual package selection, "Select All", and "Upgrade Selected / All" workflows with zero-breakage non-interactive flags.

## [v1.1.0] - 2026-09-27

### Added
- **Detached In-App One-Click Updater:** Native `POST /api/system/update` background process execution with automated frontend reconnection polling and reload.
- **Automated WireGuard Migrations:** State-aware `iptables` dependency check and dynamic default network interface migration in `update.sh`.
- **In-App Version Control UI:** Integrated dashboard update center comparing local tags against upstream GitHub releases with sanitized Markdown changelog parsing.
- **Enhanced Interactive ALLOWED_IPS Security Flow:** Streamlined installation prompt allowing explicit confirmation or opt-out (`0.0.0.0/0`) of client IP restriction.
- **Pre-Update State Backups:** Automatic non-destructive `.tar.gz` archive snapshots created in `/opt/NexusControl_backups/` before applying updates.

## [1.0.1] - 2026-09-25

### Added
- **In-App Version Control & Update Checker:** Native `GET /api/system/updates` endpoint comparing local host versions against upstream GitHub releases.
- **Interactive Changelog Viewer:** Real-time markdown rendering of upstream release notes powered by `marked` and `DOMPurify`.
- **Safe Update Workflow:** Explicit operational guidance and copyable terminal command for executing non-destructive updates via `/opt/NexusControl/update.sh`.
- **Dynamic Public IP & WireGuard Endpoint:** Automatic detection of public host IP via `.env` and fallback resolvers, eliminating hardcoded development addresses.
- **Pre-Update Backup & Guardrails:** Automated tar state snapshots prior to code pulls and installer redirection safeguards for existing installations.

## [1.0.0] - 2026-09-24

### Added
- **Architectural Foundation:** Ultra-lean Node.js v22 backend with native `node:sqlite` in WAL mode, sub-35MB resident RAM footprint, and Vite + React 18 single-page dashboard.
- **Zero-Trust WireGuard VPN:** Native mesh VPN engine (`10.8.0.0/24`), QR code client provisioning, configurable split/full tunnel routing, cloud NAT masquerade, and private panel binding.
- **Fine-Grained Access Control (FGAC):** Multi-role access model (SuperAdmin, Operator, Viewer, Custom) with directory jailing, container isolation, and traversal defense.
- **Cryptographic Audit Ledger:** Tamper-evident SHA-256 hash-chained event journal recording all privileged operations with mathematical verification.
- **Nginx vHost & Let's Encrypt:** Atomic reverse proxy, static site, and redirect staging with automated Certbot SSL provisioning and pre-flight DNS A-record verification.
- **Docker Orchestration:** Zero-dependency UNIX domain socket integration for container lifecycles, real-time stats caching, and port inspection.
- **Disaster Recovery:** High-ratio Zstandard (`zstd`) compression with streaming AES-256-GCM encryption and zero-SDK S3 / Google Drive cloud replication.
- **Webhook & SMTP Alerting:** Asynchronous, non-blocking incident dispatch to Discord, Telegram, and Email (SMTP) with memory-state threshold de-duplication.
- **Enterprise Workspace:** In-browser WebGL Xterm.js root terminal with persistent Node-PTY sessions, 256KB ring buffer replay, virtual touch bar, and Monaco code editor.
- **Automated Lifecycle & Diagnostics:** Unattended `install.sh` with smart Node.js version verification, `update.sh`, `uninstall.sh`, `health.sh`, `logs.sh`, and `diagnose.sh`.
