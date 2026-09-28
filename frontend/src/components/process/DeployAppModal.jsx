import React, { useState } from 'react';
import { Rocket, Plus, Trash2, X, Terminal, Folder, Key, Loader2, Sparkles, AlertCircle } from 'lucide-react';

export default function DeployAppModal({ isOpen, onClose, token, onShowToast, onCreated }) {
  const [name, setName] = useState('');
  const [cmd, setCmd] = useState('');
  const [cwd, setCwd] = useState('');
  const [cwdTouched, setCwdTouched] = useState(false);
  const [envRows, setEnvRows] = useState([
    { key: 'PORT', value: '3000' },
    { key: 'NODE_ENV', value: 'production' }
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleNameChange = (val) => {
    // Keep alphanumeric only
    const sanitized = val.replace(/[^a-zA-Z0-9]/g, '');
    setName(sanitized);
    if (!cwdTouched) {
      setCwd(sanitized ? `/opt/NexusControl/apps/${sanitized}` : '');
    }
  };

  const handleAddEnvRow = () => {
    setEnvRows([...envRows, { key: '', value: '' }]);
  };

  const handleRemoveEnvRow = (idx) => {
    setEnvRows(envRows.filter((_, i) => i !== idx));
  };

  const handleEnvChange = (idx, field, val) => {
    const updated = [...envRows];
    updated[idx][field] = val;
    setEnvRows(updated);
  };

  const applyPreset = (preset) => {
    if (preset === 'node') {
      setCmd('node server.js');
      setEnvRows([
        { key: 'PORT', value: '3000' },
        { key: 'NODE_ENV', value: 'production' }
      ]);
    } else if (preset === 'python') {
      setCmd('python3 app.py');
      setEnvRows([
        { key: 'PORT', value: '8000' },
        { key: 'PYTHONUNBUFFERED', value: '1' }
      ]);
    } else if (preset === 'go') {
      setCmd('./main');
      setEnvRows([
        { key: 'PORT', value: '8080' },
        { key: 'GIN_MODE', value: 'release' }
      ]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('App Name is required.');
      return;
    }
    if (!cmd.trim()) {
      setError('Command is required.');
      return;
    }

    setSubmitting(true);
    try {
      const envObj = {};
      for (const row of envRows) {
        if (row.key && row.key.trim()) {
          envObj[row.key.trim()] = row.value || '';
        }
      }

      const res = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          cmd: cmd.trim(),
          cwd: cwd.trim() || `/opt/NexusControl/apps/${name.trim()}`,
          env: envObj
        })
      });

      const data = await res.json();
      if (res.ok) {
        onShowToast?.(`Application "${name}" successfully deployed and started!`, 'success');
        onCreated?.();
        onClose();
      } else {
        setError(data.error || 'Failed to deploy application');
      }
    } catch (err) {
      setError(err.message || 'Network error while deploying application');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Deploy Application (PaaS)
              </h3>
              <p className="text-xs text-zinc-500">
                Native systemd unit provisioning with automatic restarts &amp; log rotation
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

        {/* Quick Presets */}
        <div className="mt-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Quick Template Presets:
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset('node')}
              className="px-2.5 py-1 text-xs rounded-lg bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-500/20 hover:text-indigo-400 transition-colors font-mono"
            >
              Node.js (node server.js)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('python')}
              className="px-2.5 py-1 text-xs rounded-lg bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-500/20 hover:text-indigo-400 transition-colors font-mono"
            >
              Python (python3 app.py)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('go')}
              className="px-2.5 py-1 text-xs rounded-lg bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-indigo-500/20 hover:text-indigo-400 transition-colors font-mono"
            >
              Go Binary (./main)
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-xs text-rose-500 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 flex-1 overflow-y-auto pr-1 space-y-4">
          {/* App Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              App Identifier (Alphanumeric only) *
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="myapi"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                required
              />
              <span className="absolute right-3 top-2 text-[11px] font-mono text-zinc-400">
                nc-app-{name || '[name]'}.service
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Used as the systemd service name and isolated app folder.
            </p>
          </div>

          {/* Execution Command */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              ExecStart Command *
            </label>
            <input
              type="text"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="node server.js"
              className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              required
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              The exact startup command executed by systemd inside the working directory.
            </p>
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-zinc-400" />
              Working Directory (CWD)
            </label>
            <input
              type="text"
              value={cwd}
              onChange={(e) => {
                setCwd(e.target.value);
                setCwdTouched(true);
              }}
              placeholder={`/opt/NexusControl/apps/${name || 'myapp'}`}
              className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Defaults to <code className="font-mono">/opt/NexusControl/apps/{name || '[name]'}</code>. Created automatically if missing.
            </p>
          </div>

          {/* Initial Environment Variables */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-500" />
                Initial Environment Variables (.env)
              </label>
              <button
                type="button"
                onClick={handleAddEnvRow}
                className="text-xs text-indigo-500 hover:text-indigo-400 font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Row
              </button>
            </div>

            <div className="space-y-2 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-mono text-zinc-400 uppercase tracking-wider px-1">
                <div className="col-span-5">Key</div>
                <div className="col-span-6">Value</div>
                <div className="col-span-1"></div>
              </div>

              {envRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => handleEnvChange(idx, 'key', e.target.value)}
                    placeholder="KEY"
                    className="col-span-5 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => handleEnvChange(idx, 'value', e.target.value)}
                    placeholder="value"
                    className="col-span-6 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveEnvRow(idx)}
                    className="col-span-1 p-1 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Submit Actions */}
          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/25 disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
              Provision &amp; Launch App
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
