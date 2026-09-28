# NexusControl Troubleshooting Guide

This guide contains real-world issues encountered during the development and production deployment of NexusControl, alongside their verified solutions.

---

## 1. Nginx 502 Bad Gateway (After Update / Redis Module)
**Symptom:** Nginx throws a `502 Bad Gateway` immediately following an in-app update or module installation.
**Cause:** The Node.js backend crashed or the Vite React build was killed mid-flight (e.g., by the systemd OOM killer or a timeout), resulting in a missing `/opt/NexusControl/frontend/dist/index.html`. Nginx fails to route the traffic and returns a 502.
**Solution:** Manually rebuild the frontend dependencies and static files.
```bash
cd /opt/NexusControl/frontend
npm install --include=dev
npm run build
sudo systemctl restart nexuscontrol
```

## 2. In-App Updater Aborts / Fails Silently
**Symptom:** Clicking "Update Now" shows a spinner, but the dashboard reverts to the old version.
**Cause:** Node.js executes the update script as a child process inside the `nexuscontrol.service` systemd cgroup. When the script triggers a daemon restart, systemd sends `SIGKILL` to the entire cgroup, terminating the build before it completes. Alternatively, Vite is missing because production environments strip `devDependencies`.
**Solution:** 
1. Ensure the backend uses `systemd-run --scope` to escape the cgroup.
2. If the UI is stuck, run the update script directly from a raw SSH terminal (which has full PATH and bypasses systemd scope limits):
```bash
sudo /opt/NexusControl/update.sh
```

## 3. UI Changes Missing After Successful Update
**Symptom:** The update script logs `✓ built in X.XXs`, but the new UI features (like the File Manager enhancements) do not appear in the browser.
**Cause:** Aggressive static asset caching by the Browser, Nginx, or an upstream CDN (e.g., Cloudflare) serving stale `index-*.js` chunks.
**Solution:**
1. **Nginx Flush:** `sudo systemctl restart nginx`
2. **Cloudflare:** Go to Dashboard -> Caching -> Purge Everything.
3. **Browser Hard Refresh:** Press `Ctrl + F5` (Windows/Linux) or `Cmd + Shift + R` (Mac).

## 4. File Manager React Crash (White Screen)
**Symptom:** Opening the File Manager displays a blank white screen, and the browser console shows `ReferenceError: useMemo is not defined`.
**Cause:** A Vite compilation allowed a missing React import during development, which strictly crashes the production Rollup build.
**Solution:** Audit the crashing component (e.g., `FileManager.jsx`), explicitly add `import { useMemo } from 'react';`, and rebuild the frontend using the commands in Issue #1.

## 5. File Uploads / Database Dumps Fail (413 Payload Too Large)
**Symptom:** Uploading a large file via the File Manager or importing a large SQL dump fails instantly.
**Cause:** Nginx's default `client_max_body_size` is strictly limited to 1MB.
**Solution:** Edit the Nginx vHost configuration:
```bash
nano /etc/nginx/conf.d/control.meedo51.com.conf
# Add inside the server block:
client_max_body_size 500M;
```
Then reload Nginx: `sudo systemctl reload nginx`

## 6. WireGuard VPN Handshake Fails / No Internet Access
**Symptom:** The WireGuard QR code scans successfully, and the client handshakes, but no internet traffic flows.
**Cause:** AlmaLinux missing `iptables` package, or the `PostUp` NAT routing rules in `wg0.conf` are bound to the wrong public network interface (e.g., bound to `eth0` when the VPS uses `ens3`).
**Solution:** 
1. Verify interface name: `ip route ls`
2. Ensure iptables is installed: `sudo dnf install iptables`
3. Update the NAT rules via the NexusControl Network module or directly in `/etc/wireguard/wg0.conf`.
