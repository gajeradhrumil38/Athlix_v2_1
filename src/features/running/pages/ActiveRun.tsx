import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Square, MapPin, AlertCircle, ChevronLeft, Home, LocateOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { saveWorkout } from '../../../lib/supabaseData';
import { useRunTracking } from '../hooks/useRunTracking';
import { RunMap } from '../components/RunMap';
import { RunStats } from '../components/RunStats';
import { saveRun } from '../utils/storage';
import { formatDuration, formatPace } from '../utils/gpsCalculations';

export const ActiveRun: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    isRunning, isPaused, path, currentPosition,
    totalDistance, elapsedTime, pace, error, errorCode,
    startRun, pauseRun, resumeRun, stopRun,
  } = useRunTracking();

  const [distanceUnit] = useState<'km' | 'mi'>(() => {
    try { const s = localStorage.getItem('athlix_distance_unit'); return s === 'mi' ? 'mi' : 'km'; }
    catch { return 'km'; }
  });

  const displayDistance = useMemo(
    () => (distanceUnit === 'mi' ? totalDistance * 0.621371 : totalDistance),
    [distanceUnit, totalDistance],
  );
  const needsInternet = typeof navigator !== 'undefined' && !navigator.onLine;

  const [finished, setFinished] = useState<{
    distance: number; duration: number; pace: number; unit: 'km' | 'mi';
  } | null>(null);

  const handleStop = async () => {
    const summary = stopRun();
    const displayDist = distanceUnit === 'mi' ? summary.distance * 0.621371 : summary.distance;
    const displayPaceVal = distanceUnit === 'mi' ? summary.pace * 1.609344 : summary.pace;
    saveRun(summary);
    if (user) {
      const durationMinutes = Math.max(1, Math.round(summary.duration / 60000));
      const roundedDist = Math.max(0, Number(displayDist.toFixed(2)));
      try {
        await saveWorkout(user.id, {
          title: 'Outdoor Run',
          date: format(new Date(summary.timestamp), 'yyyy-MM-dd'),
          duration_minutes: durationMinutes,
          notes: `Live run tracking – ${roundedDist.toFixed(2)} ${distanceUnit}`,
          exercises: [{
            name: 'Running', muscle_group: 'Cardio',
            completed_sets: [{ reps: durationMinutes, weight: roundedDist, unit: distanceUnit }],
          }],
        });
        toast.success('Run synced to workout history');
      } catch (e: any) {
        toast.error(e?.message || 'Run saved locally, sync failed.');
      }
    }
    setFinished({ distance: displayDist, duration: summary.duration, pace: displayPaceVal, unit: distanceUnit });
  };

  /* ── Permission denied screen ──────────────────────────── */
  const isPermDenied = errorCode === 1;

  if (isPermDenied && !isRunning) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--bg-base)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <button
            onClick={() => navigate('/')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] active:scale-95 transition-all"
            style={{ border: '1px solid var(--border)' }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-semibold text-[var(--text-primary)]">Run</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <LocateOff className="h-7 w-7 text-red-400" />
          </div>

          <div>
            <p className="text-[18px] font-bold text-[var(--text-primary)]">Location access denied</p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Athlix needs your location to track your run. Re-enable it in Chrome in 3 steps:
            </p>
          </div>

          {/* Steps */}
          <div className="w-full space-y-2 text-left">
            {[
              { n: 1, text: 'Tap the 🔒 lock icon in the Chrome address bar' },
              { n: 2, text: 'Tap "Site settings" → set Location to Allow' },
              { n: 3, text: 'Reload this page and tap Start Run again' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black"
                  style={{ background: 'var(--accent)', marginTop: 1 }}
                >
                  {n}
                </span>
                <span className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{text}</span>
              </div>
            ))}
          </div>

          <div className="flex w-full flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="h-12 w-full rounded-xl text-[14px] font-bold text-black transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}
            >
              Reload &amp; Try Again
            </button>
            <button
              onClick={() => navigate('/')}
              className="h-11 w-full rounded-xl text-[13px] font-semibold text-[var(--text-secondary)] transition-all active:scale-[0.98]"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Run complete screen ────────────────────────────────── */
  if (finished) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg-base)] px-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: 'var(--accent)' }}
        >
          <Square className="h-8 w-8 text-black" fill="black" />
        </motion.div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Run Complete</p>
          <h2 className="mt-1 text-[28px] font-black text-[var(--text-primary)]">
            {finished.distance.toFixed(2)} {finished.unit}
          </h2>
        </div>
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
            <div className="flex flex-col items-center gap-1 pr-4">
              <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Time</span>
              <span className="font-victory text-[24px] font-black text-[var(--text-primary)]">{formatDuration(finished.duration)}</span>
            </div>
            <div className="flex flex-col items-center gap-1 pl-4">
              <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Pace</span>
              <span className="font-victory text-[24px] font-black text-[var(--text-primary)]">
                {finished.pace > 0 ? formatPace(finished.pace) : '--:--'}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">/{finished.unit}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          className="h-12 w-full rounded-xl text-[14px] font-bold text-black transition-all active:scale-[0.98]"
          style={{ background: 'var(--accent)' }}
        >
          Done
        </button>
      </div>
    );
  }

  /* ── Main run screen ────────────────────────────────────── */
  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* Top bar — back button (only when not actively running) */}
      <AnimatePresence>
        {!isRunning && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4"
            style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 10 }}
          >
            <button
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-base)]/80 text-[var(--text-secondary)] backdrop-blur-sm active:scale-95 transition-all"
              style={{ border: '1px solid var(--border)' }}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-base)]/80 text-[var(--text-secondary)] backdrop-blur-sm active:scale-95 transition-all"
              style={{ border: '1px solid var(--border)' }}
            >
              <Home className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map */}
      <div className="relative flex-1 p-3 pb-0">
        <RunMap path={path} currentPosition={currentPosition} />

        {/* Acquiring GPS overlay */}
        <AnimatePresence>
          {isRunning && !currentPosition && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-3 flex items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm"
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <MapPin className="h-6 w-6 animate-pulse text-[var(--accent)]" />
                <p className="text-[13px] font-semibold text-white">Acquiring GPS…</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live distance badge */}
        {isRunning && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-base)]/85 px-4 py-1.5 backdrop-blur-md">
            <span className="font-victory text-[17px] font-black tabular-nums text-[var(--accent)]">
              {displayDistance.toFixed(2)} {distanceUnit}
            </span>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="space-y-3 p-3">
        <RunStats distance={totalDistance} time={elapsedTime} pace={pace} unit={distanceUnit} />

        {needsInternet && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Map tiles need internet — GPS tracking continues offline.
          </div>
        )}

        <AnimatePresence>
          {error && !isPermDenied && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        {!isRunning && (
          <button
            onClick={startRun}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-black transition-all active:scale-[0.98]"
            style={{ background: 'var(--accent)' }}
          >
            <Play className="h-5 w-5 fill-black" />
            Start Run
          </button>
        )}

        {isRunning && !isPaused && (
          <div className="flex gap-3">
            <button
              onClick={pauseRun}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[15px] font-bold text-[var(--text-primary)] transition-all active:scale-[0.97]"
            >
              <Pause className="h-5 w-5" /> Pause
            </button>
            <button
              onClick={() => { void handleStop(); }}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/90 text-[15px] font-bold text-white transition-all active:scale-[0.97]"
            >
              <Square className="h-5 w-5 fill-white" /> Stop
            </button>
          </div>
        )}

        {isRunning && isPaused && (
          <div className="flex gap-3">
            <button
              onClick={resumeRun}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-black transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}
            >
              <Play className="h-5 w-5 fill-black" /> Resume
            </button>
            <button
              onClick={() => { void handleStop(); }}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/90 text-[15px] font-bold text-white transition-all active:scale-[0.97]"
            >
              <Square className="h-5 w-5 fill-white" /> Finish
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
