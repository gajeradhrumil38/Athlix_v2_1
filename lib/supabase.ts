import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getRequiredEnv = (name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY') => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
}

export async function createServerSupabaseClient() {
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anon = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: any[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll can be called from a Server Component.
          // In that case, middleware should handle session refresh.
        }
      },
    },
  });
}

export async function createRouteHandlerSupabaseClient() {
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anon = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: any[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

export function createServiceRoleSupabaseClient() {
  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient<Database>(getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'), supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
