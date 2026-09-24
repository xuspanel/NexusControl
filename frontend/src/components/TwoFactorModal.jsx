import React, { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, X, Copy, Check, KeyRound, Loader2 } from 'lucide-react';

export default function TwoFactorModal({ isOpen, onClose, token, onEnabled }) {
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [otpUri, setOtpUri] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCode('');
      setError('');
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError('');

    fetch('/api/auth/2fa/setup', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to generate 2FA credentials');
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setQrCodeDataUrl(data.qrCodeDataUrl);
          setSecret(data.secret);
          setOtpUri(data.otpUri);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Error generating TOTP secret');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, token]);

  const handleCopy = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifyAndEnable = async (e) => {
    e.preventDefault();
    if (!code || code.trim().length < 6) {
      setError('Please enter a valid 6-digit authentication code.');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ secret, code: code.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify 2FA code.');
      }

      onEnabled?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-7 relative transition-colors max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-1 rounded-lg"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 mb-5">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Enable Two-Factor Authentication
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Harden your SuperAdmin account with Time-based One-Time Passwords (TOTP)
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-7 h-7 text-purple-500 animate-spin" />
            <span className="text-xs font-mono text-zinc-500">Generating secure cryptographic keypair...</span>
          </div>
        ) : error && !qrCodeDataUrl ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
            {error}
          </div>
        ) : (
          <form onSubmit={handleVerifyAndEnable} className="space-y-5">
            {/* Step 1: QR Code */}
            <div className="text-center">
              <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-2">
                Step 1: Scan with Authenticator App
              </span>
              <div className="inline-block p-3.5 bg-white rounded-xl border border-zinc-200 shadow-xs">
                {qrCodeDataUrl && (
                  <img
                    src={qrCodeDataUrl}
                    alt="2FA QR Code"
                    className="w-44 h-44 object-contain mx-auto"
                  />
                )}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Works with Google Authenticator, 1Password, Authy, Apple Keychain
              </p>
            </div>

            {/* Step 2: Manual Secret Key */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Step 2: Or enter key manually
              </label>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <code className="flex-1 font-mono text-xs text-purple-600 dark:text-purple-400 tracking-wider select-all truncate">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1 text-xs"
                  title="Copy Secret"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline font-mono">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Step 3: Verification Code */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Step 3: Enter 6-digit confirmation code
              </label>
              <input
                type="text"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-2.5 text-center font-mono text-lg tracking-widest rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
                autoFocus
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="px-5 py-2 text-xs font-medium rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-purple-950/40 transition-all flex items-center space-x-2"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verify & Activate 2FA</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
