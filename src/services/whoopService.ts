import { format } from 'date-fns';
import type { WhoopRecovery, WhoopSleep, WhoopHeartRate, WhoopCycle } from '../types/whoop';
import { supabase } from '../lib/supabase';

const BASE = 'https://api.prod.whoop.com/developer';
const EDGE_FN = 'https://mrntwydykqsdawpklumf.supabase.co/functions/v1';
const WHOOP_CLIENT_ID = 'd00b485b-7052-4a22-ad29-c57ab43f0817';
const WHOOP_REDIRECT_URI = `${EDGE_FN}/whoop-oauth`;
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
// offline is required to receive a refresh_token (per WHOOP docs)
const WHOOP_SCOPES = 'offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement';


// Session-level cache — invalidated on page reload
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(method: string, start: string, end: string) {
  return `${method}:${start}:${end}`;
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// Proxy WHOOP API calls through the edge function to avoid browser CORS restrictions
async function whoopFetch<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;

  const res = await fetch(`${EDGE_FN}/whoop-oauth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ action: 'fetch', path }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`WHOOP ${res.status}: ${text || res.statusText}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function fetchAllPages<T>(
  basePath: string,
  extractRecords: (body: Record<string, unknown>) => T[],
): Promise<T[]> {
  const results: T[] = [];
  let nextToken: string | null = null;

  do {
    const sep = basePath.includes('?') ? '&' : '?';
    const path: string = nextToken
      ? `${basePath}${sep}nextToken=${encodeURIComponent(nextToken)}`
      : basePath;
    const body: Record<string, unknown> = await whoopFetch<Record<string, unknown>>(path);
    results.push(...extractRecords(body));
    nextToken = (body.next_token as string) ?? null;
  } while (nextToken);

  return results;
}

export const whoopService = {
  // ── OAuth helpers ──────────────────────────────────────────

  /** Build the WHOOP OAuth authorization URL. Opens in a popup — postMessages result back. */
  buildAuthUrl(userId: string): string {
    const callbackPage = `${window.location.origin}/#/whoop/callback`;
    const state = btoa(JSON.stringify({ userId, returnUrl: callbackPage }));
    const params = new URLSearchParams({
      client_id: WHOOP_CLIENT_ID,
      redirect_uri: WHOOP_REDIRECT_URI,
      response_type: 'code',
      scope: WHOOP_SCOPES,
      state,
    });
    return `${WHOOP_AUTH_URL}?${params.toString()}`;
  },

  /** Get the stored access token, refreshing via edge function if nearly expired. */
  async getStoredToken(userId: string): Promise<string | null> {
    const { data } = await supabase
      .from('whoop_tokens')
      .select('access_token, expires_at, refresh_token')
      .eq('user_id', userId)
      .single();

    if (!data) return null;

    const expiresAt = data.expires_at ? new Date(data.expires_at as string).getTime() : Infinity;
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return data.access_token as string;
    }

    if (!data.refresh_token) return data.access_token as string;

    const { data: session } = await supabase.auth.getSession();
    const jwt = session.session?.access_token;
    if (!jwt) return data.access_token as string;

    const res = await fetch(`${EDGE_FN}/whoop-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: 'refresh' }),
    });

    if (!res.ok) return data.access_token as string;
    const { access_token } = await res.json() as { access_token: string };
    return access_token;
  },

  /** Check whether the user has a stored WHOOP connection and return metadata. */
  async getConnectionInfo(userId: string): Promise<{ connected: boolean; connectedAt?: string } | null> {
    const { data } = await supabase
      .from('whoop_tokens')
      .select('created_at')
      .eq('user_id', userId)
      .single();

    return data ? { connected: true, connectedAt: data.created_at as string } : { connected: false };
  },

  /** Validate a personal access token then store it (fallback for when OAuth popup fails). */
  async connect(userId: string, token: string): Promise<void> {
    // Validate by calling WHOOP directly (not proxied — just for the initial token check)
    const res = await fetch(`${BASE}/v1/user/profile/basic`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Invalid token');
    await supabase.from('whoop_tokens').upsert({
      user_id: userId,
      access_token: token,
      refresh_token: null,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
  },

  /** Remove the stored WHOOP token for a user. */
  async disconnect(userId: string): Promise<void> {
    await supabase.from('whoop_tokens').delete().eq('user_id', userId);
    cache.clear();
  },

  // ── Data fetchers (all proxied server-side — no CORS issues) ──

  /** Validates token — throws on 401/other errors */
  async validateToken(token: string): Promise<{ user_id: number; email: string; first_name: string; last_name: string }> {
    const res = await fetch(`${BASE}/v1/user/profile/basic`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Invalid token');
    return res.json();
  },

  // Pass startDate/endDate for range queries; omit both for "most recent" (Day tab)
  async fetchRecovery(startDate?: string, endDate?: string): Promise<WhoopRecovery[]> {
    const key = cacheKey('recovery', startDate ?? 'latest', endDate ?? 'latest');
    const cached = getCached<WhoopRecovery[]>(key);
    if (cached) return cached;

    // No date filter → fetch most recent scored records (descending order from WHOOP)
    const path = startDate && endDate
      ? `/v1/recovery?start=${startDate}&end=${endDate}&limit=25`
      : `/v1/recovery?limit=10`;

    const records = await fetchAllPages<WhoopRecovery>(path, (body) =>
      ((body.records as Record<string, unknown>[]) || [])
        .filter((r) => (r.score_state as string) === 'SCORED')
        .map((r) => ({
          date: format(new Date(r.created_at as string), 'yyyy-MM-dd'),
          recovery_score: (r.score as Record<string, number>)?.recovery_score ?? 0,
          hrv_rmssd_milli: (r.score as Record<string, number>)?.hrv_rmssd_milli ?? 0,
          resting_heart_rate: (r.score as Record<string, number>)?.resting_heart_rate ?? 0,
          skin_temp_celsius: (r.score as Record<string, number>)?.skin_temp_celsius,
        })),
    );

    setCache(key, records);
    return records;
  },

  // Pass startDate/endDate for range queries; omit both for "most recent" (Day tab)
  async fetchSleep(startDate?: string, endDate?: string): Promise<WhoopSleep[]> {
    const key = cacheKey('sleep', startDate ?? 'latest', endDate ?? 'latest');
    const cached = getCached<WhoopSleep[]>(key);
    if (cached) return cached;

    const path = startDate && endDate
      ? `/v1/activity/sleep?start=${startDate}&end=${endDate}&limit=25`
      : `/v1/activity/sleep?limit=10`;

    const records = await fetchAllPages<WhoopSleep>(path, (body) =>
      ((body.records as Record<string, unknown>[]) || [])
        .filter((r) => !r.nap && (r.score_state === 'SCORED' || r.score_state === 'PENDING_SCORE'))
        .map((r) => {
          const score = r.score as Record<string, unknown>;
          const stages = score?.stage_summary as Record<string, number> | undefined;
          return {
            date: format(new Date(r.start as string), 'yyyy-MM-dd'),
            sleep_performance_percentage: (score?.sleep_performance_percentage as number) ?? 0,
            sleep_efficiency_percentage: (score?.sleep_efficiency_percentage as number) ?? 0,
            total_in_bed_duration_milli: stages?.total_in_bed_duration_milli ?? 0,
            total_slow_wave_sleep_duration_milli: stages?.total_slow_wave_sleep_duration_milli,
          };
        }),
    );

    setCache(key, records);
    return records;
  },

  async fetchHeartRate(startDate: string, endDate: string): Promise<WhoopHeartRate[]> {
    const key = cacheKey('hr', startDate, endDate);
    const cached = getCached<WhoopHeartRate[]>(key);
    if (cached) return cached;

    const path = `/v1/metrics/heart_rate?start=${startDate}&end=${endDate}&step=60`;
    const body = await whoopFetch<Record<string, unknown>>(path);
    const records: WhoopHeartRate[] = ((body.values as Record<string, unknown>[]) || []).map((v) => ({
      timestamp: v.time as string,
      heart_rate_bpm: v.data as number,
    }));

    setCache(key, records);
    return records;
  },

  async fetchStepCount(startDate?: string, endDate?: string): Promise<WhoopCycle[]> {
    const key = cacheKey('steps', startDate ?? 'latest', endDate ?? 'latest');
    const cached = getCached<WhoopCycle[]>(key);
    if (cached) return cached;

    const path = startDate && endDate
      ? `/v1/cycle?start=${startDate}&end=${endDate}&limit=25`
      : `/v1/cycle?limit=5`;
    const records = await fetchAllPages<WhoopCycle>(path, (body) =>
      ((body.records as Record<string, unknown>[]) || []).map((r) => {
        const score = r.score as Record<string, number> | undefined;
        const kj = score?.kilojoule ?? 0;
        return {
          date: format(new Date(r.start as string), 'yyyy-MM-dd'),
          estimated_steps: Math.round(kj * 23.9),
          raw_kilojoules: kj,
          strain_score: score?.strain,
        };
      }),
    );

    setCache(key, records);
    return records;
  },
};
