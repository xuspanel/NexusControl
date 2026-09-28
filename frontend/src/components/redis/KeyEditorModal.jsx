import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Trash2,
  Clock,
  Key,
  Layers,
  Sparkles,
  Plus,
  Minus,
  Loader2,
  Check,
  AlertCircle,
  Copy
} from 'lucide-react';

export default function KeyEditorModal({
  isOpen,
  onClose,
  keyName,
  token,
  onSaved,
  onDeleted,
  onShowToast
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [keyData, setKeyData] = useState(null);
  const [error, setError] = useState(null);

  // Form states
  const [currentType, setCurrentType] = useState('string');
  const [ttlInput, setTtlInput] = useState('-1');
  const [stringValue, setStringValue] = useState('');
  const [hashEntries, setHashEntries] = useState([]);
  const [listEntries, setListEntries] = useState([]);
  const [setEntries, setSetEntries] = useState([]);
  const [zsetEntries, setZsetEntries] = useState([]);

  // Fetch key details
  useEffect(() => {
    if (!isOpen || !keyName) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    async function fetchKey() {
      try {
        const res = await fetch(`/api/redis/keys/${encodeURIComponent(keyName)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load key details');

        if (isMounted) {
          setKeyData(data);
          setCurrentType(data.type);
          setTtlInput(String(data.ttl ?? -1));

          if (data.type === 'string') {
            setStringValue(typeof data.value === 'object' ? JSON.stringify(data.value, null, 2) : String(data.value ?? ''));
          } else if (data.type === 'hash') {
            const entries = Object.entries(data.value || {}).map(([field, val]) => ({ field, value: String(val) }));
            setHashEntries(entries.length > 0 ? entries : [{ field: '', value: '' }]);
          } else if (data.type === 'list') {
            const items = Array.isArray(data.value) ? data.value.map(String) : [];
            setListEntries(items.length > 0 ? items : ['']);
          } else if (data.type === 'set') {
            const members = Array.isArray(data.value) ? data.value.map(String) : [];
            setSetEntries(members.length > 0 ? members : ['']);
          } else if (data.type === 'zset') {
            const zitems = Array.isArray(data.value) ? data.value : [];
            setZsetEntries(zitems.length > 0 ? zitems : [{ member: '', score: 0 }]);
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchKey();
    return () => { isMounted = false; };
  }, [isOpen, keyName, token]);

  if (!isOpen) return null;

  // JSON Pretty print helper for strings
  const handlePrettyJSON = () => {
    try {
      const parsed = JSON.parse(stringValue);
      setStringValue(JSON.stringify(parsed, null, 2));
      onShowToast?.('Formatted JSON string successfully', 'success');
    } catch {
      onShowToast?.('String is not valid JSON', 'error');
    }
  };

  // Copy key name to clipboard
  const handleCopyKey = () => {
    navigator.clipboard.writeText(keyName);
    onShowToast?.('Key name copied to clipboard', 'info');
  };

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    let payloadValue = null;
    if (currentType === 'string') {
      payloadValue = stringValue;
    } else if (currentType === 'hash') {
      const hashObj = {};
      for (const entry of hashEntries) {
        if (entry.field.trim()) {
          hashObj[entry.field.trim()] = entry.value;
        }
      }
      payloadValue = hashObj;
    } else if (currentType === 'list') {
      payloadValue = listEntries.filter((v) => v !== '');
    } else if (currentType === 'set') {
      payloadValue = setEntries.filter((v) => v !== '');
    } else if (currentType === 'zset') {
      payloadValue = zsetEntries
        .filter((item) => item.member.trim() !== '')
        .map((item) => ({ member: item.member.trim(), score: Number(item.score || 0) }));
    }

    const payload = {
      type: currentType,
      value: payloadValue,
      ttl: Number(ttlInput)
    };

    try {
      const res = await fetch(`/api/redis/keys/${encodeURIComponent(keyName)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save changes');

      onShowToast?.(`Key "${keyName}" updated successfully.`, 'success');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete key
  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete key "${keyName}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/redis/keys/${encodeURIComponent(keyName)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete key');

      onShowToast?.(`Key "${keyName}" deleted.`, 'info');
      onDeleted?.(keyName);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
              <Key className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono truncate max-w-[280px] sm:max-w-md" title={keyName}>
                  {keyName}
                </h3>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Copy Key Name"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  {currentType}
                </span>
                <span className="text-[11px] text-zinc-400 font-mono">
                  TTL: {ttlInput === '-1' ? 'Persistent' : `${ttlInput}s`}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              <span className="text-xs font-mono">Loading key payload...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* TTL Configuration Section */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Time To Live (TTL) Expiration</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTtlInput('-1')}
                      className="px-2 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-purple-500 text-zinc-700 dark:text-zinc-300"
                    >
                      Persist (-1)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTtlInput('3600')}
                      className="px-2 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-purple-500 text-zinc-700 dark:text-zinc-300"
                    >
                      1h
                    </button>
                    <button
                      type="button"
                      onClick={() => setTtlInput('86400')}
                      className="px-2 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-purple-500 text-zinc-700 dark:text-zinc-300"
                    >
                      24h
                    </button>
                    <button
                      type="button"
                      onClick={() => setTtlInput('604800')}
                      className="px-2 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-purple-500 text-zinc-700 dark:text-zinc-300"
                    >
                      7d
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={ttlInput}
                    onChange={(e) => setTtlInput(e.target.value)}
                    placeholder="-1 for no expiration"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                  <span className="text-[11px] text-zinc-400 shrink-0 font-mono">seconds</span>
                </div>
              </div>

              {/* Type-Specific Editors */}
              {currentType === 'string' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      String Value
                    </label>
                    <button
                      type="button"
                      onClick={handlePrettyJSON}
                      className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-mono"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Format JSON</span>
                    </button>
                  </div>
                  <textarea
                    rows={10}
                    value={stringValue}
                    onChange={(e) => setStringValue(e.target.value)}
                    className="w-full p-3 font-mono text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/60 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    placeholder="Enter string value or raw JSON..."
                  />
                </div>
              )}

              {currentType === 'hash' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Hash Fields ({hashEntries.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => setHashEntries([...hashEntries, { field: '', value: '' }])}
                      className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Field</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {hashEntries.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.field}
                          onChange={(e) => {
                            const updated = [...hashEntries];
                            updated[idx].field = e.target.value;
                            setHashEntries(updated);
                          }}
                          placeholder="Field name"
                          className="w-1/3 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          type="text"
                          value={item.value}
                          onChange={(e) => {
                            const updated = [...hashEntries];
                            updated[idx].value = e.target.value;
                            setHashEntries(updated);
                          }}
                          placeholder="Field value"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => setHashEntries(hashEntries.filter((_, i) => i !== idx))}
                          className="p-1 text-zinc-400 hover:text-rose-500 rounded"
                          title="Remove field"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentType === 'list' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      List Elements ({listEntries.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => setListEntries([...listEntries, ''])}
                      className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Push Element</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {listEntries.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-zinc-400 w-6 text-right">
                          {idx}
                        </span>
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const updated = [...listEntries];
                            updated[idx] = e.target.value;
                            setListEntries(updated);
                          }}
                          placeholder="List item value"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => setListEntries(listEntries.filter((_, i) => i !== idx))}
                          className="p-1 text-zinc-400 hover:text-rose-500 rounded"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentType === 'set' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Set Members ({setEntries.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => setSetEntries([...setEntries, ''])}
                      className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Member</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {setEntries.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => {
                            const updated = [...setEntries];
                            updated[idx] = e.target.value;
                            setSetEntries(updated);
                          }}
                          placeholder="Unique member"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => setSetEntries(setEntries.filter((_, i) => i !== idx))}
                          className="p-1 text-zinc-400 hover:text-rose-500 rounded"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentType === 'zset' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Sorted Set Members ({zsetEntries.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => setZsetEntries([...zsetEntries, { member: '', score: 0 }])}
                      className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Member</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {zsetEntries.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="number"
                          value={item.score}
                          onChange={(e) => {
                            const updated = [...zsetEntries];
                            updated[idx].score = Number(e.target.value);
                            setZsetEntries(updated);
                          }}
                          placeholder="Score"
                          className="w-24 px-2 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          type="text"
                          value={item.member}
                          onChange={(e) => {
                            const updated = [...zsetEntries];
                            updated[idx].member = e.target.value;
                            setZsetEntries(updated);
                          }}
                          placeholder="Member string"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => setZsetEntries(zsetEntries.filter((_, i) => i !== idx))}
                          className="p-1 text-zinc-400 hover:text-rose-500 rounded"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800/80 shrink-0">
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading || saving || deleting}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5 transition-colors"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            <span>Delete Key</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving || deleting}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Key</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
