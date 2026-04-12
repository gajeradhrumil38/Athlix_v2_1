'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackError = params.get('error');
    if (callbackError) {
      setNotice(callbackError);
    }
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const callbackUrl = `${window.location.origin}/auth/callback`;

      const action = mode === 'signin'
        ? supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        : supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              emailRedirectTo: callbackUrl,
            },
          });

      const { data, error: authError } = await action;
      if (authError) throw authError;

      if (mode === 'signup' && !data.session) {
        setNotice(
          'Account created. Check your email for a confirmation link, then return and sign in.',
        );
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (submitError: any) {
      setError(submitError?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="stack" style={{ maxWidth: 460 }}>
      <h1 style={{ marginBottom: 0 }}>Auth</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Supabase email/password sign in and sign up.
      </p>

      <form className="card stack" onSubmit={onSubmit}>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        {error ? <p style={{ color: '#f87171', margin: 0 }}>{error}</p> : null}
        {notice ? <p style={{ color: '#67e8f9', margin: 0 }}>{notice}</p> : null}
        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <button
        className="button"
        style={{ background: '#334155' }}
        onClick={() => setMode((v) => (v === 'signin' ? 'signup' : 'signin'))}
        type="button"
      >
        Switch to {mode === 'signin' ? 'Sign Up' : 'Sign In'}
      </button>
    </main>
  );
}
