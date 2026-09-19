import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Play,
  CornerDownLeft,
  X,
  Tag,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function PresetsDropdown({ isOpen, onClose, onExecutePreset, token }) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // New preset form state
  const [newTitle, setNewTitle] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [newCategory, setNewCategory] = useState('CUSTOM');
  const [newDescription, setNewDescription] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  const fetchPresets = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/terminal/presets', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.presets) {
        setPresets(data.presets);
      }
    } catch (err) {
      console.error('Failed to load presets:', err);
      setError('Unable to load presets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPresets();
    }
  }, [isOpen, token]);

  const handleAddPreset = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newCommand.trim()) return;

    setFormSubmitting(true);
    try {
      const res = await fetch('/api/terminal/presets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          command: newCommand.trim(),
          category: newCategory.trim().toUpperCase() || 'CUSTOM',
          description: newDescription.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save preset');
      }

      // Reset form
      setNewTitle('');
      setNewCommand('');
      setNewCategory('CUSTOM');
      setNewDescription('');
      setShowAddModal(false);
      await fetchPresets();
    } catch (err) {
      alert(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeletePreset = async (id, title) => {
    if (!confirm(`Delete preset "${title}"?`)) return;

    try {
      const res = await fetch(`/api/terminal/presets/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to delete preset');
      await fetchPresets();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!isOpen) return null;

  const categories = ['ALL', ...Array.from(new Set(presets.map((p) => p.category)))];

  const filteredPresets = presets.filter((p) => {
    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#0e1217] border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-colors">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Command Library & Presets</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Quick-inject standard operations and custom admin scripts</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Preset</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Categories */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/20 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search presets by name, command, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs font-mono bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-[11px] font-mono rounded-md shrink-0 transition-colors border ${
                  selectedCategory === cat
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium'
                    : 'bg-zinc-100 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Presets List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs font-mono">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Loading presets...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-rose-400 text-xs font-mono">
              <AlertCircle className="w-5 h-5 mx-auto mb-2 opacity-80" />
              {error}
            </div>
          ) : filteredPresets.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs font-mono">
              No presets found matching your filter.
            </div>
          ) : (
            filteredPresets.map((preset) => (
              <div
                key={preset.id}
                className="group p-3 bg-zinc-50/70 hover:bg-zinc-100/80 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700/80 rounded-lg transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-200">{preset.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                      {preset.category}
                    </span>
                    {preset.is_builtin ? (
                      <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500">system</span>
                    ) : null}
                  </div>
                  <div className="font-mono text-xs text-emerald-700 dark:text-emerald-400 bg-zinc-100 dark:bg-zinc-950/80 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800/80 overflow-x-auto no-scrollbar">
                    <code>{preset.command}</code>
                  </div>
                  {preset.description && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{preset.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => {
                      onExecutePreset(preset.command, false);
                      onClose();
                    }}
                    title="Insert command into prompt"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-mono bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white border border-zinc-200 dark:border-zinc-700/60 transition-colors"
                  >
                    <span>Insert</span>
                  </button>

                  <button
                    onClick={() => {
                      onExecutePreset(preset.command, true);
                      onClose();
                    }}
                    title="Run immediately (injects Enter)"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-mono bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 transition-colors"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run</span>
                  </button>

                  {!preset.is_builtin && (
                    <button
                      onClick={() => handleDeletePreset(preset.id, preset.title)}
                      title="Delete custom preset"
                      className="p-1.5 rounded text-zinc-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 font-mono">
          <span>{filteredPresets.length} commands available</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Create Preset Nested Modal */}
        {showAddModal && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-10 flex items-center justify-center p-4">
            <form
              onSubmit={handleAddPreset}
              className="bg-white dark:bg-[#12161f] border border-zinc-200 dark:border-zinc-700 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Create Command Preset</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Preset Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Clean Docker Cache"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Command *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. docker system prune -af --volumes"
                    value={newCommand}
                    onChange={(e) => setNewCommand(e.target.value)}
                    className="w-full px-3 py-2 font-mono bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Category</label>
                    <input
                      type="text"
                      placeholder="CUSTOM, DOCKER, etc."
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full px-3 py-2 uppercase font-mono bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Description</label>
                    <input
                      type="text"
                      placeholder="Optional details"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving...' : 'Save Preset'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
