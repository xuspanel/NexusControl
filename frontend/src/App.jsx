import React, { useState } from 'react';
import { Activity, FolderTree, Terminal, ShieldCheck } from 'lucide-react';
import { useTelemetry } from './hooks/useTelemetry';
import AuthGate from './components/AuthGate';
import HeaderProfile from './components/HeaderProfile';
import TelemetryGauges from './components/TelemetryGauges';
import HistoricalCharts from './components/HistoricalCharts';
import ProcessManager from './components/ProcessManager';
import ServiceSupervisor from './components/ServiceSupervisor';
import SecurityOverview from './components/SecurityOverview';
import JournalStreamer from './components/JournalStreamer';
import ToastNotification from './components/ToastNotification';
import FileManager from './components/files/FileManager';
import TerminalView from './components/terminal/TerminalView';
import AuditLogView from './components/audit/AuditLogView';

export default function App() {
  const {
    isAuthenticated,
    isAuthChecking,
    loginStep1,
    loginStep2Totp,
    loginStep3EmailOtp,
    logout,
    token,
    telemetry,
    profile,
    connected,
    refreshProfile
  } = useTelemetry();

  const [activeTab, setActiveTab] = useState('telemetry'); // 'telemetry' | 'files'
  const [toast, setToast] = useState(null);

  const showToast = React.useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">Initializing NexusControl...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthGate
        onStep1={loginStep1}
        onStep2={loginStep2Totp}
        onStep3={loginStep3EmailOtp}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-emerald-500/20 selection:text-emerald-500 dark:selection:text-emerald-400 transition-colors">
      {/* 1. Header & VPS System Profile */}
      <HeaderProfile
        profile={profile}
        telemetry={telemetry}
        connected={connected}
        onLogout={logout}
        onRefresh={() => {
          refreshProfile();
          showToast('Host profile refreshed', 'info');
        }}
      />

      {/* 2. Top-Level Tab Switcher */}
      <div className="bg-white/90 dark:bg-[#121215]/90 border-b border-zinc-200 dark:border-zinc-800/80 sticky top-0 z-30 backdrop-blur-md transition-colors">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'telemetry'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>System Telemetry</span>
            </button>

            <button
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'files'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'
              }`}
            >
              <FolderTree className="w-4 h-4" />
              <span>Files Manager</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                root
              </span>
            </button>

            <button
              onClick={() => setActiveTab('terminal')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'terminal'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Terminal</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                bash
              </span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'audit'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Audit Log</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                SHA-256
              </span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>{connected ? 'Telemetry Stream Active' : 'Connecting Stream...'}</span>
          </div>
        </div>
      </div>

      {/* 3. Main Body */}
      {activeTab === 'telemetry' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
          {/* Live System Telemetry Gauges */}
          <section aria-label="System Telemetry Gauges">
            <TelemetryGauges telemetry={telemetry} />
          </section>

          {/* Historical Time-Series Charts */}
          <section aria-label="Historical Time-Series Charts">
            <HistoricalCharts token={token} liveTelemetry={telemetry} />
          </section>

          {/* Operations Grid: Process Manager & Systemd Supervisor */}
          <section aria-label="Process & Service Operations" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProcessManager token={token} onShowToast={showToast} />
            <ServiceSupervisor token={token} onShowToast={showToast} />
          </section>

          {/* Network & Security Overview */}
          <section aria-label="Network & Security Overview">
            <SecurityOverview token={token} />
          </section>

          {/* Centralized System Journal Streamer */}
          <section aria-label="System Journal Streamer">
            <JournalStreamer token={token} onShowToast={showToast} />
          </section>
        </main>
      ) : activeTab === 'files' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-4">
          <FileManager token={token} onShowToast={showToast} />
        </main>
      ) : activeTab === 'terminal' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-4 flex flex-col">
          <TerminalView token={token} onShowToast={showToast} />
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-4">
          <AuditLogView token={token} onShowToast={showToast} />
        </main>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800/60 py-4 px-4 text-center text-xs font-mono text-zinc-500 dark:text-zinc-600 transition-colors">
        NexusControl • Ubuntu Linux VPS Operations Engine • Daemon Resident: &lt;45MB • SSE 1.5s Native Ingestion
      </footer>

      {/* Floating Feedback Toast */}
      <ToastNotification toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
