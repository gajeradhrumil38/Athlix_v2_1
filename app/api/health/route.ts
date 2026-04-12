import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET() {
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const env = {
    hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasPublicKey: Boolean(publicKey),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  if (!env.hasUrl || !env.hasPublicKey) {
    return NextResponse.json(
      {
        ok: false,
        issue: 'Missing required Supabase environment variables.',
        env,
        ts: new Date().toISOString(),
      },
      { status: 500 },
    );
  }

  try {
    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    const { error: profileQueryError } = await supabase.from('profiles').select('id').limit(1);

    return NextResponse.json({
      ok: !authError && !profileQueryError,
      service: 'athlix-next',
      env,
      authError: authError?.message ?? null,
      profileQueryError: profileQueryError?.message ?? null,
      authenticatedUserId: user?.id ?? null,
      ts: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        issue: error?.message || 'Supabase health check failed.',
        env,
        ts: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
