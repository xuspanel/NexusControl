import React, { useState } from 'react';
import { Shield, X, Check } from 'lucide-react';

export default function ChmodModal({
  item,
  token,
  onClose,
  onSuccess,
  onShowToast
}) {
  // Parse initial octal mode (e.g., '0755' -> '755')
  const initialOctal = (item?.octalMode || '0644').slice(-3);

  const [uR, setUR] = useState(Boolean(parseInt(initialOctal[0], 8) & 4));
  const [uW, setUW] = useState(Boolean(parseInt(initialOctal[0], 8) & 2));
  const [uX, setUX] = useState(Boolean(parseInt(initialOctal[0], 8) & 1));

  const [gR, setGR] = useState(Boolean(parseInt(initialOctal[1], 8) & 4));
  const [gW, setGW] = useState(Boolean(parseInt(initialOctal[1], 8) & 2));
  const [gX, setGX] = useState(Boolean(parseInt(initialOctal[1], 8) & 1));

  const [oR, setOR] = useState(Boolean(parseInt(initialOctal[2], 8) & 4));
  const [oW, setOW] = useState(Boolean(parseInt(initialOctal[2], 8) & 2));
  const [oX, setOX] = useState(Boolean(parseInt(initialOctal[2], 8) & 1));

  const [recursive, setRecursive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute octal representation
  const ownerVal = (uR ? 4 : 0) + (uW ? 2 : 0) + (uX ? 1 : 0);
  const groupVal = (gR ? 4 : 0) + (gW ? 2 : 0) + (gX ? 1 : 0);
  const otherVal = (oR ? 4 : 0) + (oW ? 2 : 0) + (oX ? 1 : 0);
  const octalString = `${ownerVal}${groupVal}${otherVal}`;

  // Compute symbolic representation
  const symbolicString = `${uR ? 'r' : '-'}${uW ? 'w' : '-'}${uX ? 'x' : '-'}` +
    `${gR ? 'r' : '-'}${gW ? 'w' : '-'}${gX ? 'x' : '-'}` +
    `${oR ? 'r' : '-'}${oW ? 'w' : '-'}${oX ? 'x' : '-'}`;

  const handleApply = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/files/chmod', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: item.path,
          mode: octalString,
          recursive: item.isDirectory ? recursive : false
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change permissions');

      onShowToast?.(`Permissions updated to ${octalString}`, 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      onShowToast?.(`Chmod error: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Permissions (chmod)</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-zinc-700 dark:text-zinc-400 font-mono truncate bg-zinc-100 dark:bg-zinc-900/60 p-2 rounded border border-zinc-200 dark:border-zinc-800">
          {item?.path}
        </div>

        {/* Matrix */}
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="pb-2">Target</th>
              <th className="pb-2 text-center">Read (r)</th>
              <th className="pb-2 text-center">Write (w)</th>
              <th className="pb-2 text-center">Execute (x)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-mono">
            <tr>
              <td className="py-2.5 font-medium text-zinc-800 dark:text-zinc-300">Owner (u)</td>
              <td className="py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={uR}
                  onChange={(e) => setUR(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
                />
              </td>
              <td className="py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={uW}
                  onChange={(e) => setUW(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
                />
              </td>
              <td className="py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={uX}
                  onChange={(e) => setUX(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
                />
              </td>
            </tr>
            <tr>
              <td className="py-2.5 font-medium text-zinc-800 dark:text-zinc-300">Group (g)</td>
              <td className="py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={gR}
                  onChange={(e) => setGR(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
                />
              </td>
              <td className="py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={gW}
                  onChange={(e) => setGW(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
                />
              </td>
              <td className="py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={gX}
                  onChange={(e) => setGX(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
                />
              </td>
            </tr>
            <tr>
              <td className="py-2.5 font-medium text-zinc-800 dark:text-zinc-300">Others (o)</td>
              <td className="py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={oR}
                  onChange={(e) => setOR(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
                />
              </td>
              <td className="py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={oW}
                  onChange={(e) => setOW(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
                />
              </td>
              <td className="py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={oX}
                  onChange={(e) => setOX(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Computed Preview */}
        <div className="flex items-center justify-between p-2.5 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Octal:</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold text-sm">0{octalString}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Symbolic:</span>
            <span className="text-zinc-700 dark:text-zinc-300">{symbolicString}</span>
          </div>
        </div>

        {item?.isDirectory && (
          <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-600 cursor-pointer"
            />
            <span>Apply recursively to all enclosed files & subdirectories (-R)</span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 rounded text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded text-xs transition-colors"
          >
            {isSubmitting ? 'Applying...' : 'Apply Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}
