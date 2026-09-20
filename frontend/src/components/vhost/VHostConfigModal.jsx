import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { X, Copy, Check, FileCode2, Globe } from 'lucide-react';
import { useTheme } from '../../context/ThemeProvider';

export default function VHostConfigModal({ isOpen, onClose, vhost, onShowToast }) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);

  if (!isOpen || !vhost) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(vhost.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onShowToast?.(`Nginx configuration for ${vhost.domain} copied to clipboard`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-4xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl shadow-black/80 flex flex-col max-h-[90vh] overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                  {vhost.domain}
                </h2>
                <span className={`px-2 py-0.5 text-[10px] font-mono rounded border ${
                  vhost.enabled
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700'
                }`}>
                  {vhost.enabled ? 'ACTIVE' : 'DISABLED'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                {vhost.filePath || `/etc/nginx/conf.d/nexus_vhost_${vhost.domain}.conf`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Config'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Monaco Editor Body */}
        <div className="flex-1 p-4 bg-zinc-900 overflow-hidden min-h-[450px]">
          <div className="h-[450px] rounded-lg overflow-hidden border border-zinc-800">
            <Editor
              height="100%"
              language="ini"
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              value={vhost.content || '# Loading configuration...'}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                fontSize: 13,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                wordWrap: 'on'
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/60 flex items-center justify-between text-xs font-mono text-zinc-500">
          <span>Managed by NexusControl Atomic Pipeline</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
