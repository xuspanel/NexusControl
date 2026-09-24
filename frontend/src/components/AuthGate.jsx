import React, { useState } from 'react';
import { 
  Shield, 
  Lock, 
  KeyRound, 
  Mail, 
  ArrowRight, 
  ArrowLeft, 
  AlertCircle, 
  Server, 
  CheckCircle2,
  Clock,
  User
} from 'lucide-react';

export default function AuthGate({ onStep1, onStep2, onStep3 }) {
  const [step, setStep] = useState(1); // 1: Password, 2: TOTP, 3: Email OTP
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Password & Username Submission
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password || !username.trim()) return;
    setLoading(true);
    setError('');

    const res = await onStep1(password, username.trim());
    setLoading(false);

    if (res.success) {
      if (res.complete) {
        // Direct login succeeded without 2FA
        return;
      }
      setTempToken(res.tempToken);
      setStep(2);
    } else {
      setError(res.error || 'Authentication failed');
    }
  };

  // Step 2: 2FA TOTP Verification
  const handleTotpSubmit = async (e) => {
    e.preventDefault();
    if (!totpCode || totpCode.length < 6) return;
    setLoading(true);
    setError('');

    const res = await onStep2(tempToken, totpCode);
    setLoading(false);

    if (res.success) {
      if (res.complete) {
        // Logged in!
        return;
      }
      if (res.step === 'EMAIL_OTP_REQUIRED') {
        setTempToken(res.tempToken);
        setMaskedEmail(res.maskedEmail || 'admin@***');
        setStep(3);
      }
    } else {
      if (res.step === 'EMAIL_OTP_REQUIRED' && res.tempToken) {
        setTempToken(res.tempToken);
        setMaskedEmail(res.maskedEmail || 'admin@***');
        setStep(3);
      }
      setError(res.error || 'Failed to dispatch email. Check server logs.');
    }
  };

  // Step 3: Email OTP Verification
  const handleEmailOtpSubmit = async (e) => {
    e.preventDefault();
    if (!emailOtp || emailOtp.length < 6) return;
    setLoading(true);
    setError('');

    const res = await onStep3(tempToken, emailOtp);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Invalid email verification code');
    }
  };

  const handleBackToStep1 = () => {
    setStep(1);
    setPassword('');
    setTotpCode('');
    setEmailOtp('');
    setTempToken('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] flex flex-col justify-center items-center px-4 relative overflow-hidden transition-colors">
      {/* Background ambient lighting */}
      <div className="absolute w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -top-20 -left-20 pointer-events-none" />
      <div className="absolute w-96 h-96 bg-sky-500/5 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none" />

      <div className="w-full max-w-md bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-8 shadow-2xl shadow-zinc-900/10 dark:shadow-black/80 relative z-10">
        {/* Brand Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
              NexusControl <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 font-mono border border-zinc-200 dark:border-zinc-700/60">Hardened</span>
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Defense-in-Depth Operations Gate</p>
          </div>
        </div>

        {/* Multi-Step Pipeline Indicator */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-200 dark:border-zinc-800/60 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              step >= 1 ? 'bg-emerald-600 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-500'
            }`}>1</span>
            <span className={step === 1 ? 'text-zinc-900 dark:text-zinc-200 font-semibold' : 'text-zinc-500'}>Password</span>
          </div>
          <span className="text-zinc-300 dark:text-zinc-700">──</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              step >= 2 ? 'bg-emerald-600 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-500'
            }`}>2</span>
            <span className={step === 2 ? 'text-zinc-900 dark:text-zinc-200 font-semibold' : 'text-zinc-500'}>TOTP 2FA</span>
          </div>
          <span className="text-zinc-300 dark:text-zinc-700">──</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              step === 3 ? 'bg-emerald-600 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-500'
            }`}>3</span>
            <span className={step === 3 ? 'text-zinc-900 dark:text-zinc-200 font-semibold' : 'text-zinc-500'}>Email OTP</span>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Account & Access Key */}
        {step === 1 && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-300 dark:border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/50 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                  className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-300 dark:border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/50 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2.5 px-4 rounded-lg font-medium text-sm transition-colors duration-150 shadow-lg shadow-emerald-950/20 cursor-pointer"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Proceed to 2FA</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="text-[11px] text-zinc-500 text-center">Rate-limited to 5 attempts per 15 minutes</p>
          </form>
        )}

        {/* STEP 2: 2FA TOTP Code */}
        {step === 2 && (
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                  Step 2: Authenticator TOTP
                </label>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">6-Digit Code</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-300 dark:border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-center text-lg tracking-widest text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-700 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/50 font-mono font-bold"
                />
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
                Open Google Authenticator, Authy, or your password manager to retrieve your time-based one-time passcode.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={handleBackToStep1}
                className="px-3 py-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors text-xs font-mono flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <button
                type="submit"
                disabled={loading || totpCode.length < 6}
                className="flex-1 flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2.5 px-4 rounded-lg font-medium text-sm transition-colors duration-150 shadow-lg shadow-emerald-950/20 cursor-pointer"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Verify 2FA Token</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Email OTP Verification */}
        {step === 3 && (
          <form onSubmit={handleEmailOtpSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                  Step 3: Perimeter Email Verification
                </label>
                <span className="text-[10px] text-sky-600 dark:text-sky-400 font-mono">10m Expiry</span>
              </div>
              <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 mb-3 text-xs text-sky-700 dark:text-sky-300 flex items-start gap-2">
                <Mail className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  New session detected. An authorization code was sent to <strong className="font-mono text-zinc-900 dark:text-white">{maskedEmail}</strong>.
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
                  <Clock className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-300 dark:border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-center text-lg tracking-widest text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-700 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/50 font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={handleBackToStep1}
                className="px-3 py-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors text-xs font-mono flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || emailOtp.length < 6}
                className="flex-1 flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-2.5 px-4 rounded-lg font-medium text-sm transition-colors duration-150 shadow-lg shadow-emerald-950/20 cursor-pointer"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Authorize Session</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Security Footer */}
        <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            IP Whitelist Enforced
          </span>
          <span className="font-mono">Defense-in-Depth</span>
        </div>
      </div>
    </div>
  );
}
