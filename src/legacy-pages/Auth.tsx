import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, CheckCircle2, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { signInLocal, signUpLocal } from '../lib/supabaseData';

// Dark autofill override — prevents browser from applying white autofill bg.
const inputStyle: React.CSSProperties = {
  caretColor: '#C8FF00',
  WebkitBoxShadow: '0 0 0 1000px #1e1e1e inset',
  WebkitTextFillColor: '#f0f0f0',
};
/* ─── Password strength ──────────────────────────────────── */
const getStrength = (v: string) => {
  const score =
    (v.length >= 8 ? 1 : 0) +
    (/\d/.test(v) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(v) ? 1 : 0) +
    (/[A-Z]/.test(v) ? 1 : 0);
  if (score <= 1) return { label: 'Weak',   color: '#ff4d4d', w: '33%', n: 1 };
  if (score <= 3) return { label: 'Fair',   color: '#f59e0b', w: '66%', n: 2 };
  return             { label: 'Strong', color: '#4dff91', w: '100%', n: 3 };
};

const RESEND_WAIT = 60;
// Forgot-password is handled by the Next.js /login page which has Supabase fully configured.
const FORGOT_PASSWORD_URL = '/login?showForgot=1';

export const Auth: React.FC = () => {
  const { user } = useAuth();
  const emailRef = useRef<HTMLInputElement>(null);

  /* form */
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  /* inline feedback */
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [shakeKey, setShakeKey]   = useState(0);

  /* forgotEmail kept only for pre-filling the query param on redirect */
  const [forgotEmail, setForgotEmail] = useState('');

  const strength = getStrength(password);
  const isSignUp = mode === 'signup';

  if (user) return <Navigate to="/" replace />;

  /* ── helpers ── */
  const shake = () => setShakeKey((k) => k + 1);

  const setErr = (msg: string) => {
    setError(msg);
    setSuccess(null);
    setAlreadyExists(false);
    shake();
  };

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
    setSuccess(null);
    setAlreadyExists(false);
    setPassword('');
    setShowPw(false);
    setTimeout(() => emailRef.current?.focus(), 80);
  };

  /* ── forgot password — redirect to Next.js /login which has full Supabase reset ── */
  const goToForgotPassword = () => {
    const base = FORGOT_PASSWORD_URL;
    const withEmail = email.trim()
      ? `${base}&email=${encodeURIComponent(email.trim().toLowerCase())}`
      : base;
    // Use window.top so the redirect applies to the full page, not just the
    // iframe. When running outside an iframe (direct navigation) window.top
    // === window, so this is safe in both contexts.
    (window.top || window).location.href = withEmail;
  };

  /* autofocus on mount */
  useEffect(() => {
    setTimeout(() => emailRef.current?.focus(), 60);
  }, []);

  /* ── main submit ── */
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password;

    if (!trimmedEmail.includes('@')) { setErr('Enter a valid email address.'); return; }
    if (trimmedPassword.length < 6)  { setErr('Password must be at least 6 characters.'); return; }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setAlreadyExists(false);

    try {
      if (isSignUp) {
        await signUpLocal(trimmedEmail, trimmedPassword, trimmedEmail.split('@')[0]);
        setSuccess('Account created — welcome to Athlix!');
      } else {
        await signInLocal(trimmedEmail, trimmedPassword);
        setSuccess('Welcome back!');
      }
    } catch (err: any) {
      const msg: string = err?.message || 'An error occurred.';
      const lower = msg.toLowerCase();

      if (
        isSignUp &&
        (lower.includes('already registered') ||
          lower.includes('already in use') ||
          lower.includes('user_already_exists') ||
          lower.includes('already exists'))
      ) {
        /* existing account detected */
        setAlreadyExists(true);
        setError(null);
        setLoading(false);
        return;
      }

      if (msg.includes('Check your email')) {
        /* signup succeeded but email confirmation required */
        setSuccess(msg);
        setLoading(false);
        return;
      }

      setErr(
        lower.includes('invalid') || lower.includes('password') || lower.includes('credentials')
          ? 'Incorrect email or password. Try again.'
          : lower.includes('network') || lower.includes('fetch')
            ? 'Connection issue. Please try again.'
            : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col justify-center px-4 py-12 sm:px-6">

      {/* ── Wordmark ── */}
      <div className="mx-auto w-full max-w-[400px] mb-8 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[#C8FF00]/10 border border-[#C8FF00]/20 mx-auto mb-4">
          <Activity className="h-7 w-7 text-[#C8FF00]" />
        </div>
        <h1
          className="text-[48px] leading-none text-white"
          style={{ fontFamily: 'var(--font-bebas, "Arial Black", sans-serif)', letterSpacing: '0.04em' }}
        >
          ATHLIX
        </h1>
        <p className="mt-1.5 text-[14px] text-[#666]">Track. Recover. Perform.</p>
      </div>

      {/* ── Card ── */}
      <div className="mx-auto w-full max-w-[400px]">
        <motion.div
          key={shakeKey}
          animate={shakeKey > 0 ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6"
        >
          {/* Mode heading */}
          <h2 className="mb-5 text-[18px] font-semibold text-[#f0f0f0]">
            {isSignUp ? 'Create your account' : 'Sign in to Athlix'}
          </h2>

          {/* ── Already-exists banner ── */}
          <AnimatePresence>
            {alreadyExists && (
              <motion.div
                key="exists"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/8 p-3"
              >
                <p className="text-[13px] font-medium text-amber-200">
                  An account with this email already exists.
                </p>
                <button
                  type="button"
                  onClick={() => { setAlreadyExists(false); switchMode('signin'); }}
                  className="mt-2 inline-flex h-8 items-center rounded-md bg-amber-300 px-3 text-[12px] font-semibold text-amber-950"
                >
                  Sign in instead →
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Error banner ── */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                role="alert"
                className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-[#ff4d4d]/25 bg-[#ff4d4d]/8 p-3"
              >
                <p className="text-[13px] text-[#ff8080]">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="shrink-0 rounded p-0.5 text-[#ff8080]/70 hover:text-[#ff8080]"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Success banner ── */}
          <AnimatePresence>
            {success && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mb-4 flex items-center gap-2 rounded-lg border border-[#4dff91]/25 bg-[#4dff91]/8 p-3"
                aria-live="polite"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4dff91]" />
                <p className="text-[13px] text-[#4dff91]">{success}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Form ── */}
          <form onSubmit={handleAuth} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-[12px] font-medium text-[#888]">
                Email
              </label>
              <input
                ref={emailRef}
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                onBlur={() => { const t = email.trim().toLowerCase(); setEmail(t); if (!forgotEmail) setForgotEmail(t); }}
                disabled={loading}
                placeholder="you@example.com"
                className="h-11 w-full rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] px-3 text-[14px] text-[#f0f0f0] outline-none placeholder:text-[#444] transition-colors focus:border-[#C8FF00] focus:ring-0 disabled:opacity-50"
                style={inputStyle}
              />
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="auth-password" className="text-[12px] font-medium text-[#888]">
                  Password
                </label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={goToForgotPassword}
                    className="text-[11px] text-[#555] underline-offset-2 hover:text-[#C8FF00] hover:underline transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  disabled={loading}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] px-3 pr-10 text-[14px] text-[#f0f0f0] outline-none placeholder:text-[#444] transition-colors focus:border-[#C8FF00] disabled:opacity-50"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888] transition-colors"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength bar (sign-up only) */}
              {isSignUp && password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((seg) => (
                      <div
                        key={seg}
                        className="h-1 flex-1 rounded-full transition-all duration-200"
                        style={{ background: strength.n >= seg ? strength.color : '#2a2a2a' }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-4 text-[11px]">
                    <span style={{ color: strength.color }}>{strength.label}</span>
                    <span style={{ color: password.length >= 8 ? '#4dff91' : '#555' }}>
                      {password.length >= 8 ? '✓' : '○'} 8+ chars
                    </span>
                    <span style={{ color: /[\d^A-Za-z]/.test(password) && !/^[A-Za-z]*$/.test(password) ? '#4dff91' : '#555' }}>
                      {/[\d^A-Za-z]/.test(password) && !/^[A-Za-z]*$/.test(password) ? '✓' : '○'} number/symbol
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold transition-all disabled:opacity-50"
              style={{ background: '#C8FF00', color: '#000' }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#b0e000'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#C8FF00'; }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {isSignUp ? 'Creating account…' : 'Signing in…'}</>
                : isSignUp ? 'Create account' : 'Sign In'
              }
            </button>
          </form>

          {/* ── Divider + mode toggle ── */}
          <div className="mt-5">
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-[#3a3a3a]">
              <span className="h-px flex-1 bg-[#2a2a2a]" />
              <span>{isSignUp ? 'Already have an account?' : "Don't have an account?"}</span>
              <span className="h-px flex-1 bg-[#2a2a2a]" />
            </div>
            <button
              type="button"
              onClick={() => switchMode(isSignUp ? 'signin' : 'signup')}
              className="mt-3 flex h-10 w-full items-center justify-center rounded-lg border border-[#2a2a2a] text-[13px] font-medium text-[#888] transition-colors hover:border-[#444] hover:text-[#f0f0f0]"
            >
              {isSignUp ? 'Sign In instead' : 'Create an account'}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
