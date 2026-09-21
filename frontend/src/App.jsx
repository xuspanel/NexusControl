import React, { useState, useEffect, useCallback } from 'react';
import { useTelemetry } from './hooks/useTelemetry';
import { useTheme } from './context/ThemeProvider';
import { NAV_SHORTCUTS } from './config/navigation';
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
import DockerView from './components/docker/DockerView';
import VHostView from './components/vhost/VHostView';
import BackupsView from './components/backups/BackupsView';
import UsersView from './components/users/UsersView';
import { AuthProvider } from './context/AuthContext';

// Adaptive Tri-Mode Navigation Components
import SidebarNav from './components/nav/SidebarNav';
import TopHeader from './components/nav/TopHeader';
import MobileNav from './components/nav/MobileNav';
import CommandPalette from './components/nav/CommandPalette';

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

  const { toggleTheme } = useTheme();

  // Navigation state: 'overview' | 'files' | 'terminal' | 'docker' | 'vhosts' | 'audit'
  const [activeTab, setActiveTab] = useState('overview');
  const [toast, setToast] = useState(null);
  const [pendingTerminalCommand, setPendingTerminalCommand] = useState(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Persistent sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('nexus_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('nexus_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleExecContainer = useCallback((containerName) => {
    setPendingTerminalCommand(`docker exec -it ${containerName} /bin/sh`);
    setActiveTab('terminal');
    showToast(`Opening terminal shell into container: ${containerName}`, 'info');
  }, [showToast]);

  const handleExecuteAction = useCallback((actionId) => {
    switch (actionId) {
      case 'toggle_theme':
        toggleTheme();
        showToast('Theme toggled', 'info');
        break;
      case 'open_terminal':
        setActiveTab('terminal');
        break;
      case 'upload_file':
        setActiveTab('files');
        break;
      case 'create_vhost':
        setActiveTab('vhosts');
        break;
      case 'verify_audit':
        setActiveTab('audit');
        break;
      case 'restart_docker':
        setActiveTab('docker');
        break;
      case 'create_backup':
      case 'view_backups':
        setActiveTab('backups');
        break;
      default:
        break;
    }
  }, [toggleTheme, showToast]);

  // Global Hotkeys: Alt+1..6, Ctrl+1..6, Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. Spotlight Command Palette Shortcut
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

      // Disallow tab jumping when typing in input/textarea/contentEditable
      const tag = e.target?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;
      if (isInput) return;

      // 2. Direct screen jump: Alt+1..6 or Ctrl+1..6
      if (e.altKey || e.ctrlKey) {
        const key = e.key;
        if (NAV_SHORTCUTS[key]) {
          e.preventDefault();
          setActiveTab(NAV_SHORTCUTS[key]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
    <AuthProvider token={token} onLogout={logout}>
      <div className="h-[100dvh] flex flex-col bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 overflow-hidden selection:bg-emerald-500/20 selection:text-emerald-500 dark:selection:text-emerald-400 transition-colors">
      {/* 1. Desktop & Tablet Adaptive Sidebar (Hidden on mobile) */}
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        profile={profile}
        telemetry={telemetry}
        connected={connected}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onLogout={logout}
      />

      {/* 2. Fixed Top Header (All screens, responsive left offset) */}
      <TopHeader
        activeTab={activeTab}
        sidebarCollapsed={sidebarCollapsed}
        telemetry={telemetry}
        connected={connected}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* 3. Main Responsive Scrollable Viewport */}
      <div
        className={`flex-1 overflow-y-auto pt-16 pb-20 md:pb-6 transition-all duration-300 ${
          sidebarCollapsed ? 'pl-0 md:pl-16' : 'pl-0 md:pl-16 xl:pl-60'
        }`}
      >
        {activeTab === 'overview' || activeTab === 'telemetry' ? (
          <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 space-y-6">
            {/* VPS System Profile & Hardware Hero Card */}
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
          <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4">
            <FileManager token={token} onShowToast={showToast} />
          </main>
        ) : activeTab === 'docker' ? (
          <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4">
            <DockerView
              token={token}
              telemetry={telemetry}
              onShowToast={showToast}
              onExecContainer={handleExecContainer}
            />
          </main>
        ) : activeTab === 'vhosts' || activeTab === 'domains' ? (
          <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4">
            <VHostView
              token={token}
              onShowToast={showToast}
            />
          </main>
        ) : activeTab === 'terminal' ? (
          <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 flex flex-col h-[calc(100dvh-5rem)]">
            <TerminalView
              token={token}
              onShowToast={showToast}
              initialCommand={pendingTerminalCommand}
              onClearInitialCommand={() => setPendingTerminalCommand(null)}
            />
          </main>
        ) : activeTab === 'backups' ? (
          <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4">
            <BackupsView token={token} onShowToast={showToast} />
          </main>
        ) : activeTab === 'users' ? (
          <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4">
            <UsersView token={token} onShowToast={showToast} />
          </main>
        ) : (
          <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4">
            <AuditLogView token={token} onShowToast={showToast} />
          </main>
        )}

        {/* Footer */}
        <footer className="border-t border-zinc-200 dark:border-zinc-800/60 py-4 px-4 text-center text-xs font-mono text-zinc-500 dark:text-zinc-600 transition-colors mt-8">
          NexusControl • Ubuntu Linux VPS Operations Engine • Daemon Resident: &lt;45MB • SSE 1.5s Native Ingestion
        </footer>
      </div>

      {/* 4. Mobile Ergonomic Bottom Dock & Slide-Up More Sheet (Hidden on tablet/desktop) */}
      <MobileNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        telemetry={telemetry}
        profile={profile}
        connected={connected}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onLogout={logout}
      />

      {/* 5. Universal Command Palette (Spotlight Modal) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onExecuteAction={handleExecuteAction}
      />

      {/* 6. Floating Feedback Toast */}
      <ToastNotification toast={toast} onClose={() => setToast(null)} />
    </div>
  </AuthProvider>
  );
}
