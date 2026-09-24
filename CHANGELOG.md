# Changelog

All notable changes to NexusControl will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
