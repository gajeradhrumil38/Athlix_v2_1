import { format } from 'date-fns';
import type { WhoopRecovery, WhoopSleep, WhoopHeartRate, WhoopCycle } from '../types/whoop';

const BASE = 'https://api.prod.whoop.com/developer';

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

// Follows next_token pagination until exhausted
async function fetchAllPages<T>(
  token: string,
  basePath: string,
  extractRecords: (body: Record<string, unknown>) => T[],
): Promise<T[]> {
  const results: T[] = [];
  let nextToken: string | null = null;

  do {
    const sep = basePath.includes('?') ? '&' : '?';
    const path = nextToken
      ? `${basePath}${sep}nextToken=${encodeURIComponent(nextToken)}`
      : basePath;
    const body = await whoopFetch<Record<string, unknown>>(token, path);
    results.push(...extractRecords(body));
    nextToken = (body.next_token as string) ?? null;
  } while (nextToken);

  return results;
}

export const whoopService = {
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
        const kj = ((r.score as Record<string, number>)?.kilojoule) ?? 0;
        return {
          date: format(new Date(r.start as string), 'yyyy-MM-dd'),
          // WHOOP doesn't natively expose step count; estimated from kilojoules: 1 kJ ≈ 23.9 steps
          estimated_steps: Math.round(kj * 23.9),
          raw_kilojoules: kj,
        };
      }),
    );

    setCache(key, records);
    return records;
  },
};
