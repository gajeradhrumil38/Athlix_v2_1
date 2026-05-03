import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Footprints, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { getRuns, deleteRun } from '../utils/storage';
import type { SavedRun } from '../utils/storage';
import { RunRouteBackground } from '../components/RunRouteBackground';
import { formatDuration, formatPace } from '../utils/gpsCalculations';

// ── Demo runs — Cedar Rapids, Iowa sidewalk routes ───────────────────────────
// Indian Creek Trail loop: ~5 mi / 8.05 km
const DEMO_PATH_5MI = [
  { lat: 42.0080, lng: -91.6430 }, { lat: 42.0073, lng: -91.6441 },
  { lat: 42.0065, lng: -91.6449 }, { lat: 42.0057, lng: -91.6456 },
  { lat: 42.0048, lng: -91.6462 }, { lat: 42.0039, lng: -91.6466 },
  { lat: 42.0029, lng: -91.6469 }, { lat: 42.0019, lng: -91.6471 },
  { lat: 42.0009, lng: -91.6472 }, { lat: 41.9999, lng: -91.6472 },
  { lat: 41.9989, lng: -91.6470 }, { lat: 41.9979, lng: -91.6468 },
  { lat: 41.9970, lng: -91.6464 }, { lat: 41.9962, lng: -91.6458 },
  { lat: 41.9955, lng: -91.6450 }, { lat: 41.9949, lng: -91.6441 },
  { lat: 41.9944, lng: -91.6431 }, { lat: 41.9941, lng: -91.6420 },
  { lat: 41.9940, lng: -91.6408 }, { lat: 41.9941, lng: -91.6396 },
  { lat: 41.9944, lng: -91.6386 }, { lat: 41.9949, lng: -91.6377 },
  { lat: 41.9956, lng: -91.6370 }, { lat: 41.9964, lng: -91.6366 },
  { lat: 41.9973, lng: -91.6366 }, { lat: 41.9981, lng: -91.6370 },
  { lat: 41.9989, lng: -91.6376 }, { lat: 41.9996, lng: -91.6383 },
  { lat: 42.0003, lng: -91.6392 }, { lat: 42.0010, lng: -91.6400 },
  { lat: 42.0017, lng: -91.6408 }, { lat: 42.0024, lng: -91.6415 },
  { lat: 42.0031, lng: -91.6420 }, { lat: 42.0039, lng: -91.6424 },
  { lat: 42.0048, lng: -91.6426 }, { lat: 42.0057, lng: -91.6428 },
  { lat: 42.0066, lng: -91.6429 }, { lat: 42.0073, lng: -91.6429 },
  { lat: 42.0080, lng: -91.6430 },
];

// Bever Park neighborhood loop: ~3 mi / 4.83 km
const DEMO_PATH_3MI = [
  { lat: 41.9628, lng: -91.6350 }, { lat: 41.9624, lng: -91.6334 },
  { lat: 41.9621, lng: -91.6318 }, { lat: 41.9619, lng: -91.6302 },
  { lat: 41.9619, lng: -91.6286 }, { lat: 41.9622, lng: -91.6272 },
  { lat: 41.9628, lng: -91.6260 }, { lat: 41.9636, lng: -91.6251 },
  { lat: 41.9645, lng: -91.6246 }, { lat: 41.9654, lng: -91.6245 },
  { lat: 41.9663, lng: -91.6248 }, { lat: 41.9670, lng: -91.6254 },
  { lat: 41.9676, lng: -91.6263 }, { lat: 41.9680, lng: -91.6275 },
  { lat: 41.9681, lng: -91.6289 }, { lat: 41.9679, lng: -91.6304 },
  { lat: 41.9675, lng: -91.6317 }, { lat: 41.9669, lng: -91.6328 },
  { lat: 41.9661, lng: -91.6337 }, { lat: 41.9652, lng: -91.6344 },
  { lat: 41.9642, lng: -91.6348 }, { lat: 41.9635, lng: -91.6350 },
  { lat: 41.9628, lng: -91.6350 },
];

const NOW = Date.now();
const DEMO_RUNS: SavedRun[] = [
  {
    id: -1,
    path: DEMO_PATH_5MI,
    distance: 8.047,   // km = 5 mi
    duration: 2970000, // 49 min 30 s
    pace: 6.21,        // min/km ≈ 10 min/mi
    timestamp: NOW - 2 * 24 * 60 * 60 * 1000 - 7.25 * 60 * 60 * 1000, // 2 days ago 7:15 AM
  },
  {
    id: -2,
    path: DEMO_PATH_3MI,
    distance: 4.828,   // km = 3 mi
    duration: 1728000, // 28 min 48 s
    pace: 5.98,        // min/km ≈ 9.6 min/mi
    timestamp: NOW - 4 * 24 * 60 * 60 * 1000 - 6.75 * 60 * 60 * 1000, // 4 days ago 6:45 AM
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const useDistanceUnit = (): 'km' | 'mi' => {
  try { const s = localStorage.getItem('athlix_distance_unit'); return s === 'mi' ? 'mi' : 'km'; }
  catch { return 'km'; }
};

// ── Component ────────────────────────────────────────────────────────────────

export const RunHistory: React.FC = () => {
  const navigate = useNavigate();
  const [realRuns, setRealRuns] = useState<SavedRun[]>(() => getRuns().slice().reverse());
  const [selected, setSelected] = useState<SavedRun | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedRun | null>(null);
  const distanceUnit = useDistanceUnit();

  const runs = [...realRuns, ...DEMO_RUNS];
  const isDemo = (run: SavedRun) => run.id < 0;

  const dist = (km: number) => (distanceUnit === 'mi' ? km * 0.621371 : km);
  const paceDisplay = (paceKm: number) => (distanceUnit === 'mi' ? paceKm * 1.609344 : paceKm);

  const handleDelete = (run: SavedRun) => {
    if (isDemo(run)) {
      toast('Demo runs are for preview only', { icon: '👟' });
      setConfirmDelete(null);
      return;
    }
    deleteRun(run.id);
    setRealRuns((prev) => prev.filter((r) => r.id !== run.id));
    if (selected?.id === run.id) setSelected(null);
    setConfirmDelete(null);
  };

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: '#0d0f14', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-4 pb-4"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-victory text-[15px] font-black tracking-[0.2em] text-white uppercase">
          Run History
        </span>
        <span className="ml-auto text-[11px] font-bold text-white/30">
          {runs.length} {runs.length === 1 ? 'run' : 'runs'}
        </span>
      </div>

      {/* ── Empty state (no real runs AND demo disabled — shouldn't happen) ── */}
      {runs.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'rgba(200,255,0,0.07)', border: '1px solid rgba(200,255,0,0.14)' }}
          >
            <Footprints className="h-7 w-7 opacity-50" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-[17px] font-black text-white">No runs yet</p>
            <p className="mt-1 text-[12px] font-semibold text-white/40">Your completed runs will appear here</p>
          </div>
          <button
            onClick={() => navigate('/run')}
            className="mt-1 rounded-full px-8 font-victory text-[14px] font-black tracking-[0.2em] text-black transition-all active:scale-[0.97]"
            style={{ background: 'var(--accent)', height: 52 }}
          >
            START A RUN
          </button>
        </div>
      )}

      {/* ── Run list ── */}
      {runs.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="flex flex-col gap-3">
            {runs.map((run, idx) => {
              const d = dist(run.distance);
              const p = paceDisplay(run.pace);
              const demo = isDemo(run);
              return (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-stretch rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {/* Tap area → open detail */}
                  <button
                    onClick={() => setSelected(run)}
                    className="flex flex-1 items-center gap-4 px-4 py-4 text-left transition-all active:scale-[0.98] min-w-0"
                  >
                    {/* Date column */}
                    <div className="flex min-w-[56px] flex-col gap-0.5 shrink-0">
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">
                        {format(new Date(run.timestamp), 'MMM d')}
                      </span>
                      <span
                        className="text-[11px] font-black uppercase tracking-[0.1em]"
                        style={{ color: demo ? 'rgba(200,255,0,0.55)' : 'var(--accent)' }}
                      >
                        {format(new Date(run.timestamp), 'EEE')}
                      </span>
                      <span className="text-[10px] font-semibold text-white/25">
                        {format(new Date(run.timestamp), 'h:mm a')}
                      </span>
                      {demo && (
                        <span
                          className="mt-0.5 self-start rounded px-1 py-px text-[8px] font-black uppercase tracking-[0.1em]"
                          style={{ background: 'rgba(200,255,0,0.1)', color: 'rgba(200,255,0,0.45)', border: '1px solid rgba(200,255,0,0.15)' }}
                        >
                          demo
                        </span>
                      )}
                    </div>

                    <div className="h-10 w-px shrink-0 bg-white/[0.07]" />

                    {/* Stats */}
                    <div className="flex flex-1 items-center justify-around min-w-0">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-victory text-[26px] font-black tabular-nums leading-none text-white">
                          {d.toFixed(2)}
                        </span>
                        <span className="text-[9px] font-bold uppercase text-white/30">{distanceUnit}</span>
                      </div>
                      <div className="h-8 w-px bg-white/[0.07]" />
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-victory text-[22px] font-black tabular-nums leading-none text-white">
                          {formatDuration(run.duration)}
                        </span>
                        <span className="text-[9px] font-bold uppercase text-white/30">Time</span>
                      </div>
                      <div className="h-8 w-px bg-white/[0.07]" />
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-victory text-[22px] font-black tabular-nums leading-none text-white">
                          {p > 0 ? formatPace(p) : '--:--'}
                        </span>
                        <span className="text-[9px] font-bold uppercase text-white/30">/{distanceUnit}</span>
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setConfirmDelete(run)}
                    className="flex items-center justify-center px-4 transition-all active:scale-95 shrink-0"
                    style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}
                    aria-label="Delete run"
                  >
                    <Trash2 className="h-4 w-4 text-white/20 hover:text-red-400 transition-colors" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Delete confirm dialog ── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[320px] rounded-2xl p-6 flex flex-col gap-5"
              style={{ background: '#161a22', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="flex justify-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)' }}
                >
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-[16px] font-black text-white">Delete Run?</p>
                <p className="mt-1.5 text-[12px] font-semibold leading-relaxed text-white/45">
                  {format(new Date(confirmDelete.timestamp), "EEE, MMM d · h:mm a")}
                  <br />
                  This run will be permanently removed.
                </p>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white/70 transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(239,68,68,0.82)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  DELETE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Detail overlay — screenshot-worthy design ── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 overflow-hidden cursor-pointer"
            style={{ background: '#0d0f14' }}
            onClick={() => setSelected(null)}
          >
            {/* Map — visible in top 65% */}
            <RunRouteBackground path={selected.path} />

            {/* Lighter gradient so the route shows through clearly */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(13,15,20,0.08) 0%, rgba(13,15,20,0.18) 28%, rgba(13,15,20,0.72) 52%, rgba(13,15,20,0.97) 66%, #0d0f14 78%)',
              }}
            />

            {/* Top bar: back + delete */}
            <div
              className="absolute left-0 right-0 top-0 flex items-center justify-between px-4"
              style={{ zIndex: 10, paddingTop: 'max(16px, env(safe-area-inset-top))' }}
            >
              <button
                onClick={() => setSelected(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 backdrop-blur-sm transition-all active:scale-95"
                style={{ background: 'rgba(13,15,20,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              {isDemo(selected) && (
                <span
                  className="rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em]"
                  style={{ background: 'rgba(13,15,20,0.6)', color: 'rgba(200,255,0,0.6)', border: '1px solid rgba(200,255,0,0.18)' }}
                >
                  Cedar Rapids, IA
                </span>
              )}

              <button
                onClick={() => setConfirmDelete(selected)}
                className="flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition-all active:scale-95"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}
                aria-label="Delete run"
              >
                <Trash2 className="h-4 w-4 text-red-400" />
              </button>
            </div>

            {/* Stats content — pinned to bottom; stop propagation so tapping stats doesn't dismiss */}
            <div
              className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-0 px-6 cursor-default"
              style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Date */}
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="mb-3 text-[10px] font-black uppercase tracking-[0.3em]"
                style={{ color: 'var(--accent)' }}
              >
                {format(new Date(selected.timestamp), "EEEE, MMM d · h:mm a")}
              </motion.p>

              {/* Distance — hero number */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, type: 'spring', stiffness: 240, damping: 22 }}
                className="flex items-baseline gap-2 mb-4"
              >
                <span className="font-victory text-[80px] font-black leading-none tabular-nums text-white"
                  style={{ letterSpacing: '-0.01em' }}>
                  {dist(selected.distance).toFixed(2)}
                </span>
                <span className="font-victory text-[28px] font-black text-white/35">{distanceUnit}</span>
              </motion.div>

              {/* Accent divider */}
              <motion.div
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                transition={{ delay: 0.24, duration: 0.4 }}
                className="mb-5 h-px w-16 origin-center"
                style={{ background: 'var(--accent)' }}
              />

              {/* Time + Pace */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
                className="mb-6 flex w-full items-start justify-around"
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/30">Time</span>
                  <span className="font-victory text-[38px] font-black tabular-nums leading-none text-white">
                    {formatDuration(selected.duration)}
                  </span>
                </div>

                <div className="mt-1 h-12 w-px bg-white/[0.08]" />

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/30">Avg Pace</span>
                  <span className="font-victory text-[38px] font-black tabular-nums leading-none text-white">
                    {selected.pace > 0 ? formatPace(paceDisplay(selected.pace)) : '--:--'}
                  </span>
                  <span className="text-[11px] font-bold text-white/25">/{distanceUnit}</span>
                </div>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                className="mt-3 text-[10px] font-semibold text-white/15"
              >
                © {new Date().getFullYear()} Athlix · Map © OpenStreetMap &amp; CARTO
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
