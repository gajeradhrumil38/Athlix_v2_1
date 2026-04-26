// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('WHOOP_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('WHOOP_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/whoop-oauth`;
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const PROFILE_URL = 'https://api.prod.whoop.com/developer/v1/user/profile/basic';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // ── POST: refresh an existing access token ─────────────────
  if (req.method === 'POST') {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response('Unauthorized', { status: 401 });

    const jwt = auth.replace('Bearer ', '');
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) return new Response('Unauthorized', { status: 401 });

    const { data: row } = await sb
      .from('whoop_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .single();

    if (!row?.refresh_token) return new Response('Not connected', { status: 404 });

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const t = await tokenRes.json();
    const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();

    await sb.from('whoop_tokens').upsert({
      user_id: user.id,
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? row.refresh_token,
      expires_at: expiresAt,
    });

    return new Response(JSON.stringify({ access_token: t.access_token, expires_at: expiresAt }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ── GET: OAuth callback from WHOOP ─────────────────────────
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const oauthErrorDesc = url.searchParams.get('error_description');

  let returnUrl = '';
  let userId = '';

  try {
    const decoded = JSON.parse(atob(state ?? '')) as { userId: string; returnUrl: string };
    returnUrl = decoded.returnUrl ?? '';
    userId = decoded.userId ?? '';
  } catch {
    return new Response('Invalid OAuth state', { status: 400 });
  }

  const errorRedirect = (msg: string) => {
    const u = new URL(returnUrl);
    u.hash = u.hash + '?whoop=error&msg=' + encodeURIComponent(msg);
    return Response.redirect(u.href, 302);
  };

  if (oauthError || !code) {
    return errorRedirect(oauthErrorDesc ?? oauthError ?? 'OAuth cancelled');
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    return errorRedirect(`Token exchange failed: ${text}`);
  }

  const tokens = await tokenRes.json() as any;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Fetch WHOOP profile to store whoop_user_id
  const profileRes = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json().catch(() => ({})) as any;

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { error: dbErr } = await sb.from('whoop_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    whoop_user_id: profile.user_id ?? null,
    connected_at: new Date().toISOString(),
  });

  if (dbErr) return errorRedirect('Failed to save connection');

  // Redirect back into the app hash route
  const successUrl = new URL(returnUrl);
  successUrl.hash = successUrl.hash + '?whoop=connected';
  return Response.redirect(successUrl.href, 302);
});
