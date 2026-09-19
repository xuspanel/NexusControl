import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  X,
  Copy,
  Check,
  Code2,
  HardDrive,
  Network,
  Settings,
  Layers,
  FileJson
} from 'lucide-react';
import { useTheme } from '../../context/ThemeProvider';

export default function ContainerInspectModal({ isOpen, onClose, container, rawDetails, onShowToast }) {
  const { resolvedTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'env' | 'mounts' | 'network' | 'json'
  const [copied, setCopied] = useState(false);

  if (!isOpen || !container) return null;

  const jsonString = JSON.stringify(rawDetails || container, null, 2);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onShowToast?.('Container inspection JSON copied to clipboard', 'success');
  };

  // Extract env variables
  const envList = (rawDetails?.Config?.Env || []).map(entry => {
    const eqIdx = entry.indexOf('=');
    if (eqIdx !== -1) {
      return { key: entry.slice(0, eqIdx), value: entry.slice(eqIdx + 1) };
    }
    return { key: entry, value: '' };
  });

  // Extract mounts
  const mounts = rawDetails?.Mounts || [];

  // Extract networks
  const networks = rawDetails?.NetworkSettings?.Networks || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-4xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl shadow-black/80 flex flex-col max-h-[90vh] overflow-hidden transition-colors">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                  {container.name}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
                  {container.shortId}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                  container.state === 'running'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                }`}>
                  {container.state}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate max-w-lg">
                Image: <span className="font-mono text-zinc-700 dark:text-zinc-300">{container.image}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyJson}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Copy Inspection JSON"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-Tab Navigation */}
        <div className="px-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-zinc-900/40 flex items-center space-x-1 overflow-x-auto text-xs font-mono">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'overview'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Config</span>
          </button>

          <button
            onClick={() => setActiveTab('env')}
            className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'env'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Env Variables ({envList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('mounts')}
            className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'mounts'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Mounts ({mounts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('network')}
            className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'network'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Network & Ports</span>
          </button>

          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'json'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>Raw JSON</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-4 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-sans font-semibold">
                  Container State
                </div>
                <div><span className="text-zinc-500">Status:</span> <span className="font-semibold text-zinc-900 dark:text-zinc-100">{container.status}</span></div>
                <div><span className="text-zinc-500">Created:</span> <span className="text-zinc-700 dark:text-zinc-300">{new Date(container.created * 1000).toLocaleString()}</span></div>
                <div><span className="text-zinc-500">Restart Count:</span> <span className="text-zinc-700 dark:text-zinc-300">{rawDetails?.RestartCount ?? 0}</span></div>
                <div><span className="text-zinc-500">Platform:</span> <span className="text-zinc-700 dark:text-zinc-300">{rawDetails?.Platform || 'linux'}</span></div>
              </div>

              <div className="p-4 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-sans font-semibold">
                  Execution Details
                </div>
                <div><span className="text-zinc-500">Command:</span> <span className="text-zinc-700 dark:text-zinc-300 break-all">{container.command}</span></div>
                <div><span className="text-zinc-500">Working Dir:</span> <span className="text-zinc-700 dark:text-zinc-300">{rawDetails?.Config?.WorkingDir || '/'}</span></div>
                <div><span className="text-zinc-500">Entrypoint:</span> <span className="text-zinc-700 dark:text-zinc-300">{JSON.stringify(rawDetails?.Config?.Entrypoint || 'default')}</span></div>
                <div><span className="text-zinc-500">Stop Signal:</span> <span className="text-zinc-700 dark:text-zinc-300">{rawDetails?.Config?.StopSignal || 'SIGTERM'}</span></div>
              </div>
            </div>
          )}

          {activeTab === 'env' && (
            <div className="space-y-2">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase text-[10px] tracking-wider">
                    <th className="py-2 px-3">Variable Name</th>
                    <th className="py-2 px-3">Assigned Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                  {envList.map((e, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">{e.key}</td>
                      <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300 break-all">{e.value}</td>
                    </tr>
                  ))}
                  {envList.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-zinc-500">
                        No environment variables declared for this container.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'mounts' && (
            <div className="space-y-3">
              {mounts.map((m, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase text-[10px]">{m.Type || 'bind'}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {m.RW ? 'Read-Write (RW)' : 'Read-Only (RO)'}
                    </span>
                  </div>
                  <div><span className="text-zinc-500">Host (Source):</span> <span className="text-zinc-800 dark:text-zinc-200 break-all">{m.Source}</span></div>
                  <div><span className="text-zinc-500">Container (Dest):</span> <span className="text-zinc-800 dark:text-zinc-200 break-all">{m.Destination}</span></div>
                </div>
              ))}
              {mounts.length === 0 && (
                <div className="py-8 text-center text-zinc-500 text-xs font-mono">
                  No active volume or bind mounts attached to this container.
                </div>
              )}
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-sans font-semibold">
                  Network Interfaces & Aliases
                </div>
                {Object.entries(networks).map(([netName, netDetails], idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs font-mono space-y-1">
                    <div className="font-semibold text-sky-600 dark:text-sky-400">{netName}</div>
                    <div><span className="text-zinc-500">IP Address:</span> <span className="text-zinc-800 dark:text-zinc-200">{netDetails.IPAddress || 'None'}</span></div>
                    <div><span className="text-zinc-500">Gateway:</span> <span className="text-zinc-800 dark:text-zinc-200">{netDetails.Gateway || 'None'}</span></div>
                    <div><span className="text-zinc-500">MAC Address:</span> <span className="text-zinc-800 dark:text-zinc-200">{netDetails.MacAddress || 'None'}</span></div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-sans font-semibold">
                  Bound Ports
                </div>
                <div className="flex flex-wrap gap-2">
                  {container.ports && container.ports.length > 0 ? (
                    container.ports.map((p, idx) => (
                      <span key={idx} className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-mono text-zinc-800 dark:text-zinc-200">
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-mono text-zinc-500">No exposed port bindings.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="h-[450px] rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
              <Editor
                height="100%"
                language="json"
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                value={jsonString}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  wordWrap: 'on'
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/60 flex items-center justify-between text-xs font-mono text-zinc-500">
          <span>Container ID: {container.id}</span>
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
