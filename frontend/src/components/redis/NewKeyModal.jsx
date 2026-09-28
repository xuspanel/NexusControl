import React, { useState } from 'react';
import { Plus, X, Key, Clock, Loader2, Sparkles } from 'lucide-react';

export default function NewKeyModal({ isOpen, onClose, token, onCreated, onShowToast }) {
  const [keyName, setKeyName] = useState('');
  const [type, setType] = useState('string');
  const [ttl, setTtl] = useState('-1');
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!keyName.trim()) {
      setError('Key name cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let parsedValue = value;
    if (type === 'hash') {
      try {
        parsedValue = JSON.parse(value || '{}');
      } catch {
        setError('Hash value must be valid JSON object (e.g. {"field": "val"}).');
        setIsSubmitting(false);
        return;
      }
    } else if (type === 'list' || type === 'set') {
      try {
        parsedValue = JSON.parse(value || '[]');
        if (!Array.isArray(parsedValue)) {
          parsedValue = value.split(',').map((s) => s.trim()).filter(Boolean);
        }
      } catch {
        parsedValue = value.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else if (type === 'zset') {
      try {
        parsedValue = JSON.parse(value || '[]');
      } catch {
        setError('ZSet value must be JSON array of { member, score } objects.');
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/redis/keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: keyName.trim(),
          type,
          value: parsedValue,
          ttl: Number(ttl)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create key');

      onShowToast?.(`Key "${keyName}" created.`, 'success');
      onCreated?.(keyName.trim());
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Plus className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Add New Redis Key
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
              Key Name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. app:config:rate_limit"
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Data Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                <option value="string">String</option>
                <option value="hash">Hash</option>
                <option value="list">List</option>
                <option value="set">Set</option>
                <option value="zset">Sorted Set (ZSet)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                TTL (Seconds)
              </label>
              <input
                type="number"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                placeholder="-1 for no expiry"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Initial Value
              </label>
              <span className="text-[10px] text-zinc-400 font-mono">
                {type === 'string' ? 'Raw text or JSON' : type === 'hash' ? 'JSON object' : 'Array / CSV'}
              </span>
            </div>
            <textarea
              rows={4}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                type === 'hash'
                  ? '{\n  "field1": "val1"\n}'
                  : type === 'list'
                  ? '["item1", "item2"] or comma-separated'
                  : type === 'zset'
                  ? '[{"member": "user1", "score": 100}]'
                  : 'Key value content...'
              }
              className="w-full p-2.5 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !keyName.trim()}
              className="px-4 py-2 text-xs font-medium rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Key</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
