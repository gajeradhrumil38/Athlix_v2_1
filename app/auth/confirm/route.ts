/**
 * /auth/confirm — password-reset callback
 *
 * Supabase sends the user here after they click the reset-password email.
 * The URL will look like:
 *   https://athlix-v2-1.vercel.app/auth/confirm?token_hash=XXX&type=recovery
 *
 * We verify the OTP, forward the resulting session cookie to /reset-password,
 * and the user can set their new password.
 *
 * NOTE: Add https://athlix-v2-1.vercel.app/auth/confirm to the
 * "Redirect URLs" list in Supabase Dashboard → Authentication → URL Configuration.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_SUPABASE_URL = 'https://mrntwydykqsdawpklumf.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'sb_publishable_h8Mv7ku_c2I9XIS1tzarYQ_ozj9Dkxw';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type       = searchParams.get('type'); // 'recovery' for password reset

  if (token_hash && type) {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  || DEFAULT_SUPABASE_URL;
    const key  =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY        ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      DEFAULT_SUPABASE_KEY;

    // Collect cookies Supabase sets so we can attach them to the redirect.
    // Without this, the session cookie would be lost on the NextResponse.redirect.
    const cookiesToForward: {
      name: string;
      value: string;
      options: Record<string, unknown>;
    }[] = [];

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((c) => cookiesToForward.push(c));
        },
      },
    });

    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: type as any,
    });

    if (!error) {
      const destination = type === 'recovery' ? '/reset-password' : '/dashboard';
      const redirectResponse = NextResponse.redirect(`${origin}${destination}`);
      cookiesToForward.forEach(({ name, value, options }) => {
        redirectResponse.cookies.set(
          name,
          value,
          options as Parameters<typeof redirectResponse.cookies.set>[2],
        );
      });
      return redirectResponse;
    }
  }

  // Token missing, wrong type, or already used — send back to login
  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
