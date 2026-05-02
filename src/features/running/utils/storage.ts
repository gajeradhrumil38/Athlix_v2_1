import type { GpsPoint } from './gpsCalculations';

export interface SavedRun {
  id: number;
  path: GpsPoint[];
  distance: number;
  duration: number;
  pace: number;
  timestamp: number;
}

const KEY = 'athlix:runs';
const MAX_STORED_RUNS = 120;
const MAX_STORED_PATH_POINTS = 1500;
const MAX_RUN_AGE_MS = 1000 * 60 * 60 * 24 * 120; // 120 days

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const sanitizePoint = (point: unknown): GpsPoint | null => {
  if (!point || typeof point !== 'object') return null;
  const maybePoint = point as Partial<GpsPoint>;
  if (!isFiniteNumber(maybePoint.lat) || !isFiniteNumber(maybePoint.lng)) return null;
  if (maybePoint.lat < -90 || maybePoint.lat > 90) return null;
  if (maybePoint.lng < -180 || maybePoint.lng > 180) return null;

  const sanitized: GpsPoint = { lat: maybePoint.lat, lng: maybePoint.lng };
  if (isFiniteNumber(maybePoint.accuracy)) sanitized.accuracy = maybePoint.accuracy;
  if (isFiniteNumber(maybePoint.timestamp)) sanitized.timestamp = maybePoint.timestamp;
  return sanitized;
};

const sanitizeRun = (run: unknown): SavedRun | null => {
  if (!run || typeof run !== 'object') return null;
  const maybeRun = run as Partial<SavedRun>;
  if (!isFiniteNumber(maybeRun.id)) return null;
  if (!isFiniteNumber(maybeRun.distance) || maybeRun.distance < 0) return null;
  if (!isFiniteNumber(maybeRun.duration) || maybeRun.duration < 0) return null;
  if (!isFiniteNumber(maybeRun.pace) || maybeRun.pace < 0) return null;
  if (!isFiniteNumber(maybeRun.timestamp) || maybeRun.timestamp < 0) return null;
  if (!Array.isArray(maybeRun.path)) return null;

  const path = maybeRun.path
    .map((point) => sanitizePoint(point))
    .filter((point): point is GpsPoint => point !== null)
    .slice(-MAX_STORED_PATH_POINTS);

  return {
    id: maybeRun.id,
    path,
    distance: maybeRun.distance,
    duration: maybeRun.duration,
    pace: maybeRun.pace,
    timestamp: maybeRun.timestamp,
  };
};

const normalizeRuns = (rawRuns: unknown): SavedRun[] => {
  if (!Array.isArray(rawRuns)) return [];

  const cutoff = Date.now() - MAX_RUN_AGE_MS;

  return rawRuns
    .map((item) => sanitizeRun(item))
    .filter((item): item is SavedRun => item !== null)
    .filter((item) => item.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_STORED_RUNS);
};

export const saveRun = (runData: Omit<SavedRun, 'id'>): SavedRun => {
  const runs = getRuns();
  const normalizedPath = runData.path
    .map((point) => sanitizePoint(point))
    .filter((point): point is GpsPoint => point !== null)
    .slice(-MAX_STORED_PATH_POINTS);

  const saved: SavedRun = {
    id: Date.now(),
    path: normalizedPath,
    distance: Number.isFinite(runData.distance) && runData.distance > 0 ? runData.distance : 0,
    duration: Number.isFinite(runData.duration) && runData.duration > 0 ? runData.duration : 0,
    pace: Number.isFinite(runData.pace) && runData.pace > 0 ? runData.pace : 0,
    timestamp: Number.isFinite(runData.timestamp) && runData.timestamp > 0 ? runData.timestamp : Date.now(),
  };

  runs.push(saved);
  try {
    const normalizedRuns = normalizeRuns(runs);
    localStorage.setItem(KEY, JSON.stringify(normalizedRuns));
  } catch {
    // Storage full — silently skip
  }
  return saved;
};

export const getRuns = (): SavedRun[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return normalizeRuns(parsed);
  } catch {
    return [];
  }
};

export const deleteRun = (id: number): void => {
  try {
    const filtered = getRuns().filter((r) => r.id !== id);
    localStorage.setItem(KEY, JSON.stringify(filtered));
  } catch {
    // Ignore storage write failures
  }
};
