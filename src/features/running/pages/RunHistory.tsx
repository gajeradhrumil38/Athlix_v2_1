import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Footprints } from 'lucide-react';
import { format } from 'date-fns';
import { getRuns } from '../utils/storage';
import type { SavedRun } from '../utils/storage';
import { RunRouteBackground } from '../components/RunRouteBackground';
import { formatDuration, formatPace } from '../utils/gpsCalculations';

const useDistanceUnit = (): 'km' | 'mi' => {
  try { const s = localStorage.getItem('athlix_distance_unit'); return s === 'mi' ? 'mi' : 'km'; }
  catch { return 'km'; }
};

export const RunHistory: React.FC = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<SavedRun | null>(null);
  const distanceUnit = useDistanceUnit();

  const runs = useMemo(() => getRuns().slice().reverse(), []);

  const dist = (km: number) => (distanceUnit === 'mi' ? km * 0.621371 : km);
  const paceDisplay = (paceKm: number) => (distanceUnit === 'mi' ? paceKm * 1.609344 : paceKm);

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

      {/* ── Empty state ── */}
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
            <p className="mt-1 text-[12px] font-semibold text-white/40">
              Your completed runs will appear here
            </p>
          </div>
          <button
            onClick={() => navigate('/run')}
            className="mt-1 h-13 rounded-full px-8 font-victory text-[14px] font-black tracking-[0.2em] text-black transition-all active:scale-[0.97]"
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
              return (
                <motion.button
                  key={run.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => setSelected(run)}
                  className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition-all active:scale-[0.98]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {/* Date column */}
                  <div className="flex min-w-[56px] flex-col gap-0.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">
                      {format(new Date(run.timestamp), 'MMM d')}
                    </span>
                    <span
                      className="text-[11px] font-black uppercase tracking-[0.1em]"
                      style={{ color: 'var(--accent)' }}
                    >
                      {format(new Date(run.timestamp), 'EEE')}
                    </span>
                    <span className="text-[10px] font-semibold text-white/25">
                      {format(new Date(run.timestamp), 'h:mm a')}
                    </span>
                  </div>

                  <div className="h-10 w-px shrink-0 bg-white/[0.07]" />

                  {/* Stats */}
                  <div className="flex flex-1 items-center justify-around">
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
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Detail overlay — exact finish-screen style ── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="fixed inset-0 z-50 overflow-hidden"
            style={{ background: '#0d0f14' }}
          >
            {/* Blurred route map */}
            <RunRouteBackground path={selected.path} />

            {/* Gradient overlay — matches finish screen */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(13,15,20,0.55) 0%, rgba(13,15,20,0.7) 40%, rgba(13,15,20,0.96) 70%, #0d0f14 85%)',
              }}
            />

            {/* Back button */}
            <div
              className="absolute left-0 right-0 top-0 flex items-center px-4"
              style={{ zIndex: 10, paddingTop: 'max(16px, env(safe-area-inset-top))' }}
            >
              <button
                onClick={() => setSelected(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 backdrop-blur-sm transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>

            {/* Stats content — identical layout to finish screen */}
            <div
              className="relative z-10 flex h-full flex-col items-center justify-end gap-6 px-6 text-center"
              style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}
            >
              {/* Date label */}
              <motion.p
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-[10px] font-black uppercase tracking-[0.32em]"
                style={{ color: 'var(--accent)' }}
              >
                {format(new Date(selected.timestamp), "EEEE, MMM d · h:mm a")}
              </motion.p>

              {/* Big distance */}
              <motion.div
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.18, type: 'spring', stiffness: 220, damping: 20 }}
                className="flex items-baseline gap-2"
              >
                <span className="font-victory text-[72px] font-black leading-none tabular-nums text-white">
                  {dist(selected.distance).toFixed(2)}
                </span>
                <span className="font-victory text-[28px] font-black text-white/40">{distanceUnit}</span>
              </motion.div>

              {/* Time + Pace */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex w-full items-start justify-around"
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Time</span>
                  <span className="font-victory text-[36px] font-black tabular-nums leading-none text-white">
                    {formatDuration(selected.duration)}
                  </span>
                </div>

                <div className="mt-2 h-12 w-px bg-white/10" />

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Avg Pace</span>
                  <span className="font-victory text-[36px] font-black tabular-nums leading-none text-white">
                    {selected.pace > 0 ? formatPace(paceDisplay(selected.pace)) : '--:--'}
                  </span>
                  <span className="text-[11px] font-bold text-white/30">/{distanceUnit}</span>
                </div>
              </motion.div>

              {/* Close */}
              <motion.button
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.44 }}
                onClick={() => setSelected(null)}
                className="h-14 w-full rounded-full font-victory text-[16px] font-black tracking-[0.2em] text-black transition-all active:scale-[0.97]"
                style={{ background: 'var(--accent)' }}
              >
                CLOSE
              </motion.button>

              <p className="text-[10px] font-semibold text-white/20">
                © {new Date().getFullYear()} Athlix · Map © OpenStreetMap &amp; CARTO
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
