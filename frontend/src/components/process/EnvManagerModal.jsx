import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, X, AlertTriangle, Save, Loader2, Code, List, Eye, EyeOff } from 'lucide-react';

export default function EnvManagerModal({ isOpen, onClose, appName, token, onShowToast, onUpdated }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [rawText, setRawText] = useState('');
  const [mode, setMode] = useState('table'); // 'table' | 'raw'
  const [maskValues, setMaskValues] = useState(true);

  // Load env data when modal opens
  useEffect(() => {
    if (!isOpen || !appName || !token) return;

    setLoading(true);
    async function loadEnv() {
      try {
        const res = await fetch(`/api/process/${encodeURIComponent(appName)}/env`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          const list = data.list || [];
          setRows(list.length > 0 ? list : [{ key: '', value: '' }]);
          setRawText(data.raw || '');
        } else {
          onShowToast?.(data.error || 'Failed to fetch environment variables', 'error');
        }
      } catch (err) {
        onShowToast?.(err.message || 'Error loading environment variables', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadEnv();
  }, [isOpen, appName, token]);

  if (!isOpen) return null;

  const handleAddRow = () => {
    setRows([...rows, { key: '', value: '' }]);
  };

  const handleRemoveRow = (index) => {
    const updated = rows.filter((_, i) => i !== index);
    setRows(updated.length > 0 ? updated : [{ key: '', value: '' }]);
  };

  const handleRowChange = (index, field, val) => {
    const updated = [...rows];
    updated[index][field] = val;
    setRows(updated);
  };

  const handleSwitchToRaw = () => {
    const text = rows
      .filter(r => r.key && r.key.trim())
      .map(r => `${r.key.trim()}=${r.value || ''}`)
      .join('\n');
    setRawText(text);
    setMode('raw');
  };

  const handleSwitchToTable = () => {
    const newRows = [];
    const lines = rawText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        newRows.push({
          key: trimmed.slice(0, idx).trim(),
          value: trimmed.slice(idx + 1)
        });
      }
    }
    setRows(newRows.length > 0 ? newRows : [{ key: '', value: '' }]);
    setMode('table');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let bodyPayload = {};
      if (mode === 'raw') {
        bodyPayload = { raw: rawText };
      } else {
        const envObj = {};
        for (const row of rows) {
          if (row.key && row.key.trim()) {
            envObj[row.key.trim()] = row.value || '';
          }
        }
        bodyPayload = { env: envObj };
      }

      const res = await fetch(`/api/process/${encodeURIComponent(appName)}/env`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (res.ok) {
        onShowToast?.(`Environment updated and ${appName} restarted successfully`, 'success');
        onUpdated?.();
        onClose();
      } else {
        onShowToast?.(data.error || 'Failed to save environment variables', 'error');
      }
    } catch (err) {
      onShowToast?.(err.message || 'Error updating environment', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Environment Variables — {appName}
              </h3>
              <p className="text-xs text-zinc-500 font-mono">
                /opt/NexusControl/apps/{appName}/.env
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Automated Service Restart:</span> Saving changes will immediately update the local <code className="font-mono font-bold">.env</code> file and restart <code className="font-mono font-bold">nc-app-{appName}.service</code>.
          </div>
        </div>

        {/* Mode & Mask controls */}
        <div className="flex items-center justify-between mt-4">
          <div className="inline-flex p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60">
            <button
              onClick={() => { if (mode === 'raw') handleSwitchToTable(); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                mode === 'table'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Table Editor
            </button>
            <button
              onClick={() => { if (mode === 'table') handleSwitchToRaw(); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                mode === 'raw'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              Raw .env
            </button>
          </div>

          {mode === 'table' && (
            <button
              type="button"
              onClick={() => setMaskValues(!maskValues)}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 font-mono transition-colors"
            >
              {maskValues ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {maskValues ? 'Reveal Values' : 'Mask Values'}
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="mt-3 flex-1 overflow-y-auto min-h-[220px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="text-xs font-mono">Loading environment variables...</span>
            </div>
          ) : mode === 'raw' ? (
            <div className="h-full flex flex-col">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="KEY=value&#10;DATABASE_URL=...&#10;PORT=8080"
                rows={10}
                className="w-full flex-1 p-3 font-mono text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500 resize-none leading-relaxed"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-mono text-zinc-400 px-1 uppercase tracking-wider">
                <div className="col-span-5">Variable Key</div>
                <div className="col-span-6">Value</div>
                <div className="col-span-1 text-center"></div>
              </div>

              {rows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => handleRowChange(idx, 'key', e.target.value)}
                    placeholder="KEY_NAME"
                    className="col-span-5 px-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                  />
                  <input
                    type={maskValues ? 'password' : 'text'}
                    value={row.value}
                    onChange={(e) => handleRowChange(idx, 'value', e.target.value)}
                    placeholder="value"
                    className="col-span-6 px-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(idx)}
                    className="col-span-1 p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center justify-center"
                    title="Remove variable"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddRow}
                className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 px-1 py-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Variable Row
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-black flex items-center gap-1.5 shadow-md shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save &amp; Restart Service
          </button>
        </div>
      </div>
    </div>
  );
}
