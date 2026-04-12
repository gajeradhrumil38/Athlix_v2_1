'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, ShieldAlert, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createBrowserSupabaseClient } from '@/lib/supabase';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const ATTEMPT_STORAGE_KEY = 'athlix_login_guard_v1';
const REMEMBER_STORAGE_KEY = 'athlix_remember_email_v1';

const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  rememberMe: z.boolean(),
});

type SignInFormValues = z.infer<typeof signInSchema>;

type AttemptState = {
  failedAttempts: number;
  lockUntil: number | null;
};

const initialAttemptState: AttemptState = {
  failedAttempts: 0,
  lockUntil: null,
};

const isLockedOut = (state: AttemptState) =>
  Boolean(state.lockUntil && state.lockUntil > Date.now());

const formatRemainingLockTime = (state: AttemptState) => {
  if (!state.lockUntil) return null;
  const msLeft = state.lockUntil - Date.now();
  if (msLeft <= 0) return null;
  const minutes = Math.ceil(msLeft / 60000);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

const normalizeAttemptState = (state: AttemptState): AttemptState => {
  if (!state.lockUntil) return state;
  if (state.lockUntil <= Date.now()) return initialAttemptState;
  return state;
};

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [attemptState, setAttemptState] = useState<AttemptState>(initialAttemptState);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true,
    },
  });

  const watchedEmail = watch('email');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackError = params.get('error');
    const mode = params.get('mode');

    if (mode === 'signup') {
      setAuthMode('signup');
    }
    if (callbackError) {
      setErrorBanner('Unable to sign in. Please try again.');
    }

    const storedAttemptState = localStorage.getItem(ATTEMPT_STORAGE_KEY);
    if (storedAttemptState) {
      try {
        const parsed = JSON.parse(storedAttemptState) as AttemptState;
        const normalized = normalizeAttemptState(parsed);
        setAttemptState(normalized);
        localStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        localStorage.removeItem(ATTEMPT_STORAGE_KEY);
      }
    }

    const rememberedEmail = localStorage.getItem(REMEMBER_STORAGE_KEY);
    if (rememberedEmail) {
      setValue('email', rememberedEmail);
      setForgotPasswordEmail(rememberedEmail);
    }
  }, [setValue]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAttemptState((current) => normalizeAttemptState(current));
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(attemptState));
  }, [attemptState]);

  const saveRememberPreference = (rememberMe: boolean, email: string) => {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_STORAGE_KEY, email.trim().toLowerCase());
    } else {
      localStorage.removeItem(REMEMBER_STORAGE_KEY);
    }
  };

  const markFailedAttempt = () => {
    setAttemptState((current) => {
      const normalized = normalizeAttemptState(current);
      const nextFailedAttempts = normalized.failedAttempts + 1;

      if (nextFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        return {
          failedAttempts: MAX_FAILED_ATTEMPTS,
          lockUntil: Date.now() + LOCKOUT_DURATION_MS,
        };
      }

      return {
        failedAttempts: nextFailedAttempts,
        lockUntil: null,
      };
    });
  };

  const clearRateLimit = () => {
    setAttemptState(initialAttemptState);
  };

  const onSubmit = async (values: SignInFormValues) => {
    const normalizedAttemptState = normalizeAttemptState(attemptState);
    if (isLockedOut(normalizedAttemptState)) {
      const lockTime = formatRemainingLockTime(normalizedAttemptState) || 'a few minutes';
      setErrorBanner(`Too many attempts. Try again in ${lockTime}.`);
      return;
    }

    setErrorBanner(null);
    setSuccessState(null);
    setForgotPasswordMessage(null);
    setIsSubmittingForm(true);

    const sanitizedEmail = values.email.trim().toLowerCase();
    const sanitizedPassword = values.password.trim();

    try {
      if (authMode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: sanitizedEmail,
          password: sanitizedPassword,
        });

        if (error) {
          markFailedAttempt();
          setValue('password', '');
          setErrorBanner('Invalid email or password.');
          return;
        }

        saveRememberPreference(values.rememberMe, sanitizedEmail);
        clearRateLimit();
        setSuccessState('Signing you in...');
        router.replace('/dashboard');
        router.refresh();
        return;
      }

      const callbackUrl = `${window.location.origin}/auth/callback?next=/dashboard`;
      const { data, error } = await supabase.auth.signUp({
        email: sanitizedEmail,
        password: sanitizedPassword,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });

      if (error) {
        setValue('password', '');
        setErrorBanner('Unable to create account. Please try again.');
        return;
      }

      if (!data.session) {
        setSuccessState('Account created. Check your email to confirm and continue.');
      } else {
        setSuccessState('Signing you in...');
        router.replace('/dashboard');
        router.refresh();
      }
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const signInWithGoogle = async () => {
    const normalizedAttemptState = normalizeAttemptState(attemptState);
    if (isLockedOut(normalizedAttemptState)) {
      const lockTime = formatRemainingLockTime(normalizedAttemptState) || 'a few minutes';
      setErrorBanner(`Too many attempts. Try again in ${lockTime}.`);
      return;
    }

    setErrorBanner(null);
    setOauthLoading(true);

    try {
      const callbackUrl = `${window.location.origin}/auth/callback?next=/dashboard`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        setErrorBanner('Unable to continue with Google. Please try again.');
      }
    } finally {
      setOauthLoading(false);
    }
  };

  const sendPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const candidate = (forgotPasswordEmail || watchedEmail || '').trim().toLowerCase();
    const parsed = z.string().email().safeParse(candidate);

    if (!parsed.success) {
      setForgotPasswordMessage('Enter a valid email address to reset your password.');
      return;
    }

    setForgotPasswordMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/auth/callback?next=/login`,
    });

    if (error) {
      setForgotPasswordMessage('Unable to send reset link right now. Please try again.');
      return;
    }

    setForgotPasswordMessage('Check your email for a reset link.');
  };

  const lockoutTime = formatRemainingLockTime(attemptState);
  const hardLocked = isLockedOut(attemptState);
  const showAttemptWarning = !hardLocked && attemptState.failedAttempts >= 3;
  const disableAuthActions = isSubmittingForm || oauthLoading || hardLocked;

  return (
    <main className="min-h-screen w-full bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[82vh] max-w-6xl items-center justify-center">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full max-w-[420px] rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl backdrop-blur"
          aria-label="Authentication form"
        >
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-400">Athlix</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              {authMode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Secure sign-in with Supabase Auth and PKCE session flow.
            </p>
          </div>

          {errorBanner ? (
            <div
              className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-600/40 bg-rose-600/15 px-3 py-2 text-sm text-rose-200"
              role="alert"
              aria-live="assertive"
            >
              <span>{errorBanner}</span>
              <button
                type="button"
                className="rounded p-1 text-rose-200 hover:bg-rose-600/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                onClick={() => setErrorBanner(null)}
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {showAttemptWarning ? (
            <div
              className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
              role="status"
              aria-live="polite"
            >
              Too many attempts. Please check your credentials carefully.
            </div>
          ) : null}

          {hardLocked ? (
            <div
              className="mb-4 flex items-start gap-2 rounded-xl border border-rose-700/50 bg-rose-700/20 px-3 py-2 text-sm text-rose-100"
              role="alert"
              aria-live="assertive"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Account temporarily locked after multiple failed attempts. Try again in {lockoutTime || 'a few minutes'}.
              </span>
            </div>
          ) : null}

          {successState ? (
            <div
              className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
              role="status"
              aria-live="polite"
            >
              {successState}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-slate-200">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                disabled={disableAuthActions}
                className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                aria-invalid={Boolean(errors.email)}
                aria-label="Email"
                {...register('email')}
              />
              {errors.email ? (
                <p className="text-xs text-rose-300">{errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-200">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                  disabled={disableAuthActions}
                  className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pr-10 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                  aria-invalid={Boolean(errors.password)}
                  aria-label="Password"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-2 my-auto inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={disableAuthActions}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password ? (
                <p className="text-xs text-rose-300">{errors.password.message}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                  disabled={disableAuthActions}
                  {...register('rememberMe')}
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword((v) => !v);
                  setForgotPasswordMessage(null);
                  setForgotPasswordEmail((prev) => prev || watchedEmail.trim());
                }}
                className="text-sm text-cyan-300 underline-offset-4 hover:text-cyan-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={disableAuthActions}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-700 disabled:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              {isSubmittingForm ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : authMode === 'signin' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {showForgotPassword ? (
            <form
              className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3"
              onSubmit={sendPasswordReset}
              noValidate
            >
              <label htmlFor="forgot-email" className="text-sm font-medium text-slate-200">
                Reset password via email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={forgotPasswordEmail}
                onChange={(e) => setForgotPasswordEmail(e.target.value.trim())}
                className="block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                placeholder="you@example.com"
                aria-label="Reset password email"
              />
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                Send reset link
              </button>
              {forgotPasswordMessage ? (
                <p className="text-xs text-slate-300" aria-live="polite">
                  {forgotPasswordMessage}
                </p>
              ) : null}
            </form>
          ) : null}

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
            <span className="h-px flex-1 bg-slate-800" />
            <span>or</span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={disableAuthActions}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            aria-label="Continue with Google"
          >
            {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue with Google
          </button>

          <p className="mt-5 text-center text-sm text-slate-400">
            {authMode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setAuthMode((v) => (v === 'signin' ? 'signup' : 'signin'));
                setErrorBanner(null);
                setSuccessState(null);
                reset({
                  email: watchedEmail,
                  password: '',
                  rememberMe: true,
                });
              }}
              className="font-medium text-cyan-300 underline-offset-4 hover:text-cyan-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              {authMode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>

          <p className="mt-3 text-center text-xs text-slate-500">
            Protected by Supabase Auth with secure session handling.
          </p>

          <div className="mt-4 text-center text-xs text-slate-500">
            <Link href="/" className="hover:text-slate-300 hover:underline">
              Back to home
            </Link>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
