// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/whoop-oauth`;
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const PROFILE_URL = 'https://api.prod.whoop.com/developer/v1/user/profile/basic';
const SCOPES = 'read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function getUserFromJwt(sb: any, req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''));
  return user ?? null;
}

async function getCredentials(sb: any, userId: string): Promise<{ client_id: string; client_secret: string } | null> {
  const { data } = await sb
    .from('whoop_credentials')
    .select('client_id, client_secret')
    .eq('user_id', userId)
    .single();
  return data ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── POST: save credentials + get auth URL  OR  refresh token ──
  if (req.method === 'POST') {
    const user = await getUserFromJwt(sb, req);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as any;

    // ── save_credentials: store Client ID + Secret, return OAuth URL ──
    if (body.action === 'save_credentials') {
      const { clientId, clientSecret, returnUrl } = body;
      if (!clientId || !clientSecret || !returnUrl) {
        return json({ error: 'clientId, clientSecret and returnUrl are required' }, 400);
      }

      await sb.from('whoop_credentials').upsert({
        user_id: user.id,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const state = btoa(JSON.stringify({ userId: user.id, returnUrl }));
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        state,
      });

      return json({ authUrl: `${AUTH_URL}?${params.toString()}` });
    }

    // ── refresh: exchange refresh_token for new access_token ──
    const creds = await getCredentials(sb, user.id);
    if (!creds) return json({ error: 'No credentials stored' }, 404);

    const { data: row } = await sb
      .from('whoop_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .single();

    if (!row?.refresh_token) return json({ error: 'Not connected' }, 404);

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
      }),
    });

    if (!tokenRes.ok) return json({ error: 'Token refresh failed' }, 400);

    const t = await tokenRes.json() as any;
    const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();

    await sb.from('whoop_tokens').upsert({
      user_id: user.id,
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? row.refresh_token,
      expires_at: expiresAt,
    });

    return json({ access_token: t.access_token, expires_at: expiresAt });
  }

  // ── GET: OAuth callback from WHOOP ─────────────────────────────
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

  // Look up the user's own Client ID + Secret
  const creds = await getCredentials(sb, userId);
  if (!creds) return errorRedirect('Credentials not found — re-enter your Client ID & Secret');

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    return errorRedirect(`Token exchange failed: ${text}`);
  }

  const tokens = await tokenRes.json() as any;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const profileRes = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json().catch(() => ({})) as any;

  const { error: dbErr } = await sb.from('whoop_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    whoop_user_id: profile.user_id ?? null,
  });

  if (dbErr) return errorRedirect('Failed to save connection');

  const successUrl = new URL(returnUrl);
  successUrl.hash = successUrl.hash + '?whoop=connected';
  return Response.redirect(successUrl.href, 302);
});
