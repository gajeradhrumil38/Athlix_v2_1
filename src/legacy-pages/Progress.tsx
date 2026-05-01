import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useHeartRate, type HeartRateSample } from '../contexts/HeartRateContext';
import {
  addDays,
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfToday,
  startOfWeek,
  subDays,
  subWeeks,
} from 'date-fns';

import { LineChart, AreaChart, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Trophy, TrendingUp, Activity, Scale, ChevronDown, Heart, Bluetooth, PlugZap, Unplug, Info, Zap, Flame } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ExerciseImage } from '../components/shared/ExerciseImage';
import {
  getBodyWeightLogs,
  getExerciseRowsWithWorkoutDates,
  getHeartRateSamples,
  getPersonalRecords,
  getWorkouts,
  logBodyWeight,
} from '../lib/supabaseData';
import { parseDateAtStartOfDay } from '../lib/dates';
import { convertWeight, isWeightUnit, type WeightUnit } from '../lib/units';

const HEART_RATE_ZONES = [
  { id: 'z1', name: 'Recovery', range: '50-94',   color: 'var(--back)'   },
  { id: 'z2', name: 'Easy',     range: '95-124',  color: 'var(--accent)' },
  { id: 'z3', name: 'Moderate', range: '125-154', color: 'var(--yellow)' },
  { id: 'z4', name: 'Hard',     range: '155-174', color: 'var(--legs)'   },
  { id: 'z5', name: 'Peak',     range: '175+',    color: 'var(--red)'    },
] as const;

const HEART_RATE_GAP_BREAK_MS = 5000;
const LIVE_WAVEFORM_RANGE_MS = 12 * 60 * 60 * 1000;
const DEFAULT_LIVE_WAVEFORM_WINDOW_MS = 15 * 60 * 1000;
const DAY_WAVEFORM_RANGE_MS = 24 * 60 * 60 * 1000;
const MIN_WAVEFORM_WINDOW_MS = 5 * 60 * 1000;
const MAX_WAVEFORM_CHART_POINTS = 180;
const HEART_RATE_HISTORY_LOOKBACK_DAYS = 45;

type HeartRateViewMode = 'live' | 'day' | 'week' | 'month';
const ZONE_SHORT_LABEL_BY_ID: Record<string, string> = {
  z1: 'Rec',
  z2: 'Easy',
  z3: 'Mod',
  z4: 'Hard',
  z5: 'Peak',
};

const getHeartRateZoneIndex = (bpm: number) => {
  if (bpm < 95) return 0;
  if (bpm < 125) return 1;
  if (bpm < 155) return 2;
  if (bpm < 175) return 3;
  return 4;
};

const getHeartRateZoneColor = (bpm: number | null) => {
  if (bpm == null || !Number.isFinite(bpm)) return 'rgba(255,255,255,0.14)';
  return HEART_RATE_ZONES[getHeartRateZoneIndex(bpm)].color;
};

const withAlpha = (color: string, alpha: number): string => {
  if (alpha <= 0) return 'transparent';
  const pct = Math.round(alpha * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
};

const averageHeartRateSamples = (samples: HeartRateSample[]) => {
  if (!samples.length) return null;
  return Math.round(samples.reduce((sum, sample) => sum + sample.bpm, 0) / samples.length);
};

const mergeHeartRateSamples = (stored: HeartRateSample[], live: HeartRateSample[]) => {
  const deduped = new Map<string, HeartRateSample>();
  [...stored, ...live]
    .sort((a, b) => a.ts - b.ts)
    .forEach((sample) => {
      deduped.set(`${sample.ts}:${sample.bpm}`, sample);
    });
  return Array.from(deduped.values()).sort((a, b) => a.ts - b.ts);
};

const aggregateHeartRateSamples = (
  samples: HeartRateSample[],
  startTs: number,
  endTs: number,
  targetPoints: number,
) => {
  if (!samples.length || endTs <= startTs) return [];

  const bucketMs = Math.max(1000, Math.ceil((endTs - startTs) / Math.max(1, targetPoints)));
  const buckets = new Map<number, HeartRateSample[]>();

  samples.forEach((sample) => {
    if (sample.ts < startTs || sample.ts > endTs) return;
    const bucketIndex = Math.floor((sample.ts - startTs) / bucketMs);
    const bucket = buckets.get(bucketIndex) || [];
    bucket.push(sample);
    buckets.set(bucketIndex, bucket);
  });

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketIndex, bucket]) => {
      const avgBpm = averageHeartRateSamples(bucket);
      const centerTs = startTs + bucketIndex * bucketMs + Math.round(bucketMs / 2);
      return {
        ts: Math.min(endTs, centerTs),
        bpm: avgBpm ?? bucket[bucket.length - 1].bpm,
      };
    });
};

const buildHeartRateChartRows = (
  samples: HeartRateSample[],
  startTs: number,
  endTs: number,
  targetPoints: number,
) => {
  const aggregated = aggregateHeartRateSamples(samples, startTs, endTs, targetPoints);
  const rows: any[] = [];

  aggregated.forEach((item, index) => {
    const previous = aggregated[index - 1];
    if (previous) {
      const gapMs = item.ts - previous.ts;
      if (gapMs > HEART_RATE_GAP_BREAK_MS) {
        const gapStartTs = previous.ts + Math.min(2000, Math.round(gapMs * 0.14));
        const gapEndTs = item.ts - Math.min(2000, Math.round(gapMs * 0.14));
        const gapGuideStart: any = {
          idx: `${index}-gap-start`,
          ts: gapStartTs,
          bpm: null,
          gapGuide: previous.bpm,
          time: format(new Date(gapStartTs), 'h:mm:ss a'),
          zoneIndex: null,
          zoneLabel: 'No data',
          isGap: true,
        };
        const gapGuideEnd: any = {
          idx: `${index}-gap-end`,
          ts: gapEndTs,
          bpm: null,
          gapGuide: item.bpm,
          time: format(new Date(gapEndTs), 'h:mm:ss a'),
          zoneIndex: null,
          zoneLabel: 'No data',
          isGap: true,
        };
        HEART_RATE_ZONES.forEach((_, zoneIdx) => {
          gapGuideStart[`z${zoneIdx}`] = null;
          gapGuideEnd[`z${zoneIdx}`] = null;
        });
        rows.push(gapGuideStart, gapGuideEnd);
      }
    }

    const zoneIndex = getHeartRateZoneIndex(item.bpm);
    const row: any = {
      idx: index,
      ts: item.ts,
      bpm: item.bpm,
      gapGuide: null,
      time: format(new Date(item.ts), 'h:mm:ss a'),
      zoneIndex,
      zoneLabel: HEART_RATE_ZONES[zoneIndex].name,
      isGap: false,
    };
    HEART_RATE_ZONES.forEach((_, zoneIdx) => {
      row[`z${zoneIdx}`] = zoneIndex === zoneIdx ? item.bpm : null;
    });
    rows.push(row);
  });

  return rows;
};

const formatStoredDate = (value: unknown, pattern: string) => {
  const parsed = parseDateAtStartOfDay(value);
  return parsed ? format(parsed, pattern) : '--';
};

export const Progress: React.FC = () => {
  const { user, profile } = useAuth();
  const displayUnit = profile?.unit_preference || 'kg';
  const [activeTab, setActiveTab] = useState<'overview' | 'overload' | 'prs' | 'weight' | 'livehr'>('livehr');
  const [loading, setLoading] = useState(true);

  const [prs, setPrs] = useState<any[]>([]);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [selectedExerciseForOverload, setSelectedExerciseForOverload] = useState<string>('');

  const [newWeight, setNewWeight] = useState('');
  const [weightDate, setWeightDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [heightCm, setHeightCm] = useState('');
  const [bmiValue, setBmiValue] = useState<string | null>(null);
  const {
    supportsWebBluetooth,
    hrConnecting,
    hrConnected,
    hrError,
    hrDeviceName,
    hrSamples,
    connectHeartRate,
    disconnectHeartRate,
  } = useHeartRate();
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<number | null>(null);
  const [heartRateView, setHeartRateView] = useState<HeartRateViewMode>('live');
  const [storedHeartRateSamples, setStoredHeartRateSamples] = useState<HeartRateSample[]>([]);
  const [waveformWindowDurationMs, setWaveformWindowDurationMs] = useState(DEFAULT_LIVE_WAVEFORM_WINDOW_MS);
  const [waveformViewportEndTs, setWaveformViewportEndTs] = useState<number | null>(null);
  const [waveformAtLive, setWaveformAtLive] = useState(true);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );
  const [zoneHintLabel, setZoneHintLabel] = useState<string | null>(null);
  const waveformDragRef = useRef<{ pointerId: number; startX: number; startEndTs: number; width: number } | null>(null);
  const waveformTouchPointsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const waveformPinchRef = useRef<{ startDistance: number; startDuration: number } | null>(null);
  const zoneHintShowTimerRef = useRef<number | null>(null);
  const zoneHintHideTimerRef = useRef<number | null>(null);

  const currentBpm = hrSamples.length > 0 ? hrSamples[hrSamples.length - 1].bpm : null;
  const hrRollingAvg = useMemo(() => {
    if (hrSamples.length === 0) return null;
    const recent = hrSamples.slice(-30).map((item) => item.bpm);
    const avg = recent.reduce((sum, bpm) => sum + bpm, 0) / recent.length;
    return Math.round(avg);
  }, [hrSamples]);
  const hrSessionMin = useMemo(() => {
    if (hrSamples.length === 0) return null;
    return Math.min(...hrSamples.map((item) => item.bpm));
  }, [hrSamples]);
  const hrSessionMax = useMemo(() => {
    if (hrSamples.length === 0) return null;
    return Math.max(...hrSamples.map((item) => item.bpm));
  }, [hrSamples]);
  const hrIntensityPercent = useMemo(() => {
    if (!currentBpm) return 0;
    const min = 50;
    const max = 190;
    const clamped = Math.min(max, Math.max(min, currentBpm));
    return ((clamped - min) / (max - min)) * 100;
  }, [currentBpm]);
  const hrTrend = useMemo(() => {
    if (hrSamples.length < 8) return null;
    const recent = hrSamples.slice(-8).map((item) => item.bpm);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const delta = last - first;
    if (Math.abs(delta) < 2) return 'Stable';
    return delta > 0 ? 'Rising' : 'Falling';
  }, [hrSamples]);

  const hrZone = useMemo(() => {
    if (!currentBpm) return { label: 'Waiting', color: '#9AA4B2' };
    if (currentBpm < 95) return { label: 'Recovery', color: '#5DCAA5' };
    if (currentBpm < 125) return { label: 'Easy', color: 'var(--accent)' };
    if (currentBpm < 155) return { label: 'Moderate', color: '#FFCC00' };
    if (currentBpm < 175) return { label: 'Hard', color: '#FF9F1C' };
    return { label: 'Peak', color: '#FF5A5F' };
  }, [currentBpm]);

  const isIOSBrowser = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return /iPhone|iPad|iPod/i.test(ua) || touchMac;
  }, []);

  const unsupportedBluetoothHint = useMemo(() => {
    if (supportsWebBluetooth) return null;
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return 'Live pairing requires HTTPS. Open Athlix™ on a secure URL.';
    }
    if (isIOSBrowser) {
      return 'iOS browsers currently limit Web Bluetooth pairing. Use Android Chrome or desktop Chrome/Edge for live connection.';
    }
    return 'This browser does not support Web Bluetooth. Use a compatible Chrome/Edge browser.';
  }, [isIOSBrowser, supportsWebBluetooth]);

  const bluetoothSupportHint = useMemo(() => {
    if (typeof navigator === 'undefined') return null;
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      return 'On Android, keep your wearable in heart-rate broadcast mode before tapping Connect device.';
    }
    return null;
  }, []);

  const currentZoneIndex = useMemo(() => (currentBpm ? getHeartRateZoneIndex(currentBpm) : -1), [currentBpm]);
  const zoneDistribution = useMemo(() => {
    const counts = HEART_RATE_ZONES.map(() => 0);
    hrSamples.forEach((sample) => {
      counts[getHeartRateZoneIndex(sample.bpm)] += 1;
    });
    const total = hrSamples.length || 1;
    return HEART_RATE_ZONES.map((zone, idx) => ({
      ...zone,
      count: counts[idx],
      percent: Math.round((counts[idx] / total) * 100),
    }));
  }, [hrSamples]);

  const useCompactZoneLabels = viewportWidth < 640;
  const activeWaveColor = useMemo(() => {
    if (selectedZoneFilter === null) return '#59D9C6';
    return HEART_RATE_ZONES[selectedZoneFilter]?.color || '#59D9C6';
  }, [selectedZoneFilter]);
  const activeWaveDataKey = selectedZoneFilter === null ? 'bpm' : `z${selectedZoneFilter}`;
  const activeWaveAreaTop = useMemo(() => withAlpha(activeWaveColor, 0.36), [activeWaveColor]);
  const activeWaveAreaMid = useMemo(() => withAlpha(activeWaveColor, 0.2), [activeWaveColor]);
  const activeWaveAreaBottom = useMemo(() => withAlpha(activeWaveColor, 0), [activeWaveColor]);
  const activeWaveStroke = useMemo(() => withAlpha(activeWaveColor, 0.96), [activeWaveColor]);
  const activeWaveGlow = useMemo(() => withAlpha(activeWaveColor, 0.18), [activeWaveColor]);

  const heroWavePoints = useMemo(() => {
    const recent = hrSamples.slice(-48).map((sample) => sample.bpm);
    if (recent.length < 6) {
      const fallback = [16, 15.2, 16.4, 15.6, 16.9, 15.5, 16.3, 15.8, 16];
      return fallback
        .map((y, idx) => `${((idx / (fallback.length - 1)) * 100).toFixed(2)},${y.toFixed(2)}`)
        .join(' ');
    }
    const residuals = recent.map((value, idx) => {
      const start = Math.max(0, idx - 2);
      const end = Math.min(recent.length - 1, idx + 2);
      let sum = 0;
      for (let i = start; i <= end; i++) { sum += recent[i]; }
      const localMean = sum / (end - start + 1);
      return value - localMean;
    });
    const smoothed = residuals.map((value, idx) => {
      const start = Math.max(0, idx - 1);
      const end = Math.min(residuals.length - 1, idx + 1);
      let sum = 0;
      for (let i = start; i <= end; i++) { sum += residuals[i]; }
      return sum / (end - start + 1);
    });
    const rms = Math.sqrt(smoothed.reduce((sum, value) => sum + value * value, 0) / smoothed.length);
    const scale = rms > 0.001 ? 2.35 / rms : 0;
    return smoothed
      .map((value, idx) => {
        const x = (idx / (smoothed.length - 1)) * 100;
        const centered = Math.max(-2.9, Math.min(2.9, value * scale));
        const y = 16 - centered;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [hrSamples]);

  const allHeartRateSamples = useMemo(
    () => mergeHeartRateSamples(storedHeartRateSamples, hrSamples),
    [storedHeartRateSamples, hrSamples],
  );
  const latestHeartRateTs = useMemo(
    () => allHeartRateSamples[allHeartRateSamples.length - 1]?.ts ?? Date.now(),
    [allHeartRateSamples],
  );
  const isLineHeartRateView = heartRateView === 'live' || heartRateView === 'day';
  const lineScopeStartTs = useMemo(() => {
    if (heartRateView === 'day') return startOfToday().getTime();
    return latestHeartRateTs - LIVE_WAVEFORM_RANGE_MS;
  }, [heartRateView, latestHeartRateTs]);
  const lineScopeEndTs = useMemo(() => {
    if (heartRateView === 'day') return Date.now();
    return latestHeartRateTs;
  }, [heartRateView, latestHeartRateTs]);
  const maxWaveformDurationMs = heartRateView === 'day' ? DAY_WAVEFORM_RANGE_MS : LIVE_WAVEFORM_RANGE_MS;
  const waveformScopeSpanMs = Math.max(1, lineScopeEndTs - lineScopeStartTs);
  const maxAllowedWaveformDurationMs = Math.min(waveformScopeSpanMs, maxWaveformDurationMs);
  const minAllowedWaveformDurationMs = Math.min(MIN_WAVEFORM_WINDOW_MS, maxAllowedWaveformDurationMs);
  const effectiveWaveformDurationMs = Math.min(
    maxAllowedWaveformDurationMs,
    Math.max(minAllowedWaveformDurationMs, waveformWindowDurationMs),
  );
  const waveformVisibleEndTs = useMemo(() => {
    if (!isLineHeartRateView) return lineScopeEndTs;
    if (heartRateView === 'live' && waveformAtLive) return lineScopeEndTs;
    const fallbackEnd = waveformViewportEndTs ?? lineScopeEndTs;
    return Math.min(lineScopeEndTs, Math.max(lineScopeStartTs + effectiveWaveformDurationMs, fallbackEnd));
  }, [effectiveWaveformDurationMs, heartRateView, isLineHeartRateView, lineScopeEndTs, lineScopeStartTs, waveformAtLive, waveformViewportEndTs]);
  const waveformVisibleStartTs = Math.max(lineScopeStartTs, waveformVisibleEndTs - effectiveWaveformDurationMs);
  const visibleHeartRateSamples = useMemo(
    () => allHeartRateSamples.filter((sample) => sample.ts >= waveformVisibleStartTs && sample.ts <= waveformVisibleEndTs),
    [allHeartRateSamples, waveformVisibleEndTs, waveformVisibleStartTs],
  );
  const waveformVisibleData = useMemo(
    () => isLineHeartRateView
      ? buildHeartRateChartRows(visibleHeartRateSamples, waveformVisibleStartTs, waveformVisibleEndTs, MAX_WAVEFORM_CHART_POINTS)
      : [],
    [isLineHeartRateView, visibleHeartRateSamples, waveformVisibleEndTs, waveformVisibleStartTs],
  );
  const waveformVisibleActualData = useMemo(
    () => waveformVisibleData.filter((item) => typeof item.bpm === 'number'),
    [waveformVisibleData],
  );
  const waveformHasGapSegments = useMemo(() => waveformVisibleData.some((item) => item.isGap), [waveformVisibleData]);

  const weekHeartRateData = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd }).map((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = addDays(startOfDay(day), 1).getTime();
      const samples = allHeartRateSamples.filter((s) => s.ts >= dayStart && s.ts < dayEnd);
      const avgBpm = averageHeartRateSamples(samples);
      return {
        label: format(day, 'EEE'),
        longLabel: format(day, 'EEE, MMM d'),
        avgBpm,
        sampleCount: samples.length,
        color: getHeartRateZoneColor(avgBpm),
      };
    });
  }, [allHeartRateSamples]);

  const monthHeartRateData = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 }).map(
      (weekStart, index, allWeeks) => {
        const weekEnd = index === allWeeks.length - 1 ? addDays(monthEnd, 1) : allWeeks[index + 1];
        const startTs = weekStart.getTime();
        const endTs = weekEnd.getTime();
        const samples = allHeartRateSamples.filter((s) => s.ts >= startTs && s.ts < endTs);
        const avgBpm = averageHeartRateSamples(samples);
        return {
          label: `W${index + 1}`,
          longLabel: `${format(weekStart, 'MMM d')} - ${format(addDays(new Date(endTs), -1), 'MMM d')}`,
          avgBpm,
          sampleCount: samples.length,
          color: getHeartRateZoneColor(avgBpm),
        };
      },
    );
  }, [allHeartRateSamples]);

  const periodHeartRateBars = heartRateView === 'month' ? monthHeartRateData : weekHeartRateData;
  const hasPeriodBarData = periodHeartRateBars.some((item) => item.avgBpm !== null);

  useEffect(() => {
    if (!user) { setStoredHeartRateSamples([]); return; }
    let cancelled = false;
    const load = async () => {
      const sinceTs = Date.now() - HEART_RATE_HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
      const rows = await getHeartRateSamples(user.id, { sinceTs });
      if (cancelled) return;
      setStoredHeartRateSamples(rows.map((s) => ({ ts: s.ts, bpm: s.bpm })));
    };
    void load();
    const id = window.setInterval(() => void load(), hrConnected ? 15000 : 45000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [hrConnected, user]);

  useEffect(() => {
    if (heartRateView === 'live') {
      setWaveformWindowDurationMs(DEFAULT_LIVE_WAVEFORM_WINDOW_MS);
      setWaveformViewportEndTs(null);
      setWaveformAtLive(true);
      return;
    }
    if (heartRateView === 'day') {
      setWaveformWindowDurationMs(DAY_WAVEFORM_RANGE_MS);
      setWaveformViewportEndTs(Date.now());
      setWaveformAtLive(false);
    }
  }, [heartRateView]);

  const updateWaveformViewport = useCallback(
    (nextEndTs: number, nextDurationMs?: number) => {
      if (!isLineHeartRateView) return;
      const scopeSpan = Math.max(1, lineScopeEndTs - lineScopeStartTs);
      const maxDuration = Math.min(scopeSpan, maxWaveformDurationMs);
      const minDuration = Math.min(MIN_WAVEFORM_WINDOW_MS, maxDuration);
      const clampedDuration = Math.min(maxDuration, Math.max(minDuration, nextDurationMs ?? effectiveWaveformDurationMs));
      const clampedEnd = Math.min(lineScopeEndTs, Math.max(lineScopeStartTs + clampedDuration, nextEndTs));
      setWaveformWindowDurationMs(clampedDuration);
      setWaveformViewportEndTs(clampedEnd);
      setWaveformAtLive(heartRateView === 'live' && clampedEnd >= lineScopeEndTs - 1000);
    },
    [effectiveWaveformDurationMs, heartRateView, isLineHeartRateView, lineScopeEndTs, lineScopeStartTs, maxWaveformDurationMs],
  );

  const jumpWaveformLive = useCallback(() => {
    setHeartRateView('live');
    setWaveformWindowDurationMs(DEFAULT_LIVE_WAVEFORM_WINDOW_MS);
    setWaveformViewportEndTs(lineScopeEndTs);
    setWaveformAtLive(true);
  }, [lineScopeEndTs]);

  const handleWaveformWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!isLineHeartRateView) return;
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(dominantDelta) < 2) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const zoomRatio = dominantDelta > 0 ? 1.14 : 0.86;
        updateWaveformViewport(waveformVisibleEndTs, effectiveWaveformDurationMs * zoomRatio);
        return;
      }
      const panMs = (effectiveWaveformDurationMs * dominantDelta) / 360;
      updateWaveformViewport(waveformVisibleEndTs + panMs);
    },
    [effectiveWaveformDurationMs, isLineHeartRateView, updateWaveformViewport, waveformVisibleEndTs],
  );

  const handleWaveformPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isLineHeartRateView) return;
      const container = event.currentTarget;
      container.setPointerCapture(event.pointerId);
      if (event.pointerType === 'touch') {
        waveformTouchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (waveformTouchPointsRef.current.size >= 2) {
          const [first, second] = Array.from(waveformTouchPointsRef.current.values()) as Array<{ x: number; y: number }>;
          if (!first || !second) return;
          waveformPinchRef.current = { startDistance: Math.hypot(first.x - second.x, first.y - second.y), startDuration: effectiveWaveformDurationMs };
          waveformDragRef.current = null;
          return;
        }
      }
      const rect = container.getBoundingClientRect();
      waveformDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startEndTs: waveformVisibleEndTs, width: rect.width || 1 };
    },
    [effectiveWaveformDurationMs, isLineHeartRateView, waveformVisibleEndTs],
  );

  const handleWaveformPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'touch' && waveformTouchPointsRef.current.has(event.pointerId)) {
        waveformTouchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (waveformPinchRef.current && waveformTouchPointsRef.current.size >= 2) {
        const [first, second] = Array.from(waveformTouchPointsRef.current.values()) as Array<{ x: number; y: number }>;
        if (!first || !second) return;
        const nextDistance = Math.hypot(first.x - second.x, first.y - second.y);
        if (nextDistance > 0) {
          updateWaveformViewport(waveformVisibleEndTs, waveformPinchRef.current.startDuration * (waveformPinchRef.current.startDistance / nextDistance));
        }
        return;
      }
      const dragState = waveformDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const deltaRatio = (dragState.startX - event.clientX) / Math.max(1, dragState.width);
      updateWaveformViewport(dragState.startEndTs + effectiveWaveformDurationMs * deltaRatio);
    },
    [effectiveWaveformDurationMs, updateWaveformViewport, waveformVisibleEndTs],
  );

  const clearWaveformDrag = useCallback((pointerId?: number) => {
    if (pointerId !== undefined) waveformTouchPointsRef.current.delete(pointerId);
    if (waveformTouchPointsRef.current.size < 2) waveformPinchRef.current = null;
    if (!waveformDragRef.current) return;
    if (pointerId !== undefined && waveformDragRef.current.pointerId !== pointerId) return;
    waveformDragRef.current = null;
  }, []);

  const clearZoneHintTimers = useCallback(() => {
    if (zoneHintShowTimerRef.current) { window.clearTimeout(zoneHintShowTimerRef.current); zoneHintShowTimerRef.current = null; }
    if (zoneHintHideTimerRef.current) { window.clearTimeout(zoneHintHideTimerRef.current); zoneHintHideTimerRef.current = null; }
  }, []);

  const handleZoneHintStart = useCallback((label: string) => {
    clearZoneHintTimers();
    zoneHintShowTimerRef.current = window.setTimeout(() => setZoneHintLabel(label), 420);
  }, [clearZoneHintTimers]);

  const handleZoneHintEnd = useCallback(() => {
    if (zoneHintShowTimerRef.current) { window.clearTimeout(zoneHintShowTimerRef.current); zoneHintShowTimerRef.current = null; }
    zoneHintHideTimerRef.current = window.setTimeout(() => { setZoneHintLabel(null); zoneHintHideTimerRef.current = null; }, 650);
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => () => clearZoneHintTimers(), [clearZoneHintTimers]);
  useEffect(() => { if (user) fetchData(); }, [user, displayUnit]);

  useEffect(() => {
    if (heightCm && weightLogs.length > 0) {
      const currentWeight = weightLogs[weightLogs.length - 1].weight;
      const heightM = parseFloat(heightCm) / 100;
      if (heightM > 0) setBmiValue((currentWeight / (heightM * heightM)).toFixed(1));
      else setBmiValue(null);
    } else setBmiValue(null);
  }, [heightCm, weightLogs]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (!user) { setPrs([]); setWeightLogs([]); setWorkouts([]); setExercises([]); return; }
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const [prData, weightData, workoutData, exerciseData] = await Promise.all([
        getPersonalRecords(user.id),
        getBodyWeightLogs(user.id),
        getWorkouts(user.id, { startDate: thirtyDaysAgo }),
        getExerciseRowsWithWorkoutDates(user.id),
      ]);
      const targetUnit = displayUnit as WeightUnit;
      setPrs((prData || []).map((pr: any) => ({
        ...pr,
        best_weight: convertWeight(Number(pr.best_weight || 0), (pr.unit || targetUnit) as WeightUnit, targetUnit, 0.1),
        unit: targetUnit,
      })));
      setWeightLogs(
        (weightData || [])
          .map((log: any) => ({
            ...log,
            weight: convertWeight(Number(log.weight || 0), (log.unit || targetUnit) as WeightUnit, targetUnit, 0.1),
            unit: targetUnit,
          }))
          .sort((a: any, b: any) => (a.date > b.date ? 1 : -1)),
      );
      setWorkouts(workoutData || []);
      if (exerciseData) {
        setExercises(exerciseData.map((exercise: any) => ({
          ...exercise,
          weight: !exercise.unit || isWeightUnit(exercise.unit)
            ? convertWeight(Number(exercise.weight || 0), isWeightUnit(exercise.unit) ? exercise.unit : targetUnit, targetUnit, 0.1)
            : Number(exercise.weight || 0),
          unit: !exercise.unit || isWeightUnit(exercise.unit) ? targetUnit : exercise.unit,
        })));
        const uniqueNames = Array.from(new Set(exerciseData.map((ex: any) => ex.name)));
        if (uniqueNames.length > 0) setSelectedExerciseForOverload(uniqueNames[0] as string);
      }
    } catch (error) {
      console.error('Error fetching progress data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, displayUnit]);

  const handleLogWeight = async () => {
    if (!newWeight || !user) return;
    const weightNum = parseFloat(newWeight);
    if (isNaN(weightNum)) return;
    try {
      await logBodyWeight(user.id, { date: weightDate, weight: weightNum, unit: displayUnit, notes: null });
      setNewWeight('');
      setWeightDate(format(new Date(), 'yyyy-MM-dd'));
      toast.success('Weight logged');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to log weight');
    }
  };

  const last30Days = Array.from({ length: 30 }, (_, i) => format(subDays(new Date(), 29 - i), 'yyyy-MM-dd'));
  const heatmapData = last30Days.map(dateStr => {
    const dayWorkouts = workouts.filter(w => w.date === dateStr);
    return {
      date: dateStr,
      count: dayWorkouts.length,
      intensity: dayWorkouts.length > 0 ? Math.min(dayWorkouts.reduce((acc, w) => acc + w.duration_minutes, 0) / 30, 4) : 0,
    };
  });

  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const sortedWorkouts = [...workouts].sort((a, b) => (parseDateAtStartOfDay(b.date)?.getTime() ?? 0) - (parseDateAtStartOfDay(a.date)?.getTime() ?? 0));
  const workoutDates = Array.from(new Set(sortedWorkouts.map(w => w.date)));
  if (workoutDates.includes(todayStr) || workoutDates.includes(yesterdayStr)) {
    let checkDate = workoutDates.includes(todayStr) ? new Date() : subDays(new Date(), 1);
    while (workoutDates.includes(format(checkDate, 'yyyy-MM-dd'))) { currentStreak++; checkDate = subDays(checkDate, 1); }
  }
  heatmapData.forEach(day => {
    if (day.count > 0) { tempStreak++; if (tempStreak > maxStreak) maxStreak = tempStreak; } else tempStreak = 0;
  });

  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const previousWeekStart = subWeeks(currentWeekStart, 1);
  const currentWeekWorkouts = workouts.filter((w) => {
    const d = parseDateAtStartOfDay(w.date);
    return Boolean(d && d >= currentWeekStart);
  });
  const previousWeekWorkouts = workouts.filter((w) => {
    const d = parseDateAtStartOfDay(w.date);
    return Boolean(d && d >= previousWeekStart && d < currentWeekStart);
  });

  const calculateMuscleVolume = (workoutList: any[]) => {
    const volumeMap: Record<string, number> = {};
    workoutList.forEach(w => {
      const wExercises = exercises.filter(ex => ex.workout_id === w.id);
      wExercises.forEach(ex => {
        const vol = ex.sets * ex.reps * ex.weight;
        if (ex.muscle_group) volumeMap[ex.muscle_group] = (volumeMap[ex.muscle_group] || 0) + vol;
        else if (Array.isArray(w.muscle_groups) && w.muscle_groups.length > 0) {
          const volPerMuscle = vol / w.muscle_groups.length;
          w.muscle_groups.forEach((m: string) => { volumeMap[m] = (volumeMap[m] || 0) + volPerMuscle; });
        }
      });
    });
    return volumeMap;
  };

  const currentWeekVolume = calculateMuscleVolume(currentWeekWorkouts);
  const previousWeekVolume = calculateMuscleVolume(previousWeekWorkouts);
  const allMuscles = Array.from(new Set([...Object.keys(currentWeekVolume), ...Object.keys(previousWeekVolume)]));
  const totalVolume = Object.values(currentWeekVolume).reduce((a, b) => a + b, 0);
  let balanceScore = 100;
  if (totalVolume > 0 && allMuscles.length > 0) {
    const idealVolumePerMuscle = totalVolume / allMuscles.length;
    const deviations = allMuscles.map(m => Math.abs((currentWeekVolume[m] || 0) - idealVolumePerMuscle));
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / allMuscles.length;
    balanceScore = Math.max(0, 100 - (avgDeviation / idealVolumePerMuscle) * 100);
  }

  const setsByMuscleWeek = useMemo(() => {
    const result: Record<string, number[]> = {};
    const weeks = Array.from({ length: 6 }, (_, i) => {
      const start = startOfWeek(subWeeks(new Date(), 5 - i), { weekStartsOn: 1 });
      const end = endOfWeek(subWeeks(new Date(), 5 - i), { weekStartsOn: 1 });
      return { start, end };
    });
    exercises.forEach((ex) => {
      const date = parseDateAtStartOfDay(ex.workouts?.date);
      if (!date) return;
      const mg = ex.muscle_group;
      if (!mg) return;
      const wi = weeks.findIndex((w) => date >= w.start && date <= w.end);
      if (wi === -1) return;
      if (!result[mg]) result[mg] = new Array(6).fill(0);
      result[mg][wi] += ex.sets || 0;
    });
    return result;
  }, [exercises]);

  const setVolumeData = useMemo(() => {
    const computeSets = (wList: any[]) => {
      const map: Record<string, number> = {};
      wList.forEach((w) => {
        exercises.filter((ex) => ex.workout_id === w.id).forEach((ex) => {
          const mg = ex.muscle_group;
          if (mg) map[mg] = (map[mg] || 0) + (ex.sets || 0);
        });
      });
      return map;
    };
    const cur = computeSets(currentWeekWorkouts);
    const prev = computeSets(previousWeekWorkouts);
    const muscles = Array.from(new Set([...Object.keys(cur), ...Object.keys(prev)]));
    return muscles.map((m) => ({ muscle: m, current: cur[m] || 0, previous: prev[m] || 0 })).sort((a, b) => b.current - a.current);
  }, [exercises, currentWeekWorkouts, previousWeekWorkouts]);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--accent)]/20 animate-pulse" />
          <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-[var(--accent)]" />
        </div>
        <p className="text-[12px] uppercase tracking-[0.2em] text-[var(--text-muted)] animate-pulse">Loading analytics</p>
      </div>
    );
  }

  /* ── Tab config ─────────────────────────────── */
  const TABS = [
    { id: 'overview',  label: 'Overview',  Icon: Activity  },
    { id: 'overload',  label: 'Overload',  Icon: TrendingUp },
    { id: 'prs',       label: 'Records',   Icon: Trophy    },
    { id: 'weight',    label: 'Weight',    Icon: Scale     },
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] pb-28 md:pb-10">
      <div className="max-w-4xl mx-auto px-4 pt-6">

        {/* ── Page Header ─────────────────────────────────── */}
        <div className="mb-7 flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)] mb-1">Athlix™</p>
            <h1 className="text-[26px] font-black tracking-tight text-white leading-none">Progress</h1>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[var(--text-muted)]">{format(new Date(), 'EEE, MMM d')}</p>
            <p className="text-[11px] font-semibold text-[var(--text-secondary)]">{workouts.length} sessions · 30 days</p>
          </div>
        </div>

        {/* ── Tab Nav ─────────────────────────────────────── */}
        <div className="mb-6 relative">
          {/* Glass pill container */}
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--bg-elevated)] border border-white/8 relative">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 h-10 rounded-[10px] flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.04em] uppercase transition-all duration-200 ${
                    isActive
                      ? 'bg-[var(--accent)] text-black shadow-[0_4px_14px_rgba(200,255,0,0.35)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/5'
                  }`}
                >
                  <tab.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="hidden sm:block">{tab.label}</span>
                </button>
              );
            })}

            {/* Divider + HR heart button spacer */}
            <div className="w-px h-6 bg-white/10 flex-shrink-0" />

            <button
              onClick={() => setActiveTab('livehr')}
              className={`relative flex-shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center transition-all duration-200 ${
                activeTab === 'livehr'
                  ? 'bg-[#19CCF0] text-black shadow-[0_4px_14px_rgba(25,204,240,0.40)]'
                  : 'text-[#9AA4B2] hover:text-white hover:bg-white/5'
              }`}
              title="Live Heart Rate"
            >
              {hrConnected && (
                <motion.span
                  className="absolute inset-0 rounded-[10px] border border-[#19CCF0]/50"
                  animate={{ scale: [1, 1.18], opacity: [0.6, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
              )}
              <Heart className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Tab Content ─────────────────────────────────── */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="space-y-5"
        >

          {/* ════════════════════════════════════════════════
              OVERVIEW
          ════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <>
              {/* Heatmap card */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5 overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Workout Frequency</p>
                    <p className="text-[13px] font-semibold text-[var(--text-secondary)]">Last 30 days</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 mb-0.5">
                        <Flame className="w-3 h-3 text-[var(--accent)]" />
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Streak</p>
                      </div>
                      <p className="text-[22px] font-black text-[var(--accent)] tabular-nums leading-none">{currentStreak}<span className="text-[13px] font-bold ml-0.5">d</span></p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mb-0.5">Best</p>
                      <p className="text-[22px] font-black text-[var(--text-primary)] tabular-nums leading-none">{maxStreak}<span className="text-[13px] font-bold ml-0.5">d</span></p>
                    </div>
                  </div>
                </div>

                {/* Heat tiles */}
                <div className="grid gap-[5px]" style={{ gridTemplateColumns: 'repeat(30, 1fr)' }}>
                  {heatmapData.map((day) => {
                    const alpha = day.intensity === 0 ? 0 : day.intensity < 1 ? 0.22 : day.intensity < 2 ? 0.45 : day.intensity < 3 ? 0.72 : 1;
                    return (
                      <div
                        key={day.date}
                        title={`${day.date}: ${day.count} workout${day.count !== 1 ? 's' : ''}`}
                        className="rounded-[3px] transition-all duration-200 hover:scale-125"
                        style={{
                          aspectRatio: '1',
                          background: day.intensity === 0
                            ? 'rgba(255,255,255,0.06)'
                            : `rgba(200,255,0,${alpha})`,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center justify-end gap-2 mt-3">
                  <span className="text-[10px] text-[var(--text-muted)]">Less</span>
                  {[0.06, 0.22, 0.45, 0.72, 1].map((a, i) => (
                    <div key={i} className="w-3 h-3 rounded-[3px]"
                      style={{ background: i === 0 ? 'rgba(255,255,255,0.06)' : `rgba(200,255,0,${a})` }}
                    />
                  ))}
                  <span className="text-[10px] text-[var(--text-muted)]">More</span>
                </div>
              </div>

              {/* Volume rows card */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Weekly Volume</p>
                    {setVolumeData.length > 0 && (
                      <p className="text-[26px] font-black text-white tabular-nums leading-none">
                        {setVolumeData.reduce((a, d) => a + d.current, 0)}
                        <span className="text-[13px] font-medium text-[var(--text-muted)] ml-1.5">sets this week</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Balance</p>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-[20px] font-black tabular-nums leading-none ${
                        balanceScore > 80 ? 'text-[var(--accent)]' : balanceScore > 50 ? 'text-[var(--yellow)]' : 'text-[var(--red)]'
                      }`}>{balanceScore.toFixed(0)}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">/100</span>
                    </div>
                  </div>
                </div>

                {setVolumeData.length === 0 ? (
                  <div className="py-10 text-center">
                    <Activity className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
                    <p className="text-[13px] text-[var(--text-muted)]">Log workouts this week to see volume.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)] border-b border-white/8 pb-2 mb-1"
                      style={{ gridTemplateColumns: '88px 1fr 88px 36px', gap: '12px' }}>
                      <div>Group</div><div>Sets</div><div>6-week</div><div className="text-right">Δ</div>
                    </div>

                    {setVolumeData.map((item, idx) => {
                      const isTop = idx === 0;
                      const maxSets = setVolumeData[0]?.current || 1;
                      const pct = item.current / maxSets;
                      const sparkData: number[] = setsByMuscleWeek[item.muscle] || new Array(6).fill(0);
                      const delta = item.current - item.previous;
                      const sw = 80, sh = 22;
                      const sMax = Math.max(...sparkData, 1);
                      const sx = (i: number) => (i / Math.max(sparkData.length - 1, 1)) * sw;
                      const sy = (v: number) => sh - (v / sMax) * (sh - 2) - 1;
                      const sparkPath = sparkData.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
                      const areaPath = `${sparkPath} L ${sw} ${sh} L 0 ${sh} Z`;

                      return (
                        <div key={item.muscle} className="grid items-center py-3 border-b border-white/6 last:border-0"
                          style={{ gridTemplateColumns: '88px 1fr 88px 36px', gap: '12px' }}>
                          <div className={`text-[13px] font-semibold truncate ${isTop ? 'text-white' : 'text-[var(--text-secondary)]'}`}>
                            {item.muscle}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct * 100}%`, background: isTop ? 'var(--accent)' : 'rgba(255,255,255,0.28)' }} />
                            </div>
                            <span className="text-[13px] font-bold text-white tabular-nums w-5 text-right">{item.current}</span>
                          </div>
                          <svg viewBox={`0 0 ${sw} ${sh}`} width={sw} height={sh} style={{ display: 'block', flexShrink: 0 }}>
                            <path d={areaPath} fill={isTop ? 'var(--accent)' : 'rgba(255,255,255,0.15)'} fillOpacity={isTop ? 0.15 : 1} />
                            <path d={sparkPath} fill="none" stroke={isTop ? 'var(--accent)' : 'rgba(255,255,255,0.3)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx={sx(sparkData.length - 1).toFixed(1)} cy={sy(sparkData[sparkData.length - 1]).toFixed(1)} r="2" fill={isTop ? 'var(--accent)' : 'rgba(255,255,255,0.5)'} />
                          </svg>
                          <div className={`text-right text-[12px] font-bold tabular-nums ${delta >= 0 ? 'text-[var(--accent)]' : 'text-[var(--red)]'}`}>
                            {delta > 0 ? '+' : ''}{delta}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════
              OVERLOAD
          ════════════════════════════════════════════════ */}
          {activeTab === 'overload' && (
            <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Progressive Overload</p>
                  <p className="text-[13px] text-[var(--text-secondary)]">Track weight progression over time</p>
                </div>
                <div className="relative w-full md:w-60">
                  <select
                    value={selectedExerciseForOverload}
                    onChange={(e) => setSelectedExerciseForOverload(e.target.value)}
                    className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-[var(--text-primary)] appearance-none focus:outline-none focus:border-[var(--accent)] text-[13px] font-medium transition-colors"
                  >
                    {Array.from(new Set(exercises.map(ex => ex.name))).map(name => (
                      <option key={name as string} value={name as string}>{name as string}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                </div>
              </div>

              {selectedExerciseForOverload ? (() => {
                const rawRows = exercises
                  .filter(ex => ex.name === selectedExerciseForOverload && ex.weight > 0)
                  .sort((a, b) => (parseDateAtStartOfDay(a.workouts.date)?.getTime() ?? 0) - (parseDateAtStartOfDay(b.workouts.date)?.getTime() ?? 0));
                const byDate: Record<string, number[]> = {};
                rawRows.forEach(ex => {
                  if (!byDate[ex.workouts.date]) byDate[ex.workouts.date] = [];
                  byDate[ex.workouts.date].push(ex.weight);
                });
                const chartData = Object.entries(byDate).map(([date, weights]) => {
                  const sorted = [...weights].sort((a, b) => a - b);
                  const mn = sorted[0];
                  const mx = sorted[sorted.length - 1];
                  return { date, min: mn, max: mx, range: mx - mn, mid: sorted[Math.floor((sorted.length - 1) / 2)] };
                }).sort((a, b) => a.date > b.date ? 1 : -1);

                if (chartData.length < 2) {
                  return (
                    <div className="py-14 text-center">
                      <TrendingUp className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-25" />
                      <p className="text-[14px] font-semibold text-[var(--text-secondary)]">Not enough data yet</p>
                      <p className="text-[12px] text-[var(--text-muted)] mt-1">Log this exercise at least twice to see progression.</p>
                    </div>
                  );
                }

                const firstMax = chartData[0].max;
                const lastMax = chartData[chartData.length - 1].max;
                const percentChange = firstMax > 0 ? ((lastMax - firstMax) / firstMax) * 100 : 0;
                const trendColor = percentChange > 0 ? 'var(--accent)' : percentChange < 0 ? 'var(--red)' : 'var(--yellow)';

                return (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="rounded-xl bg-white/4 border border-white/8 p-4">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">Progression</p>
                        <p className="text-[26px] font-black tabular-nums leading-none" style={{ color: trendColor }}>
                          {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}<span className="text-[14px] font-medium ml-0.5">%</span>
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/4 border border-white/8 p-4 text-right">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">Top set</p>
                        <p className="text-[26px] font-black text-white tabular-nums leading-none">
                          {lastMax}<span className="text-[13px] font-medium text-[var(--text-muted)] ml-1">{displayUnit}</span>
                        </p>
                      </div>
                    </div>

                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="abrBand" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.20} />
                              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.04} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                            tickFormatter={(val) => formatStoredDate(val, 'MMM d')} interval="preserveStartEnd" />
                          <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                          <Tooltip content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const minV = payload.find(p => p.dataKey === 'min')?.value as number | undefined;
                            const rangeV = payload.find(p => p.dataKey === 'range')?.value as number | undefined;
                            const midV = payload.find(p => p.dataKey === 'mid')?.value as number | undefined;
                            const maxV = minV != null && rangeV != null ? (minV + rangeV).toFixed(1) : '—';
                            return (
                              <div style={{ background: '#1A1D24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#fff' }}>
                                <p style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 11 }}>{formatStoredDate(label, 'EEE, MMM d yyyy')}</p>
                                {midV != null && <p>Top set: <strong>{midV.toFixed(1)} {displayUnit}</strong></p>}
                                {minV != null && <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Range: {minV.toFixed(1)}–{maxV} {displayUnit}</p>}
                              </div>
                            );
                          }} />
                          <Area type="monotone" dataKey="min" stackId="band" fill="transparent" stroke="none" dot={false} legendType="none" isAnimationActive={false} />
                          <Area type="monotone" dataKey="range" stackId="band" fill="url(#abrBand)" stroke="none" dot={false} legendType="none" />
                          <Line type="monotone" dataKey="mid" stroke="var(--accent)" strokeWidth={2.2}
                            dot={{ fill: 'var(--accent)', r: 3, strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: 'var(--accent)', stroke: '#111419', strokeWidth: 2 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-5 mt-3 px-1">
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <div className="w-4 h-0.5 bg-[var(--accent)]" />
                        <span>Median set weight</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <div className="w-4 h-2 rounded-sm" style={{ background: 'color-mix(in srgb, var(--accent) 20%, transparent)' }} />
                        <span>Min – max band</span>
                      </div>
                    </div>
                  </>
                );
              })() : (
                <div className="py-14 text-center text-[var(--text-muted)]">
                  <p>Select an exercise to view progression.</p>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════
              PERSONAL RECORDS
          ════════════════════════════════════════════════ */}
          {activeTab === 'prs' && (
            <>
              {prs.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                    <Trophy className="w-7 h-7 text-[var(--text-muted)] opacity-40" />
                  </div>
                  <p className="text-[16px] font-bold text-white mb-1">No records yet</p>
                  <p className="text-[13px] text-[var(--text-muted)]">Keep training — PRs will appear here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {prs.map((pr, idx) => (
                    <motion.div
                      key={pr.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-4 flex items-center gap-4 hover:border-white/14 transition-colors"
                    >
                      <div className="flex-shrink-0">
                        <ExerciseImage exerciseId={pr.exercise_db_id} exerciseName={pr.exercise_name} size="md" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-white truncate">{pr.exercise_name}</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{formatStoredDate(pr.achieved_date, 'MMM d, yyyy')}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="inline-flex items-baseline gap-1">
                          <span className="text-[22px] font-black text-[var(--accent)] tabular-nums leading-none">{pr.best_weight}</span>
                          <span className="text-[11px] font-medium text-[var(--text-muted)]">{displayUnit}</span>
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <span className="text-[11px] text-[var(--text-muted)]">{pr.best_reps} reps</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════
              WEIGHT
          ════════════════════════════════════════════════ */}
          {activeTab === 'weight' && (
            <>
              {/* Log weight */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Log Weight</p>
                <input
                  type="date"
                  max={format(new Date(), 'yyyy-MM-dd')}
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[var(--text-primary)] text-[13px] font-medium focus:outline-none focus:border-[var(--accent)] transition-colors [color-scheme:dark]"
                />
                <div className="flex gap-2">
                  <input
                    type="number" step="0.1" min="20" max="500" value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogWeight()}
                    placeholder={`e.g. ${weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight : '75.0'}`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[15px] font-semibold focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-white/20"
                  />
                  <span className="flex items-center text-[12px] font-semibold text-[var(--text-muted)]">{displayUnit}</span>
                  <button
                    onClick={handleLogWeight}
                    disabled={!newWeight}
                    className="bg-[var(--accent)] text-black px-5 py-3 rounded-xl font-bold text-[13px] hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Stats row */}
              {weightLogs.length > 0 && (() => {
                const weights = weightLogs.map(l => l.weight);
                const current = weights[weights.length - 1];
                const lowest = Math.min(...weights);
                const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
                const change = weights.length > 1 ? current - weights[0] : null;
                return (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Current', value: current, accent: true },
                        { label: 'Start', value: weights[0], accent: false },
                        { label: 'Lowest', value: lowest, accent: false },
                        { label: 'Avg', value: avg, accent: false },
                      ].map(({ label, value, accent }) => (
                        <div key={label} className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-4 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">{label}</p>
                          <p className={`text-[20px] font-black tabular-nums leading-none ${accent ? 'text-[var(--accent)]' : 'text-white'}`}>{value.toFixed(1)}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">{displayUnit}</p>
                        </div>
                      ))}
                    </div>
                    {change !== null && (
                      <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-4 flex items-center justify-center gap-3">
                        <span className="text-[13px] text-[var(--text-muted)]">Total change</span>
                        <span className={`text-[18px] font-black tabular-nums ${change < 0 ? 'text-[var(--accent)]' : change > 0 ? 'text-[var(--red)]' : 'text-[var(--text-secondary)]'}`}>
                          {change > 0 ? '+' : ''}{change.toFixed(1)} {displayUnit}
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Chart */}
              {weightLogs.length > 0 ? (
                <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Weight Trend</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{weightLogs.length} {weightLogs.length === 1 ? 'entry' : 'entries'}</p>
                  </div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={weightLogs} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#C8FF00" stopOpacity={0.30} />
                            <stop offset="100%" stopColor="#C8FF00" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                          tickFormatter={(val) => formatStoredDate(val, 'MMM d')} interval="preserveStartEnd" />
                        <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 12, padding: '8px 12px' }}
                          cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 2' }}
                          labelFormatter={(val) => formatStoredDate(val, 'EEE, MMM d yyyy')}
                          formatter={(value: number) => [`${value.toFixed(1)} ${displayUnit}`, 'Weight']}
                        />
                        <Area type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2.5} fill="url(#weightGrad)"
                          dot={weightLogs.length <= 20 ? { fill: 'var(--accent)', strokeWidth: 0, r: 3 } : false}
                          activeDot={{ r: 5, fill: 'var(--accent)', stroke: '#111419', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                    <Scale className="w-6 h-6 text-[var(--text-muted)] opacity-40" />
                  </div>
                  <p className="text-[15px] font-bold text-white mb-1">No weight logs yet</p>
                  <p className="text-[13px] text-[var(--text-muted)]">Log your first entry above to see your trend.</p>
                </div>
              )}

              {/* BMI Calculator */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-4">BMI Calculator</p>
                <div className="flex gap-3">
                  <input
                    type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="Height (cm)"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[14px] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-white/20"
                  />
                  <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-[var(--text-muted)] text-[12px]">BMI</span>
                    <span className={`font-black text-[20px] tabular-nums ${
                      bmiValue
                        ? parseFloat(bmiValue) < 18.5 ? 'text-sky-400'
                        : parseFloat(bmiValue) < 25 ? 'text-[var(--accent)]'
                        : parseFloat(bmiValue) < 30 ? 'text-yellow-400'
                        : 'text-[var(--red)]'
                        : 'text-[var(--text-muted)]'
                    }`}>{bmiValue || '--'}</span>
                  </div>
                </div>
                {bmiValue && (
                  <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                    {parseFloat(bmiValue) < 18.5 ? 'Underweight'
                      : parseFloat(bmiValue) < 25 ? 'Healthy weight'
                      : parseFloat(bmiValue) < 30 ? 'Overweight'
                      : 'Obese'} · BMI {bmiValue}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════
              LIVE HEART RATE
          ════════════════════════════════════════════════ */}
          {activeTab === 'livehr' && (
            <>
              {/* Connect banner */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#0F1520_0%,#0A1018_100%)] p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Heart className="w-4 h-4 text-[#19CCF0]" />
                      <h2 className="text-[15px] font-bold text-white">Live Heart Rate</h2>
                    </div>
                    <p className="text-[12px] text-[#8EA0B8]">Real-time wearable broadcast with zone tracking.</p>
                  </div>
                  {!hrConnected ? (
                    <button
                      onClick={supportsWebBluetooth ? connectHeartRate : undefined}
                      disabled={hrConnecting || !supportsWebBluetooth}
                      title={!supportsWebBluetooth && unsupportedBluetoothHint ? unsupportedBluetoothHint : undefined}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold transition-all ${
                        supportsWebBluetooth
                          ? 'bg-[#19CCF0] text-black hover:opacity-90 disabled:opacity-50'
                          : 'border border-white/15 bg-white/5 text-[#98A6B8] opacity-70'
                      }`}
                    >
                      <PlugZap className="w-4 h-4" />
                      {!supportsWebBluetooth ? (isIOSBrowser ? 'Unavailable on iOS' : 'Unsupported') : hrConnecting ? 'Connecting…' : 'Connect device'}
                    </button>
                  ) : (
                    <button
                      onClick={disconnectHeartRate}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-white/8 transition-colors"
                    >
                      <Unplug className="w-4 h-4" />
                      Disconnect · {hrDeviceName || 'Device'}
                    </button>
                  )}
                </div>
              </div>

              {/* BPM hero */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#0F1520_0%,#0A1018_100%)] overflow-hidden">
                {/* Decorative waveform strip */}
                <div className="relative h-14 border-b border-white/6 overflow-hidden"
                  style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)' }}>
                  <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                    <defs>
                      <linearGradient id="heroWaveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(25,204,240,0.15)" />
                        <stop offset="40%" stopColor="#19CCF0" />
                        <stop offset="70%" stopColor="var(--accent)" />
                        <stop offset="100%" stopColor="rgba(200,255,0,0.15)" />
                      </linearGradient>
                    </defs>
                    <motion.polyline fill="none" stroke="rgba(200,255,0,0.15)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" points={heroWavePoints}
                      animate={hrConnected ? { opacity: [0.1, 0.3, 0.1] } : { opacity: 0.1 }}
                      transition={hrConnected ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }} />
                    <polyline fill="none" stroke="url(#heroWaveGrad2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={heroWavePoints} />
                  </svg>
                </div>

                <div className="p-6">
                  {/* BPM display */}
                  <div className="flex items-end justify-between mb-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8EA0B8] mb-2">Beats Per Minute</p>
                      <div className="flex items-end gap-3">
                        <motion.span
                          className="text-[72px] font-black text-white tabular-nums leading-none"
                          key={currentBpm}
                          initial={{ opacity: 0.6, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.15 }}
                        >
                          {currentBpm ?? '--'}
                        </motion.span>
                        <div className="mb-2">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-semibold"
                            style={{ borderColor: `${hrZone.color}55`, background: `${hrZone.color}18`, color: hrZone.color }}>
                            {hrZone.label}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pulsing heart icon */}
                    <div className="relative flex items-center justify-center w-20 h-20">
                      {hrConnected && (
                        <>
                          <motion.div className="absolute inset-0 rounded-full border border-[var(--accent)]/20"
                            animate={{ scale: [1, 1.3], opacity: [0.4, 0] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
                          <motion.div className="absolute inset-0 rounded-full border border-[var(--accent)]/15"
                            animate={{ scale: [1, 1.18], opacity: [0.3, 0] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: 0.4 }} />
                        </>
                      )}
                      <motion.div
                        className="relative w-14 h-14 rounded-[18px] flex items-center justify-center border border-[var(--accent)]/25"
                        style={{ background: 'rgba(200,255,0,0.08)' }}
                        animate={hrConnected ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                        transition={hrConnected ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}
                      >
                        <Heart className={`w-6 h-6 ${hrConnected ? 'text-[var(--accent)]' : 'text-[#5A6577]'}`}
                          style={{ fill: hrConnected ? 'rgba(200,255,0,0.15)' : 'transparent' }} strokeWidth={2} />
                      </motion.div>
                    </div>
                  </div>

                  {/* Intensity bar */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8EA0B8]">Intensity</span>
                      <span className="text-[10px] font-semibold text-[#8EA0B8]">{hrIntensityPercent.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-white/8">
                      <motion.div className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #5DCAA5 0%, var(--accent) 40%, #FFCC00 72%, #FF5A5F 100%)' }}
                        animate={{ width: `${hrIntensityPercent}%` }}
                        transition={{ duration: 0.25 }} />
                    </div>
                  </div>

                  {/* Stat pills */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Trend', value: hrTrend || 'Waiting' },
                      { label: 'Avg 30s', value: hrRollingAvg ? `${hrRollingAvg} bpm` : '--' },
                      { label: 'Min / Max', value: hrSessionMin && hrSessionMax ? `${hrSessionMin} / ${hrSessionMax}` : '--' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
                        <p className="text-[10px] text-[#7F8EA3] uppercase tracking-[0.14em] mb-1">{label}</p>
                        <p className="text-[12px] font-semibold text-white tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Waveform card */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#0F1520_0%,#0A1018_100%)] p-5">
                {/* Waveform header */}
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-bold text-white">
                        {heartRateView === 'week' ? 'Weekly HR' : heartRateView === 'month' ? 'Monthly HR' : 'Live Waveform'}
                      </div>
                      <div className="text-[11px] text-[#8EA0B8] mt-0.5">
                        {heartRateView === 'week' ? 'Daily avg heart rate this week'
                          : heartRateView === 'month' ? 'Weekly avg heart rate this month'
                          : waveformVisibleActualData.length > 1
                            ? `${format(new Date(waveformVisibleActualData[0].ts), 'h:mm a')} – ${format(new Date(waveformVisibleActualData[waveformVisibleActualData.length - 1].ts), 'h:mm a')}`
                            : 'Waiting for data…'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {selectedZoneFilter !== null && isLineHeartRateView && (
                        <span className="px-2.5 py-1 rounded-full border text-[10px] font-bold" style={{
                          borderColor: `${HEART_RATE_ZONES[selectedZoneFilter].color}66`,
                          color: HEART_RATE_ZONES[selectedZoneFilter].color,
                          background: `${HEART_RATE_ZONES[selectedZoneFilter].color}18`,
                        }}>
                          {HEART_RATE_ZONES[selectedZoneFilter].name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-[#8EA0B8]">
                        <Bluetooth className="w-3.5 h-3.5" />
                        {hrConnected ? (hrDeviceName || 'Connected') : 'Disconnected'}
                      </span>
                      <button
                        onClick={jumpWaveformLive}
                        className={`h-7 px-3 rounded-lg border text-[10px] font-bold transition-colors ${
                          heartRateView === 'live' && waveformAtLive
                            ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                            : 'bg-black/30 border-white/15 text-[#AFC0D8] hover:text-white'
                        }`}
                      >
                        Live
                      </button>
                    </div>
                  </div>

                  {/* Mode tabs */}
                  <div className="flex gap-1 p-1 rounded-xl bg-black/20 border border-white/8 self-start">
                    {(['live', 'day', 'week', 'month'] as HeartRateViewMode[]).map((mode) => (
                      <button key={mode} onClick={() => setHeartRateView(mode)}
                        className={`h-8 px-3.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                          heartRateView === mode
                            ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
                            : 'text-[#9AACBF] border border-transparent hover:text-white hover:bg-white/5'
                        }`}>
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {isLineHeartRateView ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] text-[#7F8EA3]">
                        {heartRateView === 'live' ? 'Drag to pan · pinch to zoom up to 12h' : 'Current day timeline · pinch to zoom'}
                      </p>
                      <p className="text-[11px] font-medium text-[#9FB2C8]">
                        {Math.max(1, Math.round(effectiveWaveformDurationMs / (60 * 1000)))} min window
                      </p>
                    </div>

                    <div
                      className="h-60 rounded-xl border border-white/8 bg-black/20 px-2 py-3 cursor-grab active:cursor-grabbing overflow-hidden"
                      onWheel={handleWaveformWheel}
                      onPointerDown={handleWaveformPointerDown}
                      onPointerMove={handleWaveformPointerMove}
                      onPointerUp={(e) => clearWaveformDrag(e.pointerId)}
                      onPointerCancel={(e) => clearWaveformDrag(e.pointerId)}
                      onPointerLeave={(e) => clearWaveformDrag(e.pointerId)}
                    >
                      {waveformVisibleActualData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={waveformVisibleData} margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
                            <defs>
                              <linearGradient id="liveWaveFill2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={activeWaveAreaTop} />
                                <stop offset="42%" stopColor={activeWaveAreaMid} />
                                <stop offset="100%" stopColor={activeWaveAreaBottom} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="ts" type="number" domain={[waveformVisibleStartTs, waveformVisibleEndTs]}
                              tickFormatter={(v: number) => format(new Date(v), 'h:mm a')}
                              stroke="#748095" tick={{ fill: '#748095', fontSize: 10 }} axisLine={false} tickLine={false} tickMargin={8} minTickGap={34} />
                            <YAxis stroke="#748095" tick={{ fill: '#748095', fontSize: 10 }} axisLine={false} tickLine={false} width={36}
                              domain={[(min: number) => Math.max(0, Math.floor(min - 6)), (max: number) => Math.ceil(max + 6)]} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0F1520', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff' }}
                              formatter={(value: number, name: string, payload: any) => {
                                if (name === 'gapGuide' || payload?.payload?.isGap) return ['No data', 'Gap'];
                                return [value == null ? 'No data' : `${value} bpm`, payload?.payload?.zoneLabel || 'Heart Rate'];
                              }}
                              labelFormatter={(v: number) => format(new Date(v), 'h:mm:ss a')} />
                            <Area type="monotone" dataKey={activeWaveDataKey} stroke="none" fill="url(#liveWaveFill2)" connectNulls={false} isAnimationActive={false} />
                            <Line type="linear" dataKey="gapGuide" stroke="rgba(143,157,177,0.3)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey="bpm" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey={activeWaveDataKey} stroke={activeWaveStroke} strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-center text-[13px] text-[#748095]">
                          {hrConnected ? 'Waiting for incoming data…' : supportsWebBluetooth ? 'Connect device to start stream.' : 'Unsupported in this browser.'}
                        </div>
                      )}
                    </div>

                    {/* Zone filter */}
                    <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-[#8EA0B8]">Zone filter {waveformHasGapSegments ? '· dashed = no data' : ''}</span>
                        <span className="text-[11px]">Now: <span style={{ color: hrZone.color }} className="font-semibold">{hrZone.label}</span></span>
                      </div>
                      <div className="relative">
                        {zoneHintLabel && useCompactZoneLabels && (
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg border border-white/20 bg-[#0D1828]/95 text-[11px] font-medium text-[#DCEAFF] whitespace-nowrap z-10">
                            {zoneHintLabel}
                          </div>
                        )}
                        <div className="grid grid-cols-6 gap-1">
                          <button onClick={() => setSelectedZoneFilter(null)}
                            onPointerDown={() => handleZoneHintStart('All zones')} onPointerUp={handleZoneHintEnd} onPointerLeave={handleZoneHintEnd} onPointerCancel={handleZoneHintEnd}
                            className={`h-9 rounded-lg border text-[10px] font-bold transition-colors ${
                              selectedZoneFilter === null
                                ? 'bg-[var(--accent)]/18 border-[var(--accent)]/45 text-[var(--accent)]'
                                : 'bg-transparent border-white/10 text-[#9DB0C6] hover:text-white hover:bg-white/5'
                            }`}>
                            All
                          </button>
                          {zoneDistribution.map((zone, idx) => (
                            <button key={zone.id}
                              onClick={() => setSelectedZoneFilter((prev) => (prev === idx ? null : idx))}
                              onPointerDown={() => handleZoneHintStart(`${zone.name} (${zone.range} bpm)`)} onPointerUp={handleZoneHintEnd} onPointerLeave={handleZoneHintEnd} onPointerCancel={handleZoneHintEnd}
                              className={`h-9 rounded-lg border text-[10px] font-bold transition-colors ${
                                selectedZoneFilter === idx ? 'text-white' : currentZoneIndex === idx ? 'text-white bg-black/25' : 'text-[#9DB0C6] hover:text-white hover:bg-white/5'
                              }`}
                              style={{
                                borderColor: selectedZoneFilter === idx ? `${zone.color}CC` : currentZoneIndex === idx ? `${zone.color}66` : 'rgba(255,255,255,0.1)',
                                background: selectedZoneFilter === idx ? `linear-gradient(180deg, ${zone.color}22 0%, rgba(8,14,23,0.85) 100%)` : undefined,
                              }}>
                              {useCompactZoneLabels ? (ZONE_SHORT_LABEL_BY_ID[zone.id] || zone.name) : zone.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-60 rounded-xl border border-white/8 bg-black/15 overflow-hidden">
                    {hasPeriodBarData ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={periodHeartRateBars} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="label" stroke="#748095" tick={{ fill: '#9AACC3', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis stroke="#748095" tick={{ fill: '#748095', fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
                          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                            contentStyle={{ backgroundColor: '#0F1520', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff' }}
                            formatter={(value: number, _name: string, payload: any) => [
                              payload?.payload?.avgBpm ? `${value} bpm` : 'No data', payload?.payload?.longLabel || 'Average HR',
                            ]} />
                          <Bar dataKey={(entry) => entry.avgBpm ?? 0} radius={[8, 8, 3, 3]}>
                            {periodHeartRateBars.map((entry, i) => (
                              <Cell key={`${entry.label}-${i}`} fill={entry.avgBpm == null ? 'rgba(255,255,255,0.07)' : entry.color} fillOpacity={entry.avgBpm == null ? 1 : 0.9} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[13px] text-[#748095]">
                        No heart-rate history for this {heartRateView}.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {hrError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-200">{hrError}</div>
              )}

              {/* Setup guide */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
                <p className="text-[13px] font-bold text-white mb-3">Device Setup</p>
                <div className="space-y-2">
                  {[
                    'On your wearable, enable Heart Rate Broadcast mode.',
                    'Keep the wearable nearby, charged, and ready to pair.',
                    supportsWebBluetooth ? 'Open this Live HR view and tap Connect device.' : 'Use Android Chrome or desktop Chrome/Edge for live pairing.',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/8 border border-white/14 flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)]">{i + 1}</span>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {!supportsWebBluetooth && unsupportedBluetoothHint && (
                <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/8 p-4 text-[12px] text-yellow-100 flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />{unsupportedBluetoothHint}
                </div>
              )}

              {bluetoothSupportHint && (
                <div className="rounded-xl border border-sky-400/25 bg-sky-400/8 p-4 text-[12px] text-sky-100 flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />{bluetoothSupportHint}
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};
