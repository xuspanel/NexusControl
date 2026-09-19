import React, { useState, useEffect } from 'react';
import { 
  ServerCog, 
  RotateCw, 
  Play, 
  Square, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  RefreshCw 
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export default function ServiceSupervisor({ token, onShowToast }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [notSupported, setNotSupported] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');

  const fetchServices = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/system/services', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 501) {
        const data = await res.json().catch(() => ({}));
        setNotSupported(true);
        setSupportMessage(data.error || 'Systemd Supervisor is not supported on this host (systemctl not found).');
        setServices([]);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setNotSupported(false);
        setServices(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch services:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const requestAction = (svc, action) => {
    if (action === 'stop' && svc.id === 'nexuscontrol') {
      onShowToast?.('Cannot stop the NexusControl monitoring service itself.', 'error');
      return;
    }
    setPendingAction({ svc, action });
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    const { svc, action } = pendingAction;
    setActionInProgress(svc.id);
    setPendingAction(null);

    try {
      const res = await fetch('/api/system/services/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ serviceId: svc.id, action })
      });
      const data = await res.json();
      if (res.ok) {
        onShowToast?.(`Service ${svc.name} ${action}ed successfully`, 'success');
        fetchServices();
      } else {
        onShowToast?.(data.error || `Failed to ${action} service`, 'error');
      }
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="nx-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800/80 mb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <ServerCog className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              Systemd Service Supervisor
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Monitor and lifecycle control for essential daemons</p>
          </div>
        </div>

        <button
          onClick={fetchServices}
          title="Refresh Services"
          className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Systemd Unavailable Fallback */}
      {notSupported ? (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start space-x-3 text-xs">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
              Systemd Supervisor Unavailable
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
              {supportMessage || 'This Linux system does not run systemd or systemctl is unavailable (e.g., Alpine OpenRC, lightweight containers). Daemon lifecycle supervisor actions are disabled.'}
            </p>
          </div>
        </div>
      ) : (
        /* Services Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {services.map((svc) => {
          const isActive = svc.activeState === 'active';
          const isBusy = actionInProgress === svc.id;

          return (
            <div 
              key={svc.id} 
              className="bg-zinc-50/80 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between transition-colors"
            >
              <div>
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 truncate pr-2" title={svc.name}>
                    {svc.name}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                    isActive 
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                  }`}>
                    <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-rose-500 dark:bg-rose-400'}`} />
                    {svc.activeState.toUpperCase()}
                  </span>
                </div>

                <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mb-2 truncate">
                  {svc.unit} {svc.mainPid > 0 && `(PID: ${svc.mainPid})`}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2.5 border-t border-zinc-200 dark:border-zinc-800/60 flex items-center justify-between gap-1">
                {isBusy ? (
                  <div className="w-full text-center py-1 text-xs font-mono text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin text-emerald-500 dark:text-emerald-400" />
                    Executing...
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => requestAction(svc, 'restart')}
                      className="flex-1 py-1 px-2 rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors text-[11px] font-mono flex items-center justify-center gap-1 cursor-pointer"
                      title="Restart Service"
                    >
                      <RotateCw className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                      Restart
                    </button>

                    {isActive ? (
                      <button
                        onClick={() => requestAction(svc, 'stop')}
                        disabled={svc.id === 'nexuscontrol'}
                        className="py-1 px-2 rounded bg-zinc-100 hover:bg-rose-50 dark:bg-zinc-900 dark:hover:bg-rose-500/10 hover:border-rose-300 dark:hover:border-rose-500/30 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 disabled:opacity-40 transition-colors text-[11px] font-mono flex items-center justify-center cursor-pointer"
                        title="Stop Service"
                      >
                        <Square className="w-3 h-3" />
                      </button>
                    ) : (
                      <button
                        onClick={() => requestAction(svc, 'start')}
                        className="py-1 px-2 rounded bg-zinc-100 hover:bg-emerald-50 dark:bg-zinc-900 dark:hover:bg-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-500/30 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors text-[11px] font-mono flex items-center justify-center cursor-pointer"
                        title="Start Service"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={!!pendingAction}
        title={`${pendingAction?.action.toUpperCase()} Service`}
        message={`Are you sure you want to ${pendingAction?.action} the daemon '${pendingAction?.svc.name}' (${pendingAction?.svc.unit})?`}
        confirmText={`Execute ${pendingAction?.action}`}
        danger={pendingAction?.action === 'stop'}
        onConfirm={confirmAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
