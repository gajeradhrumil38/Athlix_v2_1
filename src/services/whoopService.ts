import { format } from 'date-fns';
import type { WhoopRecovery, WhoopSleep, WhoopHeartRate, WhoopCycle } from '../types/whoop';
import { supabase } from '../lib/supabase';

const BASE = 'https://api.prod.whoop.com/developer';
const EDGE_FN = 'https://mrntwydykqsdawpklumf.supabase.co/functions/v1';


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

async function whoopFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
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
  token: string,
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
    const body: Record<string, unknown> = await whoopFetch<Record<string, unknown>>(token, path);
    results.push(...extractRecords(body));
    nextToken = (body.next_token as string) ?? null;
  } while (nextToken);

  return results;
}

export const whoopService = {
  // ── OAuth helpers ──────────────────────────────────────────

  /**
   * Save the user's own WHOOP Client ID + Secret to the edge function (server-side only),
   * then get back the OAuth authorization URL to redirect to.
   */
  async saveCredentialsAndGetAuthUrl(clientId: string, clientSecret: string): Promise<string> {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token;
    if (!jwt) throw new Error('Not authenticated');

    const res = await fetch(`${EDGE_FN}/whoop-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        action: 'save_credentials',
        clientId,
        clientSecret,
        returnUrl: window.location.href,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? 'Failed to save credentials');
    }

    const { authUrl } = await res.json() as { authUrl: string };
    return authUrl;
  },

  /** Get the stored access token for a user, refreshing via edge function if expired. */
  async getStoredToken(userId: string): Promise<string | null> {
    const { data } = await supabase
      .from('whoop_tokens')
      .select('access_token, expires_at')
      .eq('user_id', userId)
      .single();

    if (!data) return null;

    // Still valid with 5-min buffer
    if (Date.now() < new Date(data.expires_at).getTime() - 5 * 60 * 1000) {
      return data.access_token as string;
    }

    // Expired — ask edge function to refresh (client secret stays server-side)
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token;
    if (!jwt) return null;

    const res = await fetch(`${EDGE_FN}/whoop-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ action: 'refresh' }),
    });

    if (!res.ok) return null;
    const body = await res.json() as { access_token: string };
    return body.access_token;
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

  /** Remove the stored WHOOP tokens for a user. */
  async disconnect(userId: string): Promise<void> {
    await supabase.from('whoop_tokens').delete().eq('user_id', userId);
    cache.clear();
  },

  // ── Data fetchers ──────────────────────────────────────────

  /** Validates token — throws on 401/other errors */
  async validateToken(token: string): Promise<{ user_id: number; email: string; first_name: string; last_name: string }> {
    return whoopFetch(token, '/v1/user/profile/basic');
  },

  async fetchRecovery(token: string, startDate: string, endDate: string): Promise<WhoopRecovery[]> {
    const key = cacheKey('recovery', startDate, endDate);
    const cached = getCached<WhoopRecovery[]>(key);
    if (cached) return cached;

    const path = `/v1/recovery?start=${startDate}&end=${endDate}&limit=25`;
    const records = await fetchAllPages<WhoopRecovery>(token, path, (body) =>
      ((body.records as Record<string, unknown>[]) || []).map((r) => ({
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

  async fetchSleep(token: string, startDate: string, endDate: string): Promise<WhoopSleep[]> {
    const key = cacheKey('sleep', startDate, endDate);
    const cached = getCached<WhoopSleep[]>(key);
    if (cached) return cached;

    const path = `/v1/activity/sleep?start=${startDate}&end=${endDate}&limit=25`;
    const records = await fetchAllPages<WhoopSleep>(token, path, (body) =>
      ((body.records as Record<string, unknown>[]) || [])
        .filter((r) => !r.nap && r.score_state === 'SCORED')
        .map((r) => {
          const score = r.score as Record<string, unknown>;
          const stages = score?.stage_summary as Record<string, number> | undefined;
          return {
            date: format(new Date(r.start as string), 'yyyy-MM-dd'),
            sleep_efficiency_percentage: (score?.sleep_efficiency_percentage as number) ?? 0,
            total_in_bed_time_milli: stages?.total_in_bed_time_milli ?? 0,
            total_slow_wave_sleep_time_milli: stages?.total_slow_wave_sleep_time_milli,
          };
        }),
    );

    setCache(key, records);
    return records;
  },

  async fetchHeartRate(token: string, startDate: string, endDate: string): Promise<WhoopHeartRate[]> {
    const key = cacheKey('hr', startDate, endDate);
    const cached = getCached<WhoopHeartRate[]>(key);
    if (cached) return cached;

    const path = `/v1/metrics/heart_rate?start=${startDate}&end=${endDate}&step=60`;
    const body = await whoopFetch<Record<string, unknown>>(token, path);
    const records: WhoopHeartRate[] = ((body.values as Record<string, unknown>[]) || []).map((v) => ({
      timestamp: v.time as string,
      heart_rate_bpm: v.data as number,
    }));

    setCache(key, records);
    return records;
  },

  async fetchStepCount(token: string, startDate: string, endDate: string): Promise<WhoopCycle[]> {
    const key = cacheKey('steps', startDate, endDate);
    const cached = getCached<WhoopCycle[]>(key);
    if (cached) return cached;

    const path = `/v1/cycle?start=${startDate}&end=${endDate}&limit=25`;
    const records = await fetchAllPages<WhoopCycle>(token, path, (body) =>
      ((body.records as Record<string, unknown>[]) || []).map((r) => {
        const score = r.score as Record<string, number> | undefined;
        const kj = score?.kilojoule ?? 0;
        return {
          date: format(new Date(r.start as string), 'yyyy-MM-dd'),
          // WHOOP doesn't natively expose step count; estimated from kilojoules: 1 kJ ≈ 23.9 steps
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
