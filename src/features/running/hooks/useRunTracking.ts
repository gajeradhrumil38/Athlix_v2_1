import { useState, useEffect, useRef, useCallback } from 'react';
import { useGPS } from './useGPS';
import { calculateDistance, calculatePace } from '../utils/gpsCalculations';
import type { GpsPoint } from '../utils/gpsCalculations';

export interface RunSummary {
  path: GpsPoint[];
  distance: number;
  duration: number;
  pace: number;
  timestamp: number;
}

interface UseRunTrackingReturn {
  isRunning: boolean;
  isPaused: boolean;
  path: GpsPoint[];
  currentPosition: GpsPoint | null;
  totalDistance: number;
  elapsedTime: number;
  pace: number;
  error: string | null;
  startRun: () => void;
  pauseRun: () => void;
  resumeRun: () => void;
  stopRun: () => RunSummary;
}

export const useRunTracking = (): UseRunTrackingReturn => {
  const { position, error, errorCode, startTracking, stopTracking } = useGPS();
  const [path, setPath] = useState<GpsPoint[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const timerRef = useRef<number | null>(null);
  const pathRef = useRef<GpsPoint[]>([]);
  const distanceRef = useRef(0);
  const skipNextDeltaRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      setElapsedTime((prev) => prev + 1000);
    }, 1000);
  };

  const startRun = useCallback(() => {
    const started = startTracking();
    if (!started) {
      setIsRunning(false);
      setIsPaused(false);
      return;
    }

    pathRef.current = [];
    distanceRef.current = 0;
    skipNextDeltaRef.current = false;
    setPath([]);
    setTotalDistance(0);
    setElapsedTime(0);
    setIsRunning(true);
    setIsPaused(false);
    startTimer();
  }, [startTracking]);

  const pauseRun = useCallback(() => {
    setIsPaused(true);
    clearTimer();
  }, []);

  const resumeRun = useCallback(() => {
    setIsPaused(false);
    skipNextDeltaRef.current = true;
    startTimer();
  }, []);

  const stopRun = useCallback((): RunSummary => {
    clearTimer();
    stopTracking();
    setIsRunning(false);
    setIsPaused(false);
    const summary: RunSummary = {
      path: pathRef.current,
      distance: distanceRef.current,
      duration: elapsedTime,
      pace: calculatePace(distanceRef.current, elapsedTime),
      timestamp: Date.now(),
    };
    return summary;
  }, [elapsedTime, stopTracking]);

  // Track new GPS position → append to path
  useEffect(() => {
    if (!position || !isRunning || isPaused) return;
    const last = pathRef.current[pathRef.current.length - 1];
    if (last) {
      if (skipNextDeltaRef.current) {
        skipNextDeltaRef.current = false;
      } else {
        const delta = calculateDistance(last, position);
        // Ignore jitter under 3 m
        if (delta * 1000 < 3) return;
        distanceRef.current += delta;
        setTotalDistance(distanceRef.current);
      }
    }
    pathRef.current = [...pathRef.current, position];
    setPath([...pathRef.current]);
  }, [position, isRunning, isPaused]);

  // If tracking cannot begin due permission denial, end the run gracefully.
  useEffect(() => {
    if (!isRunning || isPaused) return;
    if (pathRef.current.length > 0) return;
    if (!errorCode || errorCode !== 1) return;

    clearTimer();
    stopTracking();
    setIsRunning(false);
    setIsPaused(false);
  }, [errorCode, isPaused, isRunning, stopTracking]);

  useEffect(() => () => { clearTimer(); stopTracking(); }, []);

  return {
    isRunning,
    isPaused,
    path,
    currentPosition: position,
    totalDistance,
    elapsedTime,
    pace: totalDistance > 0 ? calculatePace(totalDistance, elapsedTime) : 0,
    error,
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
  };
};
