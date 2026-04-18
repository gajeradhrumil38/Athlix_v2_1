import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Trash2, Clock, Dumbbell, BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useAnimation } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { ExerciseImage } from '../components/shared/ExerciseImage';
import { deleteWorkout, getWorkouts } from '../lib/supabaseData';
import { parseDateAtStartOfDay } from '../lib/dates';
import { useAuth as useAuthCtx } from '../contexts/AuthContext';
import { convertWeight, type WeightUnit } from '../lib/units';
import { muscleColor } from '../lib/muscleColors';

/* ── Volume helper (unit-aware) ──────────────────────────── */
const calcVolume = (exercises: any[], displayUnit: WeightUnit): number => {
  if (!exercises?.length) return 0;
  return exercises.reduce((total, ex) => {
    const w = convertWeight(
      Number(ex.weight || 0),
      (ex.unit || displayUnit) as WeightUnit,
      displayUnit,
      0.1,
    );
    return total + w * Number(ex.reps || 0) * Number(ex.sets || 0);
  }, 0);
};


/* ── Timeline card ───────────────────────────────────────── */
const TimelineItem: React.FC<{
  workout: any;
  isExpanded: boolean;
  setExpandedId: (id: string | null) => void;
  handleDelete: (id: string) => void;
  displayUnit: WeightUnit;
}> = ({ workout, isExpanded, setExpandedId, handleDelete, displayUnit }) => {
  const controls = useAnimation();
  const volume = calcVolume(workout.exercises, displayUnit);

  const bind = useDrag(
    ({ down, movement: [mx], direction: [xDir], velocity: [vx] }) => {
      if (isExpanded) return;
      const trigger = vx > 0.5 || mx < -100;
      if (!down && trigger && xDir < 0) {
        if (!window.confirm(`Delete "${workout.title}"? This cannot be undone.`)) {
          controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
          return;
        }
        controls
          .start({ x: -window.innerWidth, opacity: 0, transition: { duration: 0.2 } })
          .then(() => handleDelete(workout.id));
      } else if (!down) {
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
      } else if (mx < 0) {
        controls.set({ x: mx });
      }
    },
    { axis: 'x', filterTaps: true },
  );

  const parsedDate = parseDateAtStartOfDay(workout.date);
  const dateLabel = parsedDate ? format(parsedDate, 'EEE, MMM d · yyyy') : '--';
  const sortedExercises = [...(workout.exercises || [])].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe-to-delete bg */}
      <div className="absolute inset-0 flex items-center justify-end pr-6 bg-[var(--red)]/15 rounded-2xl">
        <Trash2 className="w-5 h-5 text-[var(--red)]" />
      </div>

      <motion.div
        {...bind()}
        animate={controls}
        className="relative z-10 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl touch-pan-y hover:border-[var(--border)]/60 transition-colors"
      >
        {/* Card header — click to expand */}
        <div
          className="p-4 cursor-pointer select-none"
          onClick={() => setExpandedId(isExpanded ? null : workout.id)}
        >
          <div className="flex items-start justify-between gap-3">
            {/* Left: date + title + stats */}
            <div className="min-w-0">
              <p className="text-[11px] text-[var(--text-muted)] mb-0.5">{dateLabel}</p>
              <h3 className="text-[16px] font-bold text-[var(--text-primary)] leading-tight truncate">
                {workout.title}
              </h3>
              <div className="flex items-center gap-3 mt-2 text-[12px] text-[var(--text-secondary)]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {workout.duration_minutes ?? 0} min
                </span>
                <span className="flex items-center gap-1">
                  <Dumbbell className="w-3 h-3" />
                  {sortedExercises.length} exercise{sortedExercises.length !== 1 ? 's' : ''}
                </span>
                {volume > 0 && (
                  <span className="flex items-center gap-1">
                    <BarChart2 className="w-3 h-3" />
                    {Number.isInteger(volume) ? volume.toLocaleString() : volume.toFixed(1)} {displayUnit}
                  </span>
                )}
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${workout.title}"?`)) handleDelete(workout.id);
                }}
                className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/10 transition-colors"
                aria-label="Delete workout"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)]">
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>
          </div>

          {/* Muscle group tags */}
          {Array.isArray(workout.muscle_groups) && workout.muscle_groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {workout.muscle_groups.map((mg: string) => (
                <span
                  key={mg}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    color: muscleColor(mg),
                    background: `color-mix(in srgb, ${muscleColor(mg)} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${muscleColor(mg)} 25%, transparent)`,
                  }}
                >
                  {mg}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-[var(--border)]">
            {workout.notes && (
              <p className="mt-3 text-[13px] text-[var(--text-secondary)] italic leading-relaxed">
                "{workout.notes}"
              </p>
            )}
            <div className="mt-3 space-y-2">
              {sortedExercises.map((ex: any) => {
                const w = convertWeight(
                  Number(ex.weight || 0),
                  (ex.unit || displayUnit) as WeightUnit,
                  displayUnit,
                  0.1,
                );
                return (
                  <div key={ex.id} className="flex items-center justify-between gap-3 py-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {ex.exercise_db_id && (
                        <ExerciseImage exerciseId={ex.exercise_db_id} exerciseName={ex.name} size="sm" />
                      )}
                      <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {ex.name}
                      </span>
                    </div>
                    <span className="text-[12px] text-[var(--text-secondary)] shrink-0 font-mono">
                      {ex.sets}×{ex.reps} @ {w}{displayUnit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

/* ── Page skeleton ───────────────────────────────────────── */
const Skeleton: React.FC = () => (
  <div className="space-y-3">
    {[80, 72, 88].map((h, i) => (
      <div key={i} className="skeleton rounded-2xl" style={{ height: h }} />
    ))}
  </div>
);

/* ── Empty state ─────────────────────────────────────────── */
const Empty: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
      <Dumbbell className="w-7 h-7 text-[var(--text-muted)]" />
    </div>
    <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">No workouts yet</h3>
    <p className="text-[13px] text-[var(--text-muted)] max-w-[220px]">
      Start a workout from the home screen — it'll appear here.
    </p>
  </div>
);

/* ── Main page ───────────────────────────────────────────── */
export const Timeline: React.FC = () => {
  const { user, profile } = useAuthCtx();
  const displayUnit = (profile?.unit_preference || 'kg') as WeightUnit;
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setWorkouts([]); setLoading(false); return; }
    setLoading(true);
    getWorkouts(user.id, { includeExercises: true })
      .then((data) => setWorkouts(data || []))
      .catch(() => toast.error('Failed to load timeline'))
      .finally(() => setLoading(false));
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteWorkout(user.id, id);
      toast.success('Workout deleted');
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
    } catch {
      toast.error('Failed to delete workout');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-10 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-[var(--text-primary)]">Timeline</h1>
        {workouts.length > 0 && (
          <span className="text-[13px] text-[var(--text-muted)]">
            {workouts.length} session{workouts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton />
      ) : workouts.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-3">
          {workouts.map((workout) => (
            <TimelineItem
              key={workout.id}
              workout={workout}
              isExpanded={expandedId === workout.id}
              setExpandedId={setExpandedId}
              handleDelete={handleDelete}
              displayUnit={displayUnit}
            />
          ))}
        </div>
      )}
    </div>
  );
};
