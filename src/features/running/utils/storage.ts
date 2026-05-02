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

export const saveRun = (runData: Omit<SavedRun, 'id'>): SavedRun => {
  const runs = getRuns();
  const saved: SavedRun = { id: Date.now(), ...runData };
  runs.push(saved);
  try {
    localStorage.setItem(KEY, JSON.stringify(runs));
  } catch {
    // Storage full — silently skip
  }
  return saved;
};

export const getRuns = (): SavedRun[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as SavedRun[];
  } catch {
    return [];
  }
};

export const deleteRun = (id: number): void => {
  const filtered = getRuns().filter((r) => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(filtered));
};
