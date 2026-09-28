import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Ban,
  RefreshCw,
  Search,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Globe,
  MapPin,
  Unlock,
  Loader2
} from 'lucide-react';
import ManualBanModal from './ManualBanModal';

/**
 * Convert 2-letter ISO country code to Country Flag Emoji.
 */
function getCountryFlagEmoji(countryCode) {
  if (!countryCode || countryCode === '??' || countryCode === 'Unknown' || countryCode.length !== 2) {
    return '🌐';
  }
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return '🌐';
  }
}

export default function Fail2banTab({ token, onShowToast }) {
  const [jails, setJails] = useState([]);
  const [activeJail, setActiveJail] = useState('');
  const [bannedData, setBannedData] = useState({ banned: [], currentlyBanned: 0, totalBanned: 0 });
  const [loadingJails, setLoadingJails] = useState(true);
  const [loadingBanned, setLoadingBanned] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [isBanModalOpen, setIsBanModalOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);
  const [copiedIp, setCopiedIp] = useState(null);
  const [actionLoadingIp, setActionLoadingIp] = useState(null);

  // Fetch all jail names
  const fetchJails = useCallback(async () => {
    setLoadingJails(true);
    try {
      const res = await fetch('/api/security/fail2ban/jails', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setIsInstalled(true);
        const list = data.jails || [];
        setJails(list);
        if (list.length > 0 && !activeJail) {
          setActiveJail(list[0]);
        }
      } else {
        if (res.status === 503 || data.isInstalled === false) {
          setIsInstalled(false);
        } else {
          onShowToast?.(data.error || 'Failed to load fail2ban jails', 'error');
        }
      }
    } catch (err) {
      onShowToast?.(err.message || 'Error querying fail2ban', 'error');
    } finally {
      setLoadingJails(false);
    }
  }, [token, activeJail, onShowToast]);

  // Fetch banned IPs for active jail
  const fetchBannedIps = useCallback(async (jailName, isManual = false) => {
    if (!jailName) return;
    if (isManual) setRefreshing(true);
    else setLoadingBanned(true);

    try {
      const res = await fetch(`/api/security/fail2ban/jails/${encodeURIComponent(jailName)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setBannedData({
          banned: data.banned || [],
          currentlyBanned: data.currentlyBanned || 0,
          totalBanned: data.totalBanned || 0
        });
      } else {
        if (isManual) onShowToast?.(data.error || 'Failed to fetch banned IPs', 'error');
      }
    } catch (err) {
      if (isManual) onShowToast?.(err.message || 'Network error fetching banned list', 'error');
    } finally {
      setLoadingBanned(false);
      setRefreshing(false);
    }
  }, [token, onShowToast]);

  useEffect(() => {
    fetchJails();
  }, [fetchJails]);

  useEffect(() => {
    if (activeJail) {
      fetchBannedIps(activeJail);
    }
  }, [activeJail, fetchBannedIps]);

  const handleUnban = async (ip) => {
    if (!activeJail || !ip) return;
    setActionLoadingIp(ip);
    try {
      const res = await fetch(`/api/security/fail2ban/jails/${encodeURIComponent(activeJail)}/unban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ip })
      });
      const data = await res.json();
      if (res.ok) {
        onShowToast?.(`IP ${ip} unbanned successfully from ${activeJail}`, 'success');
        fetchBannedIps(activeJail, true);
      } else {
        onShowToast?.(data.error || `Failed to unban ${ip}`, 'error');
      }
    } catch (err) {
      onShowToast?.(err.message || 'Error executing unban command', 'error');
    } finally {
      setActionLoadingIp(null);
    }
  };

  const handleCopy = (ip) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  // Fallback state if fail2ban is not installed
  if (!loadingJails && !isInstalled) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 sm:p-12 text-center shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          Fail2ban Intrusion Defense Not Installed
        </h3>
        <p className="text-xs text-zinc-500 max-w-md mx-auto mb-6">
          Automated brute-force prevention and jail telemetry require the <code className="font-mono text-zinc-700 dark:text-zinc-300">fail2ban</code> daemon.
        </p>

        <div className="max-w-xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4 text-left font-mono text-xs">
          <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 block mb-2 font-sans">
              Ubuntu / Debian:
            </span>
            <pre className="text-emerald-600 dark:text-emerald-400 select-all overflow-x-auto whitespace-pre-wrap">
sudo apt update && sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban
            </pre>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 block mb-2 font-sans">
              AlmaLinux / RHEL:
            </span>
            <pre className="text-cyan-600 dark:text-cyan-400 select-all overflow-x-auto whitespace-pre-wrap">
sudo dnf install -y epel-release && sudo dnf install -y fail2ban && sudo systemctl enable --now fail2ban
            </pre>
          </div>
        </div>

        <button
          onClick={fetchJails}
          className="mt-6 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 inline-flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Recheck Fail2ban Daemon
        </button>
      </div>
    );
  }

  const bannedList = bannedData.banned || [];
  const filteredBanned = bannedList.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.ip.toLowerCase().includes(q) ||
      item.country.toLowerCase().includes(q) ||
      item.city.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Jail Selector & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Active Jail Tabs / Dropdown */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider font-mono">
            Active Jail:
          </span>
          {jails.map(j => (
            <button
              key={j}
              onClick={() => setActiveJail(j)}
              className={`px-3 py-1 rounded-xl text-xs font-mono font-medium transition-colors cursor-pointer border ${
                activeJail === j
                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/30 shadow-xs'
                  : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {j}
            </button>
          ))}
        </div>

        {/* Search, Refresh & Manual Ban */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search IP, country, or city..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-rose-500 shadow-xs"
            />
          </div>

          <button
            onClick={() => fetchBannedIps(activeJail, true)}
            disabled={refreshing}
            className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shadow-xs cursor-pointer"
            title="Refresh banned IPs"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsBanModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow-md shadow-rose-600/25 transition-all cursor-pointer"
          >
            <Ban className="w-3.5 h-3.5" />
            Manual Ban
          </button>
        </div>
      </div>

      {/* Jail Telemetry Counter Bar */}
      <div className="flex items-center justify-between text-xs px-1 text-zinc-500 font-mono">
        <div>
          Jail: <span className="text-zinc-900 dark:text-zinc-100 font-semibold">{activeJail || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            Currently Banned: <strong className="text-rose-500 font-bold">{bannedData.currentlyBanned}</strong>
          </span>
          <span>
            Total Historical Blocks: <strong className="text-zinc-700 dark:text-zinc-300 font-bold">{bannedData.totalBanned}</strong>
          </span>
        </div>
      </div>

      {/* Banned IPs Data Grid */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/75 dark:bg-zinc-950/50 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                <th className="py-3 px-4">Attacker IP</th>
                <th className="py-3 px-4">Origin &amp; GeoIP</th>
                <th className="py-3 px-4">City</th>
                <th className="py-3 px-4">Coordinates (Lat/Lon)</th>
                <th className="py-3 px-4">Target Jail</th>
                <th className="py-3 px-4 text-right">Access Restoration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono">
              {loadingBanned ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-400 font-sans">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-rose-500" />
                    Querying fail2ban-client and resolving GeoIP databases...
                  </td>
                </tr>
              ) : filteredBanned.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center font-sans">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center mx-auto mb-2">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {search ? 'No matching banned IPs' : 'Zero Active Threat Blocks'}
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {search ? 'Try adjusting your search query.' : `No IPs are currently banned in jail "${activeJail}".`}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBanned.map((item, idx) => {
                  const flagEmoji = getCountryFlagEmoji(item.countryCode);
                  const isActing = actionLoadingIp === item.ip;

                  return (
                    <tr
                      key={idx}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* IP with quick copy */}
                      <td className="py-3.5 px-4 font-bold text-rose-500">
                        <div className="flex items-center gap-1.5">
                          <span>{item.ip}</span>
                          <button
                            onClick={() => handleCopy(item.ip)}
                            className="p-1 text-zinc-400 hover:text-zinc-200 rounded transition-colors cursor-pointer"
                            title="Copy IP"
                          >
                            {copiedIp === item.ip ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Country Flag & Code */}
                      <td className="py-3.5 px-4 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="text-base select-none" role="img" aria-label={item.country}>
                            {flagEmoji}
                          </span>
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            {item.country || 'Unknown'}
                          </span>
                          {item.countryCode && item.countryCode !== '??' && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                              {item.countryCode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* City */}
                      <td className="py-3.5 px-4 font-sans text-zinc-600 dark:text-zinc-300">
                        {item.city && item.city !== 'Unknown' ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span>{item.city}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>

                      {/* Coordinates */}
                      <td className="py-3.5 px-4 text-zinc-500 dark:text-zinc-400 text-[11px]">
                        {item.ll && item.ll.length === 2 ? (
                          <span>{item.ll[0].toFixed(2)}, {item.ll[1].toFixed(2)}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>

                      {/* Jail */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                          {item.jail}
                        </span>
                      </td>

                      {/* Unban Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleUnban(item.ip)}
                          disabled={isActing}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-500/10 text-zinc-700 dark:text-zinc-300 hover:text-emerald-500 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Restore IP access"
                        >
                          {isActing ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Unlock className="w-3 h-3" />
                          )}
                          Unban
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Ban Modal */}
      <ManualBanModal
        isOpen={isBanModalOpen}
        onClose={() => setIsBanModalOpen(false)}
        jails={jails}
        initialJail={activeJail}
        token={token}
        onShowToast={onShowToast}
        onBanned={() => fetchBannedIps(activeJail, true)}
      />
    </div>
  );
}
