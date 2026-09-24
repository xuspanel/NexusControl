import React, { useState } from 'react';
import { ShieldAlert, KeyRound, X, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TwoFactorModal from './TwoFactorModal';

export default function TwoFactorBanner({ onShowToast }) {
  const { isSuperAdmin, twoFactorEnabled, refreshUser, token } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('nx_dismiss_2fa_banner') === 'true';
    } catch {
      return false;
    }
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('nx_dismiss_2fa_banner', 'true');
    } catch {}
  };

  const handleEnabled = () => {
    refreshUser?.();
    if (onShowToast) {
      onShowToast('Two-factor authentication enabled successfully! Your account is now hardened.', 'success');
    }
  };

  // Strict check: Only show if user is SuperAdmin, 2FA is NOT enabled, and banner not dismissed in session
  if (!isSuperAdmin || twoFactorEnabled || dismissed) {
    return (
      <TwoFactorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        token={token}
        onEnabled={handleEnabled}
      />
    );
  }

  return (
    <>
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 pt-2 pb-1">
        <div className="relative overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-amber-500/10 p-3.5 sm:p-4 shadow-lg shadow-amber-950/20 dark:shadow-black/50 backdrop-blur-md">
          {/* Subtle background glow */}
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-500/15 rounded-full blur-2xl pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Left: Icon & Alert Message */}
            <div className="flex items-start sm:items-center space-x-3 min-w-0">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 mt-0.5 sm:mt-0">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Security Action Required: Two-Factor Authentication is Disabled
                  </h4>
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono text-[10px] uppercase font-semibold border border-amber-500/30">
                    High Priority
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Your SuperAdmin account is currently operating without 2FA. Protect root commands and secrets by enabling TOTP via your profile settings.
                </p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 dark:bg-amber-600 dark:hover:bg-amber-500 text-zinc-950 dark:text-white font-medium text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Enable 2FA</span>
                <ChevronRight className="w-3 h-3" />
              </button>

              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                title="Dismiss for this session"
                aria-label="Dismiss banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2FA Setup Modal */}
      <TwoFactorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        token={token}
        onEnabled={handleEnabled}
      />
    </>
  );
}
