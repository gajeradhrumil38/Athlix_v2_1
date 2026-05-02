import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Square, MapPin, AlertCircle, ChevronLeft, LocateOff, Play, Pause, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { saveWorkout } from '../../../lib/supabaseData';
import { useRunTracking } from '../hooks/useRunTracking';
import { RunMap } from '../components/RunMap';
import { RunRouteBackground } from '../components/RunRouteBackground';
import { saveRun } from '../utils/storage';
import { formatDuration, formatPace } from '../utils/gpsCalculations';
import type { GpsPoint } from '../utils/gpsCalculations';

/* ── Hex-grid GPS loading overlay ──────────────────────────────── */
const HexOverlay: React.FC<{ show: boolean }> = ({ show }) => (
  <AnimatePresence>
    {show && (
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.9 }}
        className="absolute inset-0 z-30 flex flex-col items-center justify-center"
        style={{ background: '#0d0f14' }}
      >
        {/* hex grid */}
        <svg className="absolute inset-0 h-full w-full opacity-40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hx" x="0" y="0" width="62" height="71.6" patternUnits="userSpaceOnUse">
              <polygon points="31,3 59,18.8 59,52.8 31,68.6 3,52.8 3,18.8"
                fill="none" stroke="rgba(200,255,0,0.22)" strokeWidth="1" />
            </pattern>
            <pattern id="hx2" x="31" y="35.8" width="62" height="71.6" patternUnits="userSpaceOnUse">
              <polygon points="31,3 59,18.8 59,52.8 31,68.6 3,52.8 3,18.8"
                fill="none" stroke="rgba(200,255,0,0.22)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hx)" />
          <rect width="100%" height="100%" fill="url(#hx2)" />
        </svg>

        {/* pulsing GPS pin */}
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center">
            <span className="absolute h-20 w-20 rounded-full bg-[var(--accent)]/15 animate-ping" />
            <span className="absolute h-12 w-12 rounded-full bg-[var(--accent)]/25 animate-ping [animation-delay:0.35s]" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10">
              <MapPin className="h-6 w-6 text-[var(--accent)]" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-[17px] font-black tracking-wide text-white">Acquiring GPS</p>
            <p className="mt-0.5 text-[12px] font-semibold text-white/40">Loading nearest area…</p>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

/* ── Animated waveform — "active tracking" indicator ───────────── */
const TrackingWave: React.FC = () => (
  <div className="flex items-center gap-[3px]">
    {[0.45, 0.75, 1, 0.75, 0.45].map((h, i) => (
      <div
        key={i}
        className="w-[3px] rounded-full bg-[var(--accent)]"
        style={{
          height: `${Math.round(h * 14)}px`,
          animation: `waveBar 0.75s ${i * 0.12}s ease-in-out infinite alternate`,
        }}
      />
    ))}
    <style>{`
      @keyframes waveBar {
        from { transform: scaleY(0.4); opacity: 0.5; }
        to   { transform: scaleY(1);   opacity: 1;   }
      }
    `}</style>
  </div>
);

/* ── Slide-to-action control ───────────────────────────────────── */
interface SlideControlProps {
  label: string;
  icon: React.ReactNode;
  onConfirm: () => void;
  danger?: boolean;
}

const SlideControl: React.FC<SlideControlProps> = ({ label, icon, onConfirm, danger = false }) => {
  const [offset, setOffset] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const fired = useRef(false);
  const dragging = useRef(false);

  const accent = danger ? '#ef4444' : 'var(--accent)';
  const fill   = danger ? 'rgba(239,68,68,0.12)' : 'rgba(200,255,0,0.08)';
  const iconColor = danger ? 'text-white' : 'text-black';

  const maxOffset = () => {
    if (!trackRef.current) return 200;
    return trackRef.current.offsetWidth - 56 - 8;
  };

  const onDown = useCallback((e: React.PointerEvent) => {
    if (fired.current) return;
    dragging.current = true;
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || fired.current) return;
    const max = maxOffset();
    const dx = Math.max(0, Math.min(e.clientX - startX.current, max));
    setOffset(dx);
    if (dx >= max * 0.82) {
      fired.current = true;
      dragging.current = false;
      setTimeout(() => { onConfirm(); setOffset(0); fired.current = false; }, 180);
    }
  }, [onConfirm]);

  const onUp = useCallback(() => {
    if (!fired.current) { dragging.current = false; setOffset(0); }
  }, []);

  return (
    <div
      ref={trackRef}
      className="relative h-14 w-full select-none overflow-hidden rounded-full"
      style={{ background: fill, border: `1px solid ${accent}30` }}
    >
      {/* progress fill */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 rounded-full"
        style={{ width: offset + 56 + 8, background: `${accent}20`, transition: 'none' }}
      />
      {/* label */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] font-bold tracking-widest text-white/40 uppercase">{label}</span>
      </div>
      {/* handle */}
      <div
        className={`absolute top-1 z-10 flex h-12 w-12 cursor-grab items-center justify-center rounded-full shadow-lg active:cursor-grabbing ${iconColor}`}
        style={{ left: 4 + offset, background: accent }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {icon}
      </div>
    </div>
  );
};

/* ── Main component ────────────────────────────────────────────── */
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
  const displayPace = distanceUnit === 'mi' ? pace * 1.609344 : pace;

  const [finished, setFinished] = useState<{
    distance: number; duration: number; pace: number; unit: 'km' | 'mi'; path: GpsPoint[];
  } | null>(null);

  const needsInternet = typeof navigator !== 'undefined' && !navigator.onLine;
  const isPermDenied = errorCode === 1;

  /* acquiring = running but no position yet */
  const isAcquiring = isRunning && !currentPosition;

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
    setFinished({ distance: displayDist, duration: summary.duration, pace: displayPaceVal, unit: distanceUnit, path: summary.path });
  };

  /* ── Permission denied ─────────────────────────────────────── */
  if (isPermDenied && !isRunning) {
    return (
      <div className="flex min-h-screen flex-col" style={{ background: '#0d0f14', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-3 px-4 pb-3" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-black text-white">Run</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <LocateOff className="h-7 w-7 text-red-400" />
          </div>
          <div>
            <p className="text-[18px] font-black text-white">Location access denied</p>
            <p className="mt-1 text-[13px] font-semibold text-white/50">Re-enable in Chrome to track your run:</p>
          </div>
          <div className="w-full space-y-2 text-left">
            {[
              { n: 1, text: 'Tap the 🔒 lock icon in the Chrome address bar' },
              { n: 2, text: 'Tap "Site settings" → set Location to Allow' },
              { n: 3, text: 'Reload this page and tap Start Run again' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-black" style={{ background: 'var(--accent)', marginTop: 1 }}>{n}</span>
                <span className="text-[12px] font-semibold leading-relaxed text-white/60">{text}</span>
              </div>
            ))}
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="h-12 w-full rounded-full text-[14px] font-black text-black transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}
            >
              Reload &amp; Try Again
            </button>
            <button
              onClick={() => navigate('/')}
              className="h-11 w-full rounded-full text-[13px] font-bold text-white/60 transition-all active:scale-[0.98]"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              Back to App
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Run complete ───────────────────────────────────────────── */
  if (finished) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden" style={{ background: '#0d0f14' }}>

        {/* Blurred run route map as background */}
        <RunRouteBackground path={finished.path} />

        {/* Gradient overlay — dark at bottom so text is readable */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(13,15,20,0.55) 0%, rgba(13,15,20,0.7) 40%, rgba(13,15,20,0.96) 70%, #0d0f14 85%)' }}
        />

        {/* Content */}
        <div
          className="relative z-10 flex flex-1 flex-col items-center justify-end gap-6 px-6 pb-10 text-center"
          style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}
        >
          {/* Label */}
          <motion.p
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="text-[10px] font-black uppercase tracking-[0.35em] text-[var(--accent)]"
          >
            Run Complete
          </motion.p>

          {/* Big distance */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 220, damping: 20 }}
            className="flex items-baseline gap-2"
          >
            <span className="font-victory text-[72px] font-black leading-none tabular-nums text-white">
              {finished.distance.toFixed(2)}
            </span>
            <span className="font-victory text-[28px] font-black text-white/40">{finished.unit}</span>
          </motion.div>

          {/* Time + Pace — no card, just floating stats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="flex w-full items-start justify-around"
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Time</span>
              <span className="font-victory text-[36px] font-black tabular-nums leading-none text-white">
                {formatDuration(finished.duration)}
              </span>
            </div>

            <div className="mt-2 h-12 w-px bg-white/10" />

            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Avg Pace</span>
              <span className="font-victory text-[36px] font-black tabular-nums leading-none text-white">
                {finished.pace > 0 ? formatPace(finished.pace) : '--:--'}
              </span>
              <span className="text-[11px] font-bold text-white/30">/{finished.unit}</span>
            </div>
          </motion.div>

          {/* Done */}
          <motion.button
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            onClick={() => navigate('/')}
            className="h-14 w-full rounded-full font-victory text-[16px] font-black text-black transition-all active:scale-[0.97]"
            style={{ background: 'var(--accent)' }}
          >
            Done
          </motion.button>

          <p className="text-[10px] font-semibold text-white/20">
            © {new Date().getFullYear()} Athlix · Map © OpenStreetMap &amp; CARTO
          </p>
        </div>
      </div>
    );
  }

  /* ── Main run screen ─────────────────────────────────────────── */
  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background: '#0d0f14' }}>

      {/* ── Full-bleed map — isolation: isolate keeps Leaflet's internal z-indices (200-1000) from escaping into our stacking context ── */}
      <div className="absolute inset-0" style={{ isolation: 'isolate', zIndex: 0 }}>
        <RunMap path={path} currentPosition={currentPosition} />
      </div>

      {/* ── Hex loading overlay (acquiring GPS) ── */}
      <HexOverlay show={isAcquiring} />

      {/* ── Top bar — always visible ── */}
      <div
        className="absolute left-0 right-0 top-0 flex items-center justify-between px-4"
        style={{
          zIndex: 50,
          paddingTop: 'max(14px, env(safe-area-inset-top))',
          paddingBottom: 12,
          background: 'linear-gradient(to bottom, rgba(13,15,20,0.85) 0%, transparent 100%)',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 backdrop-blur-sm active:scale-95 transition-all"
          style={{ background: 'rgba(255,255,255,0.1)' }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* center: run status */}
        <div className="flex items-center gap-2">
          {isRunning && !isPaused ? (
            <>
              <TrackingWave />
              <span className="text-[13px] font-black text-white tracking-wide">TRACKING</span>
            </>
          ) : isPaused ? (
            <span className="text-[13px] font-black text-[var(--accent)] tracking-wide">PAUSED</span>
          ) : (
            <span className="text-[13px] font-black text-white/50 tracking-wide">READY</span>
          )}
        </div>

        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 backdrop-blur-sm active:scale-95 transition-all"
          style={{ background: 'rgba(255,255,255,0.1)' }}
        >
          <Home className="h-4 w-4" />
        </button>
      </div>

      {/* ── Bottom gradient panel ── */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col gap-2.5 px-4 pt-8"
        style={{
          zIndex: 50,
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, #0d0f14 0%, #0d0f14 68%, rgba(13,15,20,0.85) 85%, transparent 100%)',
        }}
      >
        {/* ─ Stats row ─ */}
        <div className="grid grid-cols-3">
          {[
            { label: 'DISTANCE', value: displayDistance.toFixed(2), unit: distanceUnit },
            { label: 'TIME', value: formatDuration(elapsedTime), unit: '' },
            { label: 'PACE', value: displayPace > 0 ? formatPace(displayPace) : '--:--', unit: `/${distanceUnit}` },
          ].map(({ label, value, unit }, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--accent)]/80">{label}</span>
              <span className="font-victory text-[32px] font-black tabular-nums leading-none text-white">{value}</span>
              {unit ? <span className="text-[11px] font-bold text-white/30">{unit}</span> : <span className="h-[18px]" />}
            </div>
          ))}
        </div>

        {/* ─ Alerts ─ */}
        {needsInternet && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-amber-200" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            Map tiles need internet — GPS tracking continues offline.
          </div>
        )}

        <AnimatePresence>
          {error && !isPermDenied && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-red-300"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─ Background GPS notice ─ */}
        <AnimatePresence>
          {isRunning && !isPaused && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center text-[11px] font-bold text-white/30"
            >
              GPS continues while Chrome is open in background
            </motion.p>
          )}
        </AnimatePresence>

        {/* ─ Controls ─ */}
        <AnimatePresence mode="wait">
          {/* Not started */}
          {!isRunning && (
            <motion.div key="start" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <SlideControl
                label="SLIDE TO START"
                icon={<Play className="h-5 w-5 fill-black text-black ml-0.5" />}
                onConfirm={startRun}
              />
            </motion.div>
          )}

          {/* Running */}
          {isRunning && !isPaused && (
            <motion.div key="running" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-2.5">
              <button
                onClick={pauseRun}
                className="flex h-14 w-[120px] shrink-0 items-center justify-center gap-2 rounded-full transition-all active:scale-[0.95]"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.18)' }}
              >
                <Pause className="h-[18px] w-[18px] fill-white text-white" />
                <span className="font-victory text-[16px] font-black tracking-wide text-white">Pause</span>
              </button>
              <div className="flex-1">
                <SlideControl
                  label="SLIDE TO STOP"
                  icon={<Square className="h-4 w-4 fill-white text-white" />}
                  onConfirm={() => { void handleStop(); }}
                  danger
                />
              </div>
            </motion.div>
          )}

          {/* Paused */}
          {isRunning && isPaused && (
            <motion.div key="paused" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-2.5">
              <button
                onClick={resumeRun}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-black transition-all active:scale-[0.97]"
                style={{ background: 'var(--accent)' }}
              >
                <Play className="h-5 w-5 fill-black" />
                <span className="font-victory text-[16px] font-black tracking-wide">Resume</span>
              </button>
              <button
                onClick={() => { void handleStop(); }}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-white transition-all active:scale-[0.97]"
                style={{ background: 'rgba(239,68,68,0.85)' }}
              >
                <Square className="h-4 w-4 fill-white" />
                <span className="font-victory text-[16px] font-black tracking-wide">Finish</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─ Copyright ─ */}
        <p className="text-center text-[10px] font-semibold text-white/20">
          © {new Date().getFullYear()} Athlix · Map © OpenStreetMap &amp; CARTO
        </p>
      </div>
    </div>
  );
};
