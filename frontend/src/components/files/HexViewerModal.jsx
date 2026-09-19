import React, { useState, useEffect } from 'react';
import { Binary, X, AlertCircle } from 'lucide-react';

function formatHexDump(hexString) {
  if (!hexString) return [];
  const bytes = [];
  for (let i = 0; i < hexString.length; i += 2) {
    bytes.push(hexString.substr(i, 2));
  }

  const rows = [];
  const chunkSize = 16;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    const offset = i.toString(16).padStart(8, '0').toUpperCase();

    const hexParts = chunk.map((b) => b.toUpperCase()).join(' ');
    // Pad hex part if less than 16 bytes
    const paddedHex = hexParts.padEnd(47, ' ');

    let ascii = '';
    for (const b of chunk) {
      const code = parseInt(b, 16);
      ascii += code >= 32 && code <= 126 ? String.fromCharCode(code) : '.';
    }

    rows.push({ offset, hex: paddedHex, ascii });
  }

  return rows;
}

export default function HexViewerModal({ filePath, token, onClose }) {
  const [rows, setRows] = useState([]);
  const [fileSize, setFileSize] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!filePath || !token) return;
    setIsLoading(true);
    setError(null);

    fetch(`/api/files/read?path=${encodeURIComponent(filePath)}&encoding=hex&maxBytes=32768`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to read binary data');
        setFileSize(data.size || 0);
        setRows(formatHexDump(data.content || ''));
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [filePath, token]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex flex-col select-none animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Binary className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
          <span className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-200 truncate">
            Hex Dump: {filePath}
          </span>
          <span className="text-xs font-mono text-zinc-500">
            ({fileSize > 32768 ? 'First 32 KB shown' : `${fileSize} bytes`})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Hex Dump Body */}
      <div className="flex-1 bg-zinc-50 dark:bg-zinc-950 overflow-y-auto p-4 font-mono text-xs text-zinc-800 dark:text-zinc-300">
        {isLoading && (
          <div className="flex items-center justify-center h-full text-zinc-500 space-x-2">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span>Generating hex dump...</span>
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500 dark:text-red-400 space-y-2">
            <AlertCircle className="w-8 h-8" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/60 dark:divide-zinc-900 leading-relaxed font-mono">
            <div className="flex gap-6 pb-2 text-zinc-400 dark:text-zinc-600 font-bold border-b border-zinc-200 dark:border-zinc-800">
              <span className="w-24">OFFSET</span>
              <span className="flex-1">00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
              <span className="w-40 text-right">ASCII</span>
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="flex gap-6 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900/50">
                <span className="w-24 text-indigo-600 dark:text-indigo-400/80">{row.offset}</span>
                <span className="flex-1 text-zinc-800 dark:text-zinc-300 tracking-wider whitespace-pre">
                  {row.hex}
                </span>
                <span className="w-40 text-right text-emerald-600 dark:text-emerald-400/90 whitespace-pre">
                  {row.ascii}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 px-4 py-1.5 text-[11px] font-mono text-zinc-500 flex justify-between">
        <span>Read-only binary inspector</span>
        <span>16 bytes/line • Big Endian</span>
      </div>
    </div>
  );
}
