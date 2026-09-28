import React, { useState } from 'react';
import { Shield, Plus, Trash2, RefreshCw, Search, Terminal, AlertTriangle, CheckCircle2, Globe } from 'lucide-react';
import OpenPortModal from './OpenPortModal';
import ConfirmModal from '../ConfirmModal';

export default function FirewallTab({
  firewallData,
  loading,
  refreshing,
  onRefresh,
  token,
  onShowToast
}) {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fallback state if firewall is not installed
  if (!loading && (!firewallData || firewallData.isInstalled === false)) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 sm:p-12 text-center shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          No Supported Firewall Detected
        </h3>
        <p className="text-xs text-zinc-500 max-w-md mx-auto mb-6">
          NexusControl requires either <code className="font-mono text-zinc-700 dark:text-zinc-300">ufw</code> (Ubuntu/Debian) or <code className="font-mono text-zinc-700 dark:text-zinc-300">firewalld</code> (AlmaLinux/RHEL/CentOS) to manage host packet filtering.
        </p>

        <div className="max-w-xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4 text-left font-mono text-xs">
          <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 block mb-2 font-sans">
              Ubuntu / Debian:
            </span>
            <pre className="text-emerald-600 dark:text-emerald-400 select-all overflow-x-auto whitespace-pre-wrap">
sudo apt update && sudo apt install -y ufw && sudo ufw enable
            </pre>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 block mb-2 font-sans">
              AlmaLinux / RHEL:
            </span>
            <pre className="text-cyan-600 dark:text-cyan-400 select-all overflow-x-auto whitespace-pre-wrap">
sudo dnf install -y firewalld && sudo systemctl enable --now firewalld
            </pre>
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="mt-6 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 inline-flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Recheck Firewall Status
        </button>
      </div>
    );
  }

  const rules = firewallData?.rules || [];
  const fwType = firewallData?.type || 'ufw';
  const isActive = firewallData?.status === 'active';

  const filteredRules = rules.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.port && String(r.port).toLowerCase().includes(q)) ||
      (r.protocol && r.protocol.toLowerCase().includes(q)) ||
      (r.from && r.from.toLowerCase().includes(q)) ||
      (r.action && r.action.toLowerCase().includes(q))
    );
  });

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/security/firewall/rules/${encodeURIComponent(ruleToDelete.port)}/${encodeURIComponent(ruleToDelete.protocol)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const data = await res.json();
      if (res.ok) {
        onShowToast?.(data.message || `Port ${ruleToDelete.port}/${ruleToDelete.protocol} closed successfully`, 'success');
        setRuleToDelete(null);
        onRefresh?.();
      } else {
        onShowToast?.(data.error || 'Failed to close port', 'error');
      }
    } catch (err) {
      onShowToast?.(err.message || 'Error deleting firewall rule', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top action controls & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider font-mono">
              Engine:
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium uppercase bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              {fwType}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              {isActive ? 'Active & Enforcing' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter ports or protocols..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 shadow-xs"
            />
          </div>

          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shadow-xs cursor-pointer"
            title="Refresh rules"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md shadow-emerald-600/25 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Open Port
          </button>
        </div>
      </div>

      {/* Rules Data Grid */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/75 dark:bg-zinc-950/50 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                <th className="py-3 px-4">Port / Target</th>
                <th className="py-3 px-4">Protocol</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Source Origin</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Close Port</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-400 font-sans">
                    {search ? 'No matching firewall rules found.' : 'No open inbound ports configured.'}
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    {/* Port / Service */}
                    <td className="py-3.5 px-4 font-bold text-zinc-900 dark:text-zinc-100">
                      {rule.port}
                      {rule.ipv6 && (
                        <span className="ml-2 text-[10px] font-normal px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                          v6
                        </span>
                      )}
                    </td>

                    {/* Protocol */}
                    <td className="py-3.5 px-4 uppercase text-zinc-600 dark:text-zinc-300">
                      {rule.protocol}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-sans">
                        <CheckCircle2 className="w-3 h-3" />
                        {rule.action || 'ALLOW'}
                      </span>
                    </td>

                    {/* Source */}
                    <td className="py-3.5 px-4 text-zinc-500 dark:text-zinc-400">
                      {rule.from || 'Anywhere'}
                    </td>

                    {/* Type */}
                    <td className="py-3.5 px-4 capitalize text-zinc-400 text-[11px]">
                      {rule.type || 'port'}
                    </td>

                    {/* Action Button */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setRuleToDelete(rule)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Close this port"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Port Modal */}
      <OpenPortModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        token={token}
        onShowToast={onShowToast}
        onRuleAdded={onRefresh}
      />

      {/* Delete Rule Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(ruleToDelete)}
        title={`Close Port: ${ruleToDelete?.port}/${ruleToDelete?.protocol}`}
        message={`Are you sure you want to remove this firewall rule? Inbound traffic on port ${ruleToDelete?.port}/${ruleToDelete?.protocol} will be blocked.`}
        confirmText="Close Port"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={handleDeleteRule}
        onCancel={() => setRuleToDelete(null)}
      />
    </div>
  );
}
