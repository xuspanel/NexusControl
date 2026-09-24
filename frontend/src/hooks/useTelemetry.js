import { useState, useEffect, useCallback, useRef } from 'react';

export function useTelemetry() {
  const [token, setToken] = useState(() => localStorage.getItem('nx_token') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [telemetry, setTelemetry] = useState(null);
  const [profile, setProfile] = useState(null);
  const [connected, setConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());
  const [error, setError] = useState(null);

  const eventSourceRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Authenticate and verify
  const checkAuth = useCallback(async (authToken) => {
    const t = authToken || token;
    if (!t) {
      setIsAuthenticated(false);
      setIsAuthChecking(false);
      return false;
    }
    try {
      const res = await fetch('/api/auth/check', {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.ok) {
        setIsAuthenticated(true);
        setIsAuthChecking(false);
        return true;
      } else {
        localStorage.removeItem('nx_token');
        setToken('');
        setIsAuthenticated(false);
        setIsAuthChecking(false);
        return false;
      }
    } catch {
      setIsAuthenticated(false);
      setIsAuthChecking(false);
      return false;
    }
  }, [token]);

  // Multi-Step Authentication Pipeline
  const loginStep1 = async (password, username = 'admin') => {
    try {
      const res = await fetch('/api/auth/step1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || 'admin', password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.step === 'COMPLETE' && data.token) {
          localStorage.setItem('nx_token', data.token);
          setToken(data.token);
          setIsAuthenticated(true);
          return { success: true, complete: true, token: data.token, user: data.user };
        }
        return { success: true, tempToken: data.tempToken };
      }
      return { success: false, error: data.error || 'Invalid credentials' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const loginStep2Totp = async (tempToken, totpCode) => {
    try {
      const res = await fetch('/api/auth/step2-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, totpCode })
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Failed to dispatch email. Check server logs.',
          tempToken: data.tempToken,
          step: data.step,
          maskedEmail: data.maskedEmail
        };
      }

      if (data.token) {
        localStorage.setItem('nx_token', data.token);
        setToken(data.token);
        setIsAuthenticated(true);
        return { success: true, complete: true };
      }

      if (data.step === 'EMAIL_OTP_REQUIRED') {
        return {
          success: true,
          complete: false,
          step: 'EMAIL_OTP_REQUIRED',
          tempToken: data.tempToken,
          maskedEmail: data.maskedEmail
        };
      }

      return { success: false, error: 'Unexpected authentication state' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const loginStep3EmailOtp = async (tempToken, emailOtp) => {
    try {
      const res = await fetch('/api/auth/step3-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, emailOtp })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('nx_token', data.token);
        setToken(data.token);
        setIsAuthenticated(true);
        return { success: true, complete: true };
      }
      return { success: false, error: data.error || 'Invalid email verification code' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Logout handler
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    localStorage.removeItem('nx_token');
    setToken('');
    setIsAuthenticated(false);
  };

  // Fetch host hardware profile
  const fetchProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/system/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    }
  }, [token]);

  // Initial check on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Connect to SSE stream once authenticated
  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    fetchProfile();

    const connectSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `/api/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
        // Clear fallback polling
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setTelemetry(data);
          setLastHeartbeat(Date.now());
        } catch {}
      };

      es.onerror = () => {
        setConnected(false);
        es.close();

        // Fallback to polling every 2s while SSE reconnects
        if (!pollTimerRef.current) {
          pollTimerRef.current = setInterval(async () => {
            try {
              const res = await fetch('/api/system/metrics', {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                const data = await res.json();
                setTelemetry(data);
                setConnected(true);
              }
            } catch {}
          }, 2000);
        }

        // Retry SSE in 5 seconds
        setTimeout(connectSSE, 5000);
      };
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [isAuthenticated, token, fetchProfile]);

  return {
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
    lastHeartbeat,
    error,
    refreshProfile: fetchProfile
  };
}
