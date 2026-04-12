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
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Trophy, TrendingUp, Activity, Scale, ChevronDown, Heart, Bluetooth, PlugZap, Unplug, Info } from 'lucide-react';
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
import { convertWeight, type WeightUnit } from '../lib/units';

const HEART_RATE_ZONES = [
  { id: 'z1', name: 'Recovery', range: '50-94', color: '#5DCAA5' },
  { id: 'z2', name: 'Easy', range: '95-124', color: '#00D4FF' },
  { id: 'z3', name: 'Moderate', range: '125-154', color: '#FFCC00' },
  { id: 'z4', name: 'Hard', range: '155-174', color: '#FF9F1C' },
  { id: 'z5', name: 'Peak', range: '175+', color: '#FF5A5F' },
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

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const isShort = normalized.length === 3;
  const fullHex = isShort
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  const intVal = Number.parseInt(fullHex, 16);
  const r = (intVal >> 16) & 255;
  const g = (intVal >> 8) & 255;
  const b = intVal & 255;
  return `rgba(${r},${g},${b},${alpha})`;
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

  // Data states
  const [prs, setPrs] = useState<any[]>([]);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [selectedExerciseForOverload, setSelectedExerciseForOverload] = useState<string>('');

  // New weight log state
  const [newWeight, setNewWeight] = useState('');
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
    if (currentBpm < 125) return { label: 'Easy', color: '#00D4FF' };
    if (currentBpm < 155) return { label: 'Moderate', color: '#FFCC00' };
    if (currentBpm < 175) return { label: 'Hard', color: '#FF9F1C' };
    return { label: 'Peak', color: '#FF5A5F' };
  }, [currentBpm]);
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
  const activeWaveAreaTop = useMemo(() => hexToRgba(activeWaveColor, 0.36), [activeWaveColor]);
  const activeWaveAreaMid = useMemo(() => hexToRgba(activeWaveColor, 0.2), [activeWaveColor]);
  const activeWaveAreaBottom = useMemo(() => hexToRgba(activeWaveColor, 0), [activeWaveColor]);
  const activeWaveStroke = useMemo(() => hexToRgba(activeWaveColor, 0.96), [activeWaveColor]);
  const activeWaveGlow = useMemo(() => hexToRgba(activeWaveColor, 0.18), [activeWaveColor]);
  const heroWavePoints = useMemo(() => {
    const recent = hrSamples.slice(-48).map((sample) => sample.bpm);
    if (recent.length < 6) {
      const fallback = [16, 15.2, 16.4, 15.6, 16.9, 15.5, 16.3, 15.8, 16];
      return fallback
        .map((y, idx) => `${((idx / (fallback.length - 1)) * 100).toFixed(2)},${y.toFixed(2)}`)
        .join(' ');
    }

    // Remove slow drift so the line keeps passing through the center of the icon,
    // then keep only small live up/down movement from incoming HR samples.
    const residuals = recent.map((value, idx) => {
      const start = Math.max(0, idx - 2);
      const end = Math.min(recent.length - 1, idx + 2);
      let sum = 0;
      for (let i = start; i <= end; i++) {
        sum += recent[i];
      }
      const localMean = sum / (end - start + 1);
      return value - localMean;
    });

    const smoothed = residuals.map((value, idx) => {
      const start = Math.max(0, idx - 1);
      const end = Math.min(residuals.length - 1, idx + 1);
      let sum = 0;
      for (let i = start; i <= end; i++) {
        sum += residuals[i];
      }
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
  }, [
    effectiveWaveformDurationMs,
    heartRateView,
    isLineHeartRateView,
    lineScopeEndTs,
    lineScopeStartTs,
    waveformAtLive,
    waveformViewportEndTs,
  ]);
  const waveformVisibleStartTs = Math.max(lineScopeStartTs, waveformVisibleEndTs - effectiveWaveformDurationMs);
  const visibleHeartRateSamples = useMemo(
    () =>
      allHeartRateSamples.filter(
        (sample) => sample.ts >= waveformVisibleStartTs && sample.ts <= waveformVisibleEndTs,
      ),
    [allHeartRateSamples, waveformVisibleEndTs, waveformVisibleStartTs],
  );
  const waveformVisibleData = useMemo(
    () =>
      isLineHeartRateView
        ? buildHeartRateChartRows(
            visibleHeartRateSamples,
            waveformVisibleStartTs,
            waveformVisibleEndTs,
            MAX_WAVEFORM_CHART_POINTS,
          )
        : [],
    [isLineHeartRateView, visibleHeartRateSamples, waveformVisibleEndTs, waveformVisibleStartTs],
  );
  const waveformVisibleActualData = useMemo(
    () => waveformVisibleData.filter((item) => typeof item.bpm === 'number'),
    [waveformVisibleData],
  );
  const waveformHasGapSegments = useMemo(
    () => waveformVisibleData.some((item) => item.isGap),
    [waveformVisibleData],
  );
  const weekHeartRateData = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: weekStart, end: weekEnd }).map((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = addDays(startOfDay(day), 1).getTime();
      const samples = allHeartRateSamples.filter((sample) => sample.ts >= dayStart && sample.ts < dayEnd);
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
        const weekEnd =
          index === allWeeks.length - 1
            ? addDays(monthEnd, 1)
            : allWeeks[index + 1];
        const startTs = weekStart.getTime();
        const endTs = weekEnd.getTime();
        const samples = allHeartRateSamples.filter((sample) => sample.ts >= startTs && sample.ts < endTs);
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
    if (!user) {
      setStoredHeartRateSamples([]);
      return;
    }

    let cancelled = false;
    const loadHeartRateHistory = async () => {
      const sinceTs = Date.now() - HEART_RATE_HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
      const rows = await getHeartRateSamples(user.id, { sinceTs });
      if (cancelled) return;
      setStoredHeartRateSamples(rows.map((sample) => ({ ts: sample.ts, bpm: sample.bpm })));
    };

    void loadHeartRateHistory();
    const intervalId = window.setInterval(() => {
      void loadHeartRateHistory();
    }, hrConnected ? 15000 : 45000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
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
      const clampedDuration = Math.min(
        maxDuration,
        Math.max(minDuration, nextDurationMs ?? effectiveWaveformDurationMs),
      );
      const clampedEnd = Math.min(
        lineScopeEndTs,
        Math.max(lineScopeStartTs + clampedDuration, nextEndTs),
      );

      setWaveformWindowDurationMs(clampedDuration);
      setWaveformViewportEndTs(clampedEnd);
      setWaveformAtLive(heartRateView === 'live' && clampedEnd >= lineScopeEndTs - 1000);
    },
    [
      effectiveWaveformDurationMs,
      heartRateView,
      isLineHeartRateView,
      lineScopeEndTs,
      lineScopeStartTs,
      maxWaveformDurationMs,
    ],
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

      const dominantDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
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
          const [first, second] = Array.from(
            waveformTouchPointsRef.current.values(),
          ) as Array<{ x: number; y: number }>;
          if (!first || !second) return;
          waveformPinchRef.current = {
            startDistance: Math.hypot(first.x - second.x, first.y - second.y),
            startDuration: effectiveWaveformDurationMs,
          };
          waveformDragRef.current = null;
          return;
        }
      }

      const rect = container.getBoundingClientRect();
      waveformDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startEndTs: waveformVisibleEndTs,
        width: rect.width || 1,
      };
    },
    [effectiveWaveformDurationMs, isLineHeartRateView, waveformVisibleEndTs],
  );

  const handleWaveformPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'touch' && waveformTouchPointsRef.current.has(event.pointerId)) {
        waveformTouchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (waveformPinchRef.current && waveformTouchPointsRef.current.size >= 2) {
        const [first, second] = Array.from(
          waveformTouchPointsRef.current.values(),
        ) as Array<{ x: number; y: number }>;
        if (!first || !second) return;
        const nextDistance = Math.hypot(first.x - second.x, first.y - second.y);
        if (nextDistance > 0) {
          const scale = waveformPinchRef.current.startDistance / nextDistance;
          updateWaveformViewport(
            waveformVisibleEndTs,
            waveformPinchRef.current.startDuration * scale,
          );
        }
        return;
      }

      const dragState = waveformDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const deltaRatio = (dragState.startX - event.clientX) / Math.max(1, dragState.width);
      const panMs = effectiveWaveformDurationMs * deltaRatio;
      updateWaveformViewport(dragState.startEndTs + panMs);
    },
    [effectiveWaveformDurationMs, updateWaveformViewport, waveformVisibleEndTs],
  );

  const clearWaveformDrag = useCallback((pointerId?: number) => {
    if (pointerId !== undefined) {
      waveformTouchPointsRef.current.delete(pointerId);
    }
    if (waveformTouchPointsRef.current.size < 2) {
      waveformPinchRef.current = null;
    }
    if (!waveformDragRef.current) return;
    if (pointerId !== undefined && waveformDragRef.current.pointerId !== pointerId) return;
    waveformDragRef.current = null;
  }, []);

  const clearZoneHintTimers = useCallback(() => {
    if (zoneHintShowTimerRef.current) {
      window.clearTimeout(zoneHintShowTimerRef.current);
      zoneHintShowTimerRef.current = null;
    }
    if (zoneHintHideTimerRef.current) {
      window.clearTimeout(zoneHintHideTimerRef.current);
      zoneHintHideTimerRef.current = null;
    }
  }, []);

  const handleZoneHintStart = useCallback(
    (label: string) => {
      clearZoneHintTimers();
      zoneHintShowTimerRef.current = window.setTimeout(() => {
        setZoneHintLabel(label);
      }, 420);
    },
    [clearZoneHintTimers],
  );

  const handleZoneHintEnd = useCallback(() => {
    if (zoneHintShowTimerRef.current) {
      window.clearTimeout(zoneHintShowTimerRef.current);
      zoneHintShowTimerRef.current = null;
    }
    zoneHintHideTimerRef.current = window.setTimeout(() => {
      setZoneHintLabel(null);
      zoneHintHideTimerRef.current = null;
    }, 650);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearZoneHintTimers();
    };
  }, [clearZoneHintTimers]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, displayUnit]);

  useEffect(() => {
    if (heightCm && weightLogs.length > 0) {
      const currentWeight = weightLogs[weightLogs.length - 1].weight;
      const heightM = parseFloat(heightCm) / 100;
      if (heightM > 0) {
        const bmi = currentWeight / (heightM * heightM);
        setBmiValue(bmi.toFixed(1));
      } else {
        setBmiValue(null);
      }
    } else {
      setBmiValue(null);
    }
  }, [heightCm, weightLogs]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (!user) {
        setPrs([]);
        setWeightLogs([]);
        setWorkouts([]);
        setExercises([]);
        return;
      }

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
        best_weight: convertWeight(
          Number(pr.best_weight || 0),
          (pr.unit || targetUnit) as WeightUnit,
          targetUnit,
          0.1,
        ),
        unit: targetUnit,
      })));
      setWeightLogs((weightData || []).map((log: any) => ({
        ...log,
        weight: convertWeight(
          Number(log.weight || 0),
          (log.unit || targetUnit) as WeightUnit,
          targetUnit,
          0.1,
        ),
        unit: targetUnit,
      })));
      setWorkouts(workoutData || []);

      if (exerciseData) {
        setExercises(
          exerciseData.map((exercise: any) => ({
            ...exercise,
            weight: convertWeight(
              Number(exercise.weight || 0),
              (exercise.unit || targetUnit) as WeightUnit,
              targetUnit,
              0.1,
            ),
            unit: targetUnit,
          })),
        );
        // Set default selected exercise for overload
        const uniqueNames = Array.from(new Set(exerciseData.map(ex => ex.name)));
        if (uniqueNames.length > 0) {
          setSelectedExerciseForOverload(uniqueNames[0] as string);
        }
      }

    } catch (error) {
      console.error('Error fetching progress data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogWeight = async () => {
    if (!newWeight || !user) return;
    const weightNum = parseFloat(newWeight);
    if (isNaN(weightNum)) return;

    const today = format(new Date(), 'yyyy-MM-dd');

    try {
      await logBodyWeight(user.id, {
        date: today,
        weight: weightNum,
        unit: displayUnit,
        notes: null,
      });

      setNewWeight('');
      toast.success('Weight logged');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to log weight');
    }
  };

  // Prepare Heatmap Data
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = subDays(new Date(), 29 - i);
    return format(d, 'yyyy-MM-dd');
  });

  const heatmapData = last30Days.map(dateStr => {
    const dayWorkouts = workouts.filter(w => w.date === dateStr);
    return {
      date: dateStr,
      count: dayWorkouts.length,
      intensity: dayWorkouts.length > 0 ? Math.min(dayWorkouts.reduce((acc, w) => acc + w.duration_minutes, 0) / 30, 4) : 0 // 0-4 scale
    };
  });

  // Calculate Streak
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  
  // Sort workouts by date descending
  const sortedWorkouts = [...workouts].sort(
    (a, b) =>
      (parseDateAtStartOfDay(b.date)?.getTime() ?? 0) - (parseDateAtStartOfDay(a.date)?.getTime() ?? 0),
  );
  const workoutDates = Array.from(new Set(sortedWorkouts.map(w => w.date)));

  if (workoutDates.includes(todayStr) || workoutDates.includes(yesterdayStr)) {
    let checkDate = workoutDates.includes(todayStr) ? new Date() : subDays(new Date(), 1);
    while (workoutDates.includes(format(checkDate, 'yyyy-MM-dd'))) {
      currentStreak++;
      checkDate = subDays(checkDate, 1);
    }
  }

  // Calculate max streak (simple version for last 30 days)
  heatmapData.forEach(day => {
    if (day.count > 0) {
      tempStreak++;
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  });

  // Prepare Volume Data (Per Muscle Group)
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const previousWeekStart = subWeeks(currentWeekStart, 1);

  const currentWeekWorkouts = workouts.filter((w) => {
    const workoutDate = parseDateAtStartOfDay(w.date);
    return Boolean(workoutDate && workoutDate >= currentWeekStart);
  });
  const previousWeekWorkouts = workouts.filter((w) => {
    const workoutDate = parseDateAtStartOfDay(w.date);
    return Boolean(workoutDate && workoutDate >= previousWeekStart && workoutDate < currentWeekStart);
  });

  const calculateMuscleVolume = (workoutList: any[]) => {
    const volumeMap: Record<string, number> = {};
    workoutList.forEach(w => {
      const wExercises = exercises.filter(ex => ex.workout_id === w.id);
      wExercises.forEach(ex => {
        const vol = ex.sets * ex.reps * ex.weight;
        if (ex.muscle_group) {
          volumeMap[ex.muscle_group] = (volumeMap[ex.muscle_group] || 0) + vol;
        } else if (Array.isArray(w.muscle_groups) && w.muscle_groups.length > 0) {
          const volPerMuscle = vol / w.muscle_groups.length;
          w.muscle_groups.forEach((m: string) => {
            volumeMap[m] = (volumeMap[m] || 0) + volPerMuscle;
          });
        }
      });
    });
    return volumeMap;
  };

  const currentWeekVolume = calculateMuscleVolume(currentWeekWorkouts);
  const previousWeekVolume = calculateMuscleVolume(previousWeekWorkouts);

  const allMuscles = Array.from(new Set([...Object.keys(currentWeekVolume), ...Object.keys(previousWeekVolume)]));
  
  const volumeData = allMuscles.map(muscle => ({
    muscle,
    current: currentWeekVolume[muscle] || 0,
    previous: previousWeekVolume[muscle] || 0,
  })).sort((a, b) => b.current - a.current);

  // Calculate balance score (0-100)
  const totalVolume = Object.values(currentWeekVolume).reduce((a, b) => a + b, 0);
  let balanceScore = 100;
  if (totalVolume > 0 && allMuscles.length > 0) {
    const idealVolumePerMuscle = totalVolume / allMuscles.length;
    const deviations = allMuscles.map(m => Math.abs((currentWeekVolume[m] || 0) - idealVolumePerMuscle));
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / allMuscles.length;
    balanceScore = Math.max(0, 100 - (avgDeviation / idealVolumePerMuscle) * 100);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00D4FF]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8 max-w-4xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-white mb-4">Progress & Analytics</h1>
        
        {/* Tabs */}
        <div className="relative">
          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#1B1C20_0%,#17181C_100%)] px-2 py-2 pb-7">
            <div className="grid grid-cols-4 gap-1">
              {[
                { id: 'overview', label: 'Overview', icon: Activity },
                { id: 'overload', label: 'Overload', icon: TrendingUp },
                { id: 'prs', label: 'Records', icon: Trophy },
                { id: 'weight', label: 'Weight', icon: Scale },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`h-14 rounded-[14px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-[#19CCF0] text-black shadow-[0_8px_24px_rgba(0,212,255,0.22)]'
                      : 'text-[#9AA4B2] hover:text-white hover:bg-white/5'
                  }`}
                  title={tab.label}
                >
                  <tab.icon className="w-[15px] h-[15px]" />
                  <span className="leading-none">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-[56%] w-[84px] h-[38px] rounded-t-full bg-[#060A14]" />
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-[56%] w-[84px] h-[38px] rounded-t-full border-t border-white/10" />

          <button
            onClick={() => setActiveTab('livehr')}
            className={`absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-1/2 h-14 w-14 rounded-full border transition-all duration-200 flex items-center justify-center ${
              activeTab === 'livehr'
                ? 'bg-[#19CCF0] border-[#67E6FF] text-black shadow-[0_10px_22px_rgba(0,212,255,0.30)]'
                : 'bg-[linear-gradient(180deg,#151B25_0%,#101720_100%)] border-white/16 text-[#9AA4B2] hover:text-white hover:border-white/28'
            }`}
            title="Live Heart Rate"
          >
            <Heart className="w-5 h-5" />
          </button>
        </div>
      </header>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Heatmap */}
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-[#00D4FF]" />
                  Workout Frequency (30 Days)
                </h2>
                <div className="flex space-x-4 text-right">
                  <div>
                    <p className="text-xs text-gray-400">Current Streak</p>
                    <p className="text-lg font-bold text-[#00D4FF]">{currentStreak} days</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Max Streak</p>
                    <p className="text-lg font-bold text-white">{maxStreak} days</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {heatmapData.map((day, i) => {
                  let bgColor = 'bg-white/5';
                  if (day.intensity > 0) bgColor = 'bg-[#00D4FF]/20';
                  if (day.intensity > 1) bgColor = 'bg-[#00D4FF]/40';
                  if (day.intensity > 2) bgColor = 'bg-[#00D4FF]/70';
                  if (day.intensity > 3) bgColor = 'bg-[#00D4FF]';

                  return (
                    <div 
                      key={day.date}
                      title={`${day.date}: ${day.count} workouts`}
                      className={`w-[calc(14.28%-6px)] aspect-square rounded-sm ${bgColor} transition-colors hover:ring-2 hover:ring-white/50`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-end space-x-2 mt-3 text-xs text-gray-500">
                <span>Less</span>
                <div className="flex space-x-1">
                  <div className="w-3 h-3 rounded-sm bg-white/5"></div>
                  <div className="w-3 h-3 rounded-sm bg-[#00D4FF]/20"></div>
                  <div className="w-3 h-3 rounded-sm bg-[#00D4FF]/40"></div>
                  <div className="w-3 h-3 rounded-sm bg-[#00D4FF]/70"></div>
                  <div className="w-3 h-3 rounded-sm bg-[#00D4FF]"></div>
                </div>
                <span>More</span>
              </div>
            </div>

            {/* Volume Chart */}
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-[#00FF87]" />
                  Weekly Volume by Muscle
                </h2>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Balance Score</p>
                  <p className={`text-lg font-bold ${balanceScore > 80 ? 'text-[#00FF87]' : balanceScore > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {balanceScore.toFixed(0)}/100
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4 mb-4 text-xs">
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 rounded-sm bg-[#00FF87]"></div>
                  <span className="text-gray-400">This Week</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 rounded-sm bg-white/20"></div>
                  <span className="text-gray-400">Last Week</span>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="muscle" stroke="#666" tick={{fill: '#666', fontSize: 10}} axisLine={false} tickLine={false} />
                    <YAxis stroke="#666" tick={{fill: '#666', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(val) => `${(val/1000).toFixed(1)}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                      cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      formatter={(value: number) => [`${value.toFixed(0)} ${displayUnit}`, 'Volume']}
                    />
                    <Bar dataKey="previous" fill="rgba(255,255,255,0.2)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="current" fill="#00FF87" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'overload' && (
          <div className="space-y-6">
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
                <h2 className="text-lg font-bold text-white flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-[#00D4FF]" />
                  Progressive Overload
                </h2>
                <div className="relative w-full md:w-64">
                  <select
                    value={selectedExerciseForOverload}
                    onChange={(e) => setSelectedExerciseForOverload(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-white appearance-none focus:outline-none focus:border-[#00D4FF]"
                  >
                    {Array.from(new Set(exercises.map(ex => ex.name))).map(name => (
                      <option key={name as string} value={name as string}>{name as string}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>

              {selectedExerciseForOverload ? (() => {
                const overloadData = exercises
                  .filter(ex => ex.name === selectedExerciseForOverload)
                  .map(ex => ({
                    date: ex.workouts.date,
                    weight: ex.weight,
                    volume: ex.weight * ex.reps * ex.sets
                  }))
                  .sort(
                    (a, b) =>
                      (parseDateAtStartOfDay(a.date)?.getTime() ?? 0) -
                      (parseDateAtStartOfDay(b.date)?.getTime() ?? 0),
                  );

                // Group by date to get max weight per day
                const groupedData = overloadData.reduce((acc, curr) => {
                  if (!acc[curr.date] || acc[curr.date].weight < curr.weight) {
                    acc[curr.date] = curr;
                  }
                  return acc;
                }, {} as Record<string, any>);

                const chartData = Object.values(groupedData) as any[];

                if (chartData.length < 2) {
                  return (
                    <div className="text-center py-12 text-gray-500">
                      <p>Not enough data to show progression.</p>
                      <p className="text-sm">Log this exercise at least twice.</p>
                    </div>
                  );
                }

                const firstWeight = chartData[0].weight;
                const lastWeight = chartData[chartData.length - 1].weight;
                const percentChange = firstWeight > 0 ? ((lastWeight - firstWeight) / firstWeight) * 100 : 0;
                
                let trendColor = '#FFD700'; // Yellow for no change
                if (percentChange > 0) trendColor = '#00FF87'; // Green for positive
                if (percentChange < 0) trendColor = '#FF4444'; // Red for negative

                return (
                  <>
                    <div className="flex items-center justify-between mb-6 bg-black p-4 rounded-xl border border-white/5">
                      <div>
                        <p className="text-sm text-gray-400">Progression</p>
                        <p className={`text-2xl font-bold`} style={{ color: trendColor }}>
                          {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Current Max</p>
                        <p className="text-2xl font-bold text-white">{lastWeight} {displayUnit}</p>
                      </div>
                    </div>

                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            stroke="#666" 
                            tick={{fill: '#666'}} 
                            axisLine={false} 
                            tickLine={false}
                            tickFormatter={(val) => formatStoredDate(val, 'MMM d')}
                          />
                          <YAxis 
                            domain={['auto', 'auto']} 
                            stroke="#666" 
                            tick={{fill: '#666'}} 
                            axisLine={false} 
                            tickLine={false} 
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                            labelFormatter={(val) => formatStoredDate(val, 'MMM d, yyyy')}
                            formatter={(value: number) => [`${value.toFixed(1)} ${displayUnit}`, 'Weight']}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="weight" 
                            stroke={trendColor} 
                            strokeWidth={3}
                            dot={{ fill: trendColor, strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6, fill: '#fff' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                );
              })() : (
                <div className="text-center py-12 text-gray-500">
                  <p>Select an exercise to view progression.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'prs' && (
          <div className="space-y-4">
            {prs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No personal records yet.</p>
                <p className="text-sm">Keep lifting to set some PRs!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {prs.map(pr => (
                  <div key={pr.id} className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <ExerciseImage 
                          exerciseId={pr.exercise_db_id} 
                          exerciseName={pr.exercise_name} 
                          size="md"
                        />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-lg">{pr.exercise_name}</h3>
                        <p className="text-sm text-gray-400">Achieved {formatStoredDate(pr.achieved_date, 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-[#00D4FF]">{pr.best_weight} <span className="text-sm text-gray-400 font-medium">{displayUnit}</span></div>
                      <div className="text-sm text-gray-400">{pr.best_reps} reps</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'weight' && (
          <div className="space-y-6">
            {/* Log Weight Input */}
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-end space-y-4 md:space-y-0 md:space-x-4">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-gray-400 mb-2">Log Today's Weight ({displayUnit})</label>
                <input
                  type="number"
                  step="0.1"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  placeholder="e.g. 75.5"
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <button
                onClick={handleLogWeight}
                disabled={!newWeight}
                className="w-full md:w-auto bg-[#00D4FF] text-black px-6 py-3 rounded-xl font-bold hover:bg-[#00D4FF]/90 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>

            {/* Weight Stats */}
            {weightLogs.length > 0 && (() => {
              const weights = weightLogs.map(l => l.weight);
              const current = weights[weights.length - 1];
              const lowest = Math.min(...weights);
              const highest = Math.max(...weights);
              const average = (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1);

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5 text-center">
                    <p className="text-xs text-gray-400 mb-1">Current</p>
                    <p className="text-xl font-bold text-[#00D4FF]">{current} {displayUnit}</p>
                  </div>
                  <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5 text-center">
                    <p className="text-xs text-gray-400 mb-1">Lowest</p>
                    <p className="text-xl font-bold text-white">{lowest} {displayUnit}</p>
                  </div>
                  <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5 text-center">
                    <p className="text-xs text-gray-400 mb-1">Highest</p>
                    <p className="text-xl font-bold text-white">{highest} {displayUnit}</p>
                  </div>
                  <div className="bg-[#1A1A1A] p-4 rounded-xl border border-white/5 text-center">
                    <p className="text-xs text-gray-400 mb-1">Average</p>
                    <p className="text-xl font-bold text-white">{average} {displayUnit}</p>
                  </div>
                </div>
              );
            })()}

            {/* BMI Calculator */}
            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
              <h2 className="text-lg font-bold text-white mb-4">BMI Calculator</h2>
              <div className="flex flex-col md:flex-row items-end space-y-4 md:space-y-0 md:space-x-4">
                <div className="flex-1 w-full">
                  <label className="block text-sm font-medium text-gray-400 mb-2">Height (cm)</label>
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="e.g. 175"
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>
                <div className="flex-1 w-full bg-black border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-gray-400">Your BMI</span>
                  <span className={`font-bold text-xl ${
                    bmiValue ? (
                      parseFloat(bmiValue) < 18.5 ? 'text-blue-400' :
                      parseFloat(bmiValue) < 25 ? 'text-[#00FF87]' :
                      parseFloat(bmiValue) < 30 ? 'text-yellow-400' : 'text-red-400'
                    ) : 'text-white'
                  }`}>
                    {bmiValue || '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Weight Chart */}
            {weightLogs.length > 0 ? (
              <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5">
                <h2 className="text-lg font-bold text-white mb-4">Weight Trend</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightLogs}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="#666" 
                        tick={{fill: '#666'}} 
                        axisLine={false} 
                        tickLine={false}
                        tickFormatter={(val) => formatStoredDate(val, 'MMM d')}
                      />
                      <YAxis 
                        domain={['auto', 'auto']} 
                        stroke="#666" 
                        tick={{fill: '#666'}} 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                        labelFormatter={(val) => formatStoredDate(val, 'MMM d, yyyy')}
                        formatter={(value: number) => [`${value.toFixed(1)} ${displayUnit}`, 'Weight']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="weight" 
                        stroke="#00D4FF" 
                        strokeWidth={3}
                        dot={{ fill: '#00D4FF', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, fill: '#fff' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 bg-[#1A1A1A] rounded-2xl border border-white/5">
                <Scale className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No weight logs yet.</p>
                <p className="text-sm">Log your weight to see trends.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'livehr' && (
          <div className="space-y-5">
            <div className="bg-[linear-gradient(180deg,#171A21_0%,#111722_100%)] p-5 md:p-6 rounded-3xl border border-white/10">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center">
                    <Heart className="w-5 h-5 mr-2 text-[#00D4FF]" />
                    Live Heart Rate
                  </h2>
                  <p className="text-sm text-[#97A3B6] mt-1">
                    Real-time WHOOP broadcast with live trend and zone tracking.
                  </p>
                </div>
                {!hrConnected ? (
                  <button
                    onClick={connectHeartRate}
                    disabled={hrConnecting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00D4FF] px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50"
                  >
                    <PlugZap className="w-4 h-4" />
                    {hrConnecting ? 'Connecting...' : 'Connect WHOOP'}
                  </button>
                ) : (
                  <button
                    onClick={disconnectHeartRate}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <Unplug className="w-4 h-4" />
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            <div className="bg-[linear-gradient(180deg,#121A2A_0%,#0D1522_100%)] p-6 rounded-3xl border border-white/10 overflow-hidden">
              <div className="relative flex flex-col items-center justify-center">
                <div
                  className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 opacity-75"
                  style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)' }}
                >
                  <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-full w-full">
                    <defs>
                      <linearGradient id="heroWaveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(93,202,165,0.2)" />
                        <stop offset="28%" stopColor="#00BCE8" />
                        <stop offset="65%" stopColor="#00D4FF" />
                        <stop offset="100%" stopColor="rgba(123,210,255,0.2)" />
                      </linearGradient>
                    </defs>
                    <path d="M0 16 H100" stroke="rgba(255,255,255,0.06)" strokeDasharray="2 5" />
                    <motion.polyline
                      fill="none"
                      stroke="rgba(0,212,255,0.26)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={heroWavePoints}
                      animate={hrConnected ? { opacity: [0.18, 0.42, 0.18] } : { opacity: 0.22 }}
                      transition={hrConnected ? { duration: 1.25, repeat: Infinity } : { duration: 0.2 }}
                    />
                    <polyline
                      fill="none"
                      stroke="url(#heroWaveGradient)"
                      strokeWidth="1.9"
                      strokeOpacity="0.95"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={heroWavePoints}
                    />
                  </svg>
                </div>

                <div className="relative h-40 w-40 flex items-center justify-center mt-1">
                  <motion.div
                    className="absolute inset-0 rounded-full border border-[#00D4FF]/20"
                    animate={hrConnected ? { scale: [1, 1.22], opacity: [0.45, 0] } : { scale: 1, opacity: 0.2 }}
                    transition={hrConnected ? { duration: 1.8, ease: 'easeOut', repeat: Infinity } : { duration: 0.2 }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border border-[#00D4FF]/16"
                    animate={hrConnected ? { scale: [1, 1.13], opacity: [0.35, 0] } : { scale: 1, opacity: 0.16 }}
                    transition={hrConnected ? { duration: 1.8, ease: 'easeOut', repeat: Infinity, delay: 0.55 } : { duration: 0.2 }}
                  />
                  <motion.div
                    className="relative z-10 h-24 w-24 rounded-[26px] border border-[#00D4FF]/35 bg-[linear-gradient(180deg,rgba(0,212,255,0.16)_0%,rgba(0,212,255,0.07)_100%)] flex items-center justify-center"
                    animate={hrConnected ? { scale: [1, 1.055, 1] } : { scale: 1 }}
                    transition={hrConnected ? { duration: 0.95, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-[26px]"
                      animate={hrConnected ? { opacity: [0.2, 0.45, 0.2] } : { opacity: 0.18 }}
                      transition={hrConnected ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
                      style={{
                        background:
                          'radial-gradient(circle at 50% 44%, rgba(0,212,255,0.24) 0%, rgba(0,212,255,0.05) 48%, rgba(0,212,255,0) 76%)',
                      }}
                    />
                    <Heart
                      className={`relative z-10 w-11 h-11 ${hrConnected ? 'text-[#00D4FF]' : 'text-[#6E7E95]'}`}
                      style={{ fill: hrConnected ? 'rgba(0,212,255,0.12)' : 'transparent' }}
                      strokeWidth={2.25}
                    />
                  </motion.div>
                </div>

                <div className="text-5xl font-black text-white tabular-nums leading-none mt-1">{currentBpm ?? '--'}</div>
                <div className="text-[11px] tracking-[0.2em] uppercase text-[#8EA0B8] mt-1">Beats Per Minute</div>
                <div
                  className="mt-3 px-3 py-1.5 rounded-full border text-sm font-semibold"
                  style={{ borderColor: `${hrZone.color}66`, backgroundColor: `${hrZone.color}1A`, color: hrZone.color }}
                >
                  {hrZone.label}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-6">
                <div className="rounded-xl border border-white/7 bg-black/20 p-3 text-center backdrop-blur-sm">
                  <div className="text-xs text-[#7F8EA3] uppercase tracking-[0.14em] mb-1">Trend</div>
                  <div className="text-sm font-semibold text-white">{hrTrend || 'Waiting'}</div>
                </div>
                <div className="rounded-xl border border-white/7 bg-black/20 p-3 text-center backdrop-blur-sm">
                  <div className="text-xs text-[#7F8EA3] uppercase tracking-[0.14em] mb-1">Average</div>
                  <div className="text-sm font-semibold text-white tabular-nums">{hrRollingAvg ?? '--'} bpm</div>
                </div>
                <div className="rounded-xl border border-white/7 bg-black/20 p-3 text-center backdrop-blur-sm">
                  <div className="text-xs text-[#7F8EA3] uppercase tracking-[0.14em] mb-1">Min - Max</div>
                  <div className="text-sm font-semibold text-white tabular-nums">
                    {hrSessionMin ?? '--'} / {hrSessionMax ?? '--'}
                  </div>
                </div>
              </div>

              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden mt-4">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #5DCAA5 0%, #00D4FF 35%, #FFCC00 70%, #FF5A5F 100%)',
                  }}
                  animate={{ width: `${hrIntensityPercent}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,#131A26_0%,#0F1622_100%)] p-5">
              <div className="flex flex-col gap-3 mb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {heartRateView === 'week'
                        ? 'Weekly Heart Rate'
                        : heartRateView === 'month'
                          ? 'Monthly Heart Rate'
                          : 'Live Waveform'}
                    </div>
                    <div className="text-[11px] text-[#8EA0B8] mt-1">
                      {heartRateView === 'week'
                        ? 'Daily average heart rate for the current week.'
                        : heartRateView === 'month'
                          ? 'Weekly average heart rate for the current month.'
                          : waveformVisibleActualData.length > 1
                            ? `${format(new Date(waveformVisibleActualData[0].ts), 'h:mm:ss a')} - ${format(new Date(waveformVisibleActualData[waveformVisibleActualData.length - 1].ts), 'h:mm:ss a')}`
                            : 'Waiting for data'}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 inline-flex items-center gap-2 flex-wrap justify-end">
                    {selectedZoneFilter !== null && isLineHeartRateView && (
                      <span
                        className="px-2 py-0.5 rounded-full border text-[10px] font-semibold"
                        style={{
                          borderColor: `${HEART_RATE_ZONES[selectedZoneFilter].color}66`,
                          color: HEART_RATE_ZONES[selectedZoneFilter].color,
                          backgroundColor: `${HEART_RATE_ZONES[selectedZoneFilter].color}1A`,
                        }}
                      >
                        {HEART_RATE_ZONES[selectedZoneFilter].name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <Bluetooth className="w-3.5 h-3.5" />
                      {hrConnected ? (hrDeviceName || 'Connected') : 'Disconnected'}
                    </span>
                    <button
                      onClick={jumpWaveformLive}
                      className={`h-7 px-2.5 rounded-lg border text-[10px] font-semibold ${
                        heartRateView === 'live' && waveformAtLive
                          ? 'bg-[#00D4FF]/18 border-[#00D4FF]/45 text-[#7EE7FF]'
                          : 'bg-black/30 border-white/15 text-[#AFC0D8]'
                      }`}
                      title="Jump to live"
                    >
                      Live
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/15 p-1 inline-flex gap-1 self-start">
                  {(['live', 'day', 'week', 'month'] as HeartRateViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setHeartRateView(mode)}
                      className={`h-9 px-4 rounded-xl text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
                        heartRateView === mode
                          ? 'bg-[#00D4FF]/18 text-[#7EE7FF] border border-[#00D4FF]/35'
                          : 'text-[#9AACBF] border border-transparent hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {isLineHeartRateView ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="text-[11px] text-[#7F8EA3]">
                      {heartRateView === 'live'
                        ? 'Starts at last 15 min. Drag or swipe to pan and pinch to zoom up to 12h.'
                        : 'Current day timeline. Drag to move and pinch to zoom into denser sections.'}
                    </div>
                    <div className="text-[11px] font-medium text-[#9FB2C8]">
                      Window: {Math.max(1, Math.round(effectiveWaveformDurationMs / (60 * 1000)))} min
                    </div>
                  </div>

                  <div
                    className="h-64 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(7,15,25,0.84)_0%,rgba(10,18,30,0.94)_100%)] px-2 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] cursor-grab active:cursor-grabbing"
                    onWheel={handleWaveformWheel}
                    onPointerDown={handleWaveformPointerDown}
                    onPointerMove={handleWaveformPointerMove}
                    onPointerUp={(event) => clearWaveformDrag(event.pointerId)}
                    onPointerCancel={(event) => clearWaveformDrag(event.pointerId)}
                    onPointerLeave={(event) => clearWaveformDrag(event.pointerId)}
                  >
                    {waveformVisibleActualData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={waveformVisibleData} margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
                          <defs>
                            <linearGradient id="liveWaveMountainFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={activeWaveAreaTop} />
                              <stop offset="42%" stopColor={activeWaveAreaMid} />
                              <stop offset="100%" stopColor={activeWaveAreaBottom} />
                            </linearGradient>
                            <linearGradient id="liveWaveMountainGlow" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor={activeWaveGlow} />
                              <stop offset="50%" stopColor={hexToRgba(activeWaveColor, 0.24)} />
                              <stop offset="100%" stopColor={hexToRgba(activeWaveColor, 0.08)} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2A3240" vertical={false} />
                          <XAxis
                            dataKey="ts"
                            type="number"
                            domain={[waveformVisibleStartTs, waveformVisibleEndTs]}
                            tickFormatter={(value: number) => format(new Date(value), 'h:mm:ss a')}
                            stroke="#748095"
                            tick={{ fill: '#748095', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            tickMargin={8}
                            minTickGap={34}
                          />
                          <YAxis
                            stroke="#748095"
                            tick={{ fill: '#748095', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={36}
                            domain={[
                              (dataMin: number) => Math.max(0, Math.floor(dataMin - 6)),
                              (dataMax: number) => Math.ceil(dataMax + 6),
                            ]}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#141A22',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '10px',
                              color: '#fff',
                            }}
                            formatter={(value: number, name: string, payload: any) => {
                              if (name === 'gapGuide' || payload?.payload?.isGap) {
                                return ['No data', 'Gap'];
                              }
                              return [
                                value == null ? 'No data' : `${value} bpm`,
                                payload?.payload?.zoneLabel || 'Heart Rate',
                              ];
                            }}
                            labelFormatter={(value: number) => format(new Date(value), 'h:mm:ss a')}
                          />
                          <Area
                            type="monotone"
                            dataKey={activeWaveDataKey}
                            stroke="none"
                            fill="url(#liveWaveMountainFill)"
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                          <Area
                            type="monotone"
                            dataKey={activeWaveDataKey}
                            stroke="none"
                            fill="url(#liveWaveMountainGlow)"
                            fillOpacity={0.22}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                          <Line
                            type="linear"
                            dataKey="gapGuide"
                            stroke="rgba(143,157,177,0.35)"
                            strokeWidth={1.8}
                            strokeDasharray="5 5"
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="bpm"
                            stroke="rgba(111,130,158,0.28)"
                            strokeWidth={2}
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                          <Line
                            type="monotone"
                            dataKey={activeWaveDataKey}
                            stroke={activeWaveStroke}
                            strokeWidth={3.6}
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-sm text-gray-400 gap-2">
                        <div>{hrConnected ? 'Waiting for incoming heart-rate packets...' : 'Connect device to start live heart-rate stream.'}</div>
                        {waveformHasGapSegments && (
                          <div className="text-[11px] text-[#7F8EA3]">Dashed bridge means there was no data in that section.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,17,28,0.72)_0%,rgba(8,14,23,0.92)_100%)] p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-[11px] text-[#8EA0B8]">
                        Zone track linked to waveform
                        {waveformHasGapSegments ? ' • dashed line = no data gap' : ''}
                      </div>
                      <div className="text-[11px]">
                        Current: <span style={{ color: hrZone.color }} className="font-semibold">{hrZone.label}</span>
                      </div>
                    </div>

                    <div className="relative rounded-xl border border-white/10 bg-black/20 p-1">
                      {zoneHintLabel && useCompactZoneLabels && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg border border-white/20 bg-[#0D1828]/95 text-[11px] font-medium text-[#DCEAFF] whitespace-nowrap z-10 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
                          {zoneHintLabel}
                        </div>
                      )}
                      <div className="grid grid-cols-6 gap-1">
                        <button
                          onClick={() => setSelectedZoneFilter(null)}
                          onPointerDown={() => handleZoneHintStart('Theme signal (all zones)')}
                          onPointerUp={handleZoneHintEnd}
                          onPointerLeave={handleZoneHintEnd}
                          onPointerCancel={handleZoneHintEnd}
                          title="Theme signal (all zones)"
                          className={`h-10 rounded-lg border text-[10px] sm:text-xs font-semibold ${useCompactZoneLabels ? '' : 'tracking-[0.1em] uppercase'} transition-colors ${
                            selectedZoneFilter === null
                              ? 'bg-[#00D4FF]/22 border-[#00D4FF]/55 text-[#9BEAFF]'
                              : 'bg-transparent border-white/10 text-[#9DB0C6] hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {useCompactZoneLabels ? 'All' : 'Theme'}
                        </button>
                        {zoneDistribution.map((zone, idx) => (
                          <button
                            key={zone.id}
                            onClick={() => setSelectedZoneFilter((prev) => (prev === idx ? null : idx))}
                            onPointerDown={() => handleZoneHintStart(`${zone.name} (${zone.range} bpm)`)}
                            onPointerUp={handleZoneHintEnd}
                            onPointerLeave={handleZoneHintEnd}
                            onPointerCancel={handleZoneHintEnd}
                            title={`${zone.name} (${zone.range} bpm)`}
                            className={`h-10 rounded-lg border text-[10px] sm:text-xs font-semibold transition-colors ${
                              selectedZoneFilter === idx
                                ? 'text-white'
                                : currentZoneIndex === idx
                                  ? 'text-white bg-black/25'
                                  : 'text-[#9DB0C6] hover:text-white hover:bg-white/5'
                            }`}
                            style={{
                              borderColor:
                                selectedZoneFilter === idx
                                  ? `${zone.color}CC`
                                  : currentZoneIndex === idx
                                    ? `${zone.color}77`
                                    : 'rgba(255,255,255,0.12)',
                              background:
                                selectedZoneFilter === idx
                                  ? `linear-gradient(180deg, ${zone.color}28 0%, rgba(8,14,23,0.85) 100%)`
                                  : undefined,
                            }}
                          >
                            {useCompactZoneLabels ? (ZONE_SHORT_LABEL_BY_ID[zone.id] || zone.name) : zone.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-64 rounded-2xl border border-white/6 bg-black/10 px-2 py-3">
                  {hasPeriodBarData ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodHeartRateBars} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A3240" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#748095"
                          tick={{ fill: '#9AACC3', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#748095"
                          tick={{ fill: '#748095', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          width={34}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                          contentStyle={{
                            backgroundColor: '#141A22',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '10px',
                            color: '#fff',
                          }}
                          formatter={(value: number, _name: string, payload: any) => [
                            payload?.payload?.avgBpm ? `${value} bpm` : 'No data',
                            payload?.payload?.longLabel || 'Average HR',
                          ]}
                        />
                        <Bar dataKey={(entry) => entry.avgBpm ?? 0} radius={[10, 10, 4, 4]}>
                          {periodHeartRateBars.map((entry, index) => (
                            <Cell
                              key={`${entry.label}-${index}`}
                              fill={entry.avgBpm == null ? 'rgba(255,255,255,0.08)' : entry.color}
                              fillOpacity={entry.avgBpm == null ? 1 : 0.92}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-center text-sm text-gray-400">
                      No heart-rate history yet for this {heartRateView}.
                    </div>
                  )}
                </div>
              )}
            </div>

            {hrError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {hrError}
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">
              <div className="text-white font-semibold mb-2">WHOOP setup</div>
              <p>1. In WHOOP app, enable Heart Rate Broadcast.</p>
              <p>2. Keep WHOOP nearby and unlocked for pairing.</p>
              <p>3. Open this Live HR view in Chrome/Edge and tap Connect WHOOP.</p>
            </div>

            {!supportsWebBluetooth && (
              <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-sm text-yellow-100 inline-flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5" />
                Web Bluetooth requires a secure origin (HTTPS) and a compatible browser (Chrome/Edge).
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};
