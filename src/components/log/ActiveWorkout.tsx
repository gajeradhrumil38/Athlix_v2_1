import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Pause, Play, Plus, Trash2, Weight } from 'lucide-react';
import toast from 'react-hot-toast';
import type { WorkoutState, ExerciseEntry, Set } from '../../legacy-pages/Log';
import { ExerciseContent } from './ExerciseContent';
import { ExercisePicker } from './ExercisePicker';
import { DialPicker } from './DialPicker';
import { useAuth } from '../../contexts/AuthContext';
import { getLastExerciseSession } from '../../lib/supabaseData';
import {
  DistanceUnit,
  DialFieldKind,
  ExerciseInputType,
  WeightUnit,
  getDefaultSetValues,
  getFieldKinds,
  getInputLabels,
  isSetReadyForCompletion,
  resolveExerciseInputType,
} from '../../lib/exerciseTypes';
import { haptics } from '../../lib/haptics';
import { convertWeight } from '../../lib/units';

interface ActiveWorkoutProps {
  workout: WorkoutState;
  setWorkout: React.Dispatch<React.SetStateAction<WorkoutState | null>>;
  onFinish: () => void;
  onBackToPrevious?: () => void;
  bodyWeight?: number | null;
  bodyWeightUnit?: WeightUnit;
  allowLiveAddExercise?: boolean;
  openExercisePickerOnStart?: boolean;
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  onWeightUnitChange?: (unit: WeightUnit) => void;
  onDistanceUnitChange?: (unit: DistanceUnit) => void;
}

interface DialPickerState {
  setId: string;
  field: 'weight' | 'reps';
  fieldKind: DialFieldKind;
  inputType: ExerciseInputType;
  title: string;
  currentValue: number;
}

const pad2 = (value: number) => value.toString().padStart(2, '0');

const parseLocalDateTime = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};


const toLocalDateTimeInput = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(
    date.getMinutes(),
  )}`;

const formatElapsedTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(secs)}`;
  return `${pad2(minutes)}:${pad2(secs)}`;
};

const formatDateInputValue = (value?: string) => {
  const date = parseLocalDateTime(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const parseDateInputValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const next = new Date(year, month - 1, day);
  if (Number.isNaN(next.getTime())) return null;
  return next;
};

const getFieldBinding = (type: ExerciseInputType) => {
  switch (type) {
    case 'reps_only':
      return { primary: 'reps' as const, secondary: null };
    case 'distance_only':
      return { primary: 'weight' as const, secondary: null };
    default:
      return { primary: 'weight' as const, secondary: 'reps' as const };
  }
};

export const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({
  workout,
  setWorkout,
  onFinish,
  onBackToPrevious,
  bodyWeight,
  bodyWeightUnit = 'kg',
  allowLiveAddExercise = true,
  openExercisePickerOnStart = false,
  weightUnit = 'kg',
  distanceUnit = 'km',
  onWeightUnitChange,
  onDistanceUnitChange,
}) => {
  const { user } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [isPaused, setIsPaused] = useState(true);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [dialPicker, setDialPicker] = useState<DialPickerState | null>(null);
  const [hiddenPrefillExerciseIds, setHiddenPrefillExerciseIds] = useState<string[]>([]);
  const autoOpenedPickerForStartRef = useRef<number | null>(null);
  const addExerciseInFlightRef = useRef(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const createSetId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  useEffect(() => {
    if (isPaused) return;

    const interval = window.setInterval(() => {
      setWorkout((prev) => {
        if (!prev) return null;
        const nextElapsedSeconds = prev.elapsedSeconds + 1;
        const startDate = parseLocalDateTime(prev.startAt) || new Date(prev.startTime);
        const nextEndDate = new Date(startDate.getTime() + nextElapsedSeconds * 1000);
        return {
          ...prev,
          elapsedSeconds: nextElapsedSeconds,
          endAt: toLocalDateTimeInput(nextEndDate),
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isPaused, setWorkout]);

  useEffect(() => {
    if (!openExercisePickerOnStart) return;
    if (autoOpenedPickerForStartRef.current === workout.startTime) return;

    autoOpenedPickerForStartRef.current = workout.startTime;
    setShowExercisePicker(true);
  }, [openExercisePickerOnStart, workout.startTime]);

  useEffect(() => {
    if (workout.exercises.length > 0 && activeIndex > workout.exercises.length - 1) {
      setActiveIndex(workout.exercises.length - 1);
    }
  }, [activeIndex, workout.exercises.length]);

  const currentExercise = workout.exercises[activeIndex];

  const updateSetField = useCallback(
    (setId: string, field: 'weight' | 'reps', value: number) => {
      setWorkout((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          exercises: prev.exercises.map((exercise) => ({
            ...exercise,
            sets: exercise.sets.map((set) => (set.id === setId ? { ...set, [field]: value } : set)),
          })),
        };
      });
    },
    [setWorkout],
  );

  const handleOpenDial = useCallback(
    (setId: string, field: 'weight' | 'reps') => {
      const exercise = workout.exercises[activeIndex];
      if (!exercise) return;
      const set = exercise.sets.find((entry) => entry.id === setId);
      if (!set) return;

      const inputType = resolveExerciseInputType(exercise.name);
      const binding = getFieldBinding(inputType);
      const kinds = getFieldKinds(inputType);
      const labels = getInputLabels(inputType, { weightUnit, distanceUnit });

      const fieldKind = field === binding.primary ? kinds.primary : kinds.secondary;
      if (!fieldKind) return;

      const title = `Select ${field === binding.primary ? labels.primary : labels.secondary || 'Value'}`;
      const currentValue = Number(set[field] || 0);

      setDialPicker({
        setId,
        field,
        fieldKind,
        inputType,
        title,
        currentValue,
      });
    },
    [activeIndex, distanceUnit, weightUnit, workout.exercises],
  );

  const handleMarkSetDone = useCallback(
    (setId: string) => {
      const exercise = workout.exercises[activeIndex];
      if (!exercise) return;
      const set = exercise.sets.find((entry) => entry.id === setId);
      if (!set) return;

      const nextDone = !set.done;
      const inputType = resolveExerciseInputType(exercise.name);

      if (nextDone && !isSetReadyForCompletion(inputType, { weight: set.weight, reps: set.reps })) {
        haptics.error();
        toast.error('Add values before marking this set complete.');
        return;
      }

      setWorkout((prev) => {
        if (!prev) return null;

        return {
          ...prev,
          exercises: prev.exercises.map((entry, index) => {
            if (index !== activeIndex) return entry;
            return {
              ...entry,
              sets: entry.sets.map((row) => (row.id === setId ? { ...row, done: nextDone } : row)),
            };
          }),
        };
      });

      if (nextDone) {
        haptics.success();
        const doneCount = exercise.sets.filter((entry) => entry.done || entry.id === setId).length;
        if (doneCount === exercise.sets.length) {
          haptics.complete();
        }
      } else {
        haptics.tick();
      }
    },
    [activeIndex, setWorkout, workout.exercises],
  );

  const handleAddSet = useCallback(() => {
    setWorkout((prev) => {
      if (!prev) return null;

      const activeExercise = prev.exercises[activeIndex];
      if (!activeExercise) return prev;

      if (activeExercise.sets.length >= 20) {
        haptics.error();
        toast.error('Maximum 20 sets per exercise.');
        return prev;
      }

      const previousSet = activeExercise.sets[activeExercise.sets.length - 1];
      const nextSet: Set = {
        id: createSetId(),
        weight: previousSet?.weight ?? 0,
        reps: previousSet?.reps ?? 0,
        done: false,
      };

      const nextExercises = prev.exercises.map((exercise, index) =>
        index === activeIndex
          ? {
              ...exercise,
              sets: [...exercise.sets, nextSet],
            }
          : exercise,
      );

      haptics.tick();
      return { ...prev, exercises: nextExercises };
    });
  }, [activeIndex, setWorkout]);

  const handleAddExercise = useCallback(
    async (exerciseOption: any) => {
      if (addExerciseInFlightRef.current) return;
      addExerciseInFlightRef.current = true;

      try {
        const normalizedName = String(exerciseOption.name || '').trim().toLowerCase();
        const existingIndex = workout.exercises.findIndex(
          (entry) => entry.name.trim().toLowerCase() === normalizedName,
        );

        if (existingIndex !== -1) {
          setActiveIndex(existingIndex);
          setViewMode('detail');
          haptics.tick();
          return;
        }

        let summary = exerciseOption.lastSession;
        if (!summary && user) {
          try {
            const response = await getLastExerciseSession(user.id, exerciseOption.name);
            summary = response?.lastSession;
          } catch {
            // ignore lookup failure and continue with defaults
          }
        }

        const inputType = resolveExerciseInputType(exerciseOption.name);
        const defaults = getDefaultSetValues(inputType);
        const totalSets = Math.max(1, Math.min(20, Number(summary?.sets || 1)));
        const seedWeight = Number(summary?.weight ?? defaults.weight);
        const seedReps = Number(summary?.reps ?? defaults.reps);

        const nextExercise: ExerciseEntry = {
          id: createSetId(),
          name: exerciseOption.name,
          muscleGroup: exerciseOption.muscleGroup,
          exercise_db_id: exerciseOption.exercise_db_id,
          sets: Array.from({ length: totalSets }, () => ({
            id: createSetId(),
            weight: seedWeight,
            reps: seedReps,
            done: false,
          })),
          lastSession: summary
            ? {
                date: summary.date,
                sets: summary.sets,
                reps: summary.reps,
                weight: summary.weight,
                totalVolume: summary.totalVolume,
              }
            : undefined,
        };

        const nextIndex = workout.exercises.length;
        setWorkout((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            exercises: [...prev.exercises, nextExercise],
          };
        });

        if (summary) {
          setHiddenPrefillExerciseIds((prev) => prev.filter((entry) => entry !== nextExercise.id));
        }

        setActiveIndex(nextIndex);
        setViewMode('detail');
        haptics.tick();
      } finally {
        setShowExercisePicker(false);
        addExerciseInFlightRef.current = false;
      }
    },
    [setWorkout, user, workout.exercises],
  );

  useEffect(() => {
    if (showExercisePicker) return;
    addExerciseInFlightRef.current = false;
  }, [showExercisePicker]);

  const handleClearPrefill = () => {
    const exercise = workout.exercises[activeIndex];
    if (!exercise) return;

    const defaults = getDefaultSetValues(resolveExerciseInputType(exercise.name));
    setWorkout((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map((entry, index) =>
          index === activeIndex
            ? {
                ...entry,
                sets: entry.sets.map((set) => ({
                  ...set,
                  weight: defaults.weight,
                  reps: defaults.reps,
                  done: false,
                })),
              }
            : entry,
        ),
      };
    });

    setHiddenPrefillExerciseIds((prev) => [...new Set([...prev, exercise.id])]);
    haptics.tick();
  };

  const handleToggleOptionalWeight = useCallback((index: number) => {
    setWorkout((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map((ex, i) =>
          i === index ? { ...ex, optionalWeight: !ex.optionalWeight } : ex
        ),
      };
    });
    haptics.tick();
  }, [setWorkout]);

  const handleRemoveExercise = useCallback((index: number) => {
    setWorkout((prev) => {
      if (!prev) return null;
      const next = prev.exercises.filter((_, i) => i !== index);
      return { ...prev, exercises: next };
    });
    // If we removed the current detail-view exercise, go back to list
    setActiveIndex((prev) => Math.min(prev, Math.max(0, workout.exercises.length - 2)));
    setViewMode('list');
    haptics.tick();
  }, [setWorkout, workout.exercises.length]);

  const handleDialConfirm = (value: number) => {
    if (!dialPicker) return;
    updateSetField(dialPicker.setId, dialPicker.field, value);
    setDialPicker(null);
  };

  const showPrefillBanner =
    Boolean(currentExercise?.lastSession) && !hiddenPrefillExerciseIds.includes(currentExercise?.id || '');

  const workoutDateValue = useMemo(() => formatDateInputValue(workout.startAt), [workout.startAt]);

  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }, []);

  const fmtWorkoutDate = useCallback((dateStr: string): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = parseDateInputValue(dateStr);
    if (!d) return dateStr;
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }, []);

  const totalDone = useMemo(
    () => workout.exercises.reduce((acc, ex) => acc + ex.sets.filter((s) => s.done).length, 0),
    [workout.exercises],
  );
  const totalSets = useMemo(
    () => workout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0),
    [workout.exercises],
  );
  const isPastDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = parseDateInputValue(workoutDateValue);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  }, [workoutDateValue]);

  const handleWorkoutDateChange = useCallback(
    (nextDate: string) => {
      const parsedDate = parseDateInputValue(nextDate);
      if (!parsedDate) return;

      // Reset timer when logging for a different date
      setIsPaused(true);
      setWorkout((prev) => {
        if (!prev) return null;
        const existingStart = parseLocalDateTime(prev.startAt) || new Date(prev.startTime);
        const nextStart = new Date(
          parsedDate.getFullYear(),
          parsedDate.getMonth(),
          parsedDate.getDate(),
          existingStart.getHours(),
          existingStart.getMinutes(),
          existingStart.getSeconds(),
          0,
        );
        return {
          ...prev,
          startTime: nextStart.getTime(),
          startAt: toLocalDateTimeInput(nextStart),
          endAt: toLocalDateTimeInput(nextStart),
          elapsedSeconds: 0,
        };
      });
      haptics.tick();
    },
    [setWorkout],
  );

  const bodyWeightForMath = useMemo(() => {
    if (!bodyWeight || !Number.isFinite(bodyWeight) || bodyWeight <= 0) return null;
    return convertWeight(bodyWeight, bodyWeightUnit, weightUnit, 0.1);
  }, [bodyWeight, bodyWeightUnit, weightUnit]);

  const handleBackToPrevious = useCallback(() => {
    if (onBackToPrevious) {
      onBackToPrevious();
      return;
    }

    if (typeof window === 'undefined') return;

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.hash = '#/';
  }, [onBackToPrevious]);

  return (
    <div className="fixed inset-0 z-40 bg-[var(--bg-base)] overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[920px] flex-col">

        {/* ── Nav Bar ──────────────────────────────────────────────── */}
        <div className="shrink-0 flex h-14 items-center gap-3 px-4 border-b border-white/5 bg-[var(--bg-base)]/80 backdrop-blur-xl">
          <button
            type="button"
            onClick={viewMode === 'detail' ? () => setViewMode('list') : handleBackToPrevious}
            className="inline-flex shrink-0 h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[12px] font-medium text-[var(--text-secondary)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {viewMode === 'detail' ? 'All' : 'Back'}
          </button>

          <div className="flex-1 min-w-0 text-center">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-none">{workout.title}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-none">
              {workout.exercises.length} exercise{workout.exercises.length === 1 ? '' : 's'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCalendar(true)}
            className="inline-flex shrink-0 h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-[var(--bg-surface)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] cursor-pointer"
          >
            <CalendarDays className="w-3 h-3 text-[var(--text-muted)]" />
            <span>{fmtWorkoutDate(workoutDateValue)}</span>
          </button>
        </div>

        {/* ── Timer Bar (visible when exercises exist) ──────────────── */}
        {workout.exercises.length > 0 && (
          <div className="shrink-0 flex items-center gap-3 px-4 border-b border-white/5" style={{ height: 48 }}>
            <span className="font-victory text-[20px] font-bold text-[var(--text-primary)] tabular-nums" style={{ letterSpacing: 1 }}>
              {formatElapsedTime(workout.elapsedSeconds)}
            </span>
            {/* Play/Pause — lime when running, surface when stopped */}
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="flex w-7 h-7 items-center justify-center rounded-lg border-none transition-colors"
              style={{ background: 'var(--accent)', flexShrink: 0 }}
            >
              {isPaused
                ? <Play className="w-3 h-3 fill-black text-black" style={{ marginLeft: 1 }} />
                : <Pause className="w-3 h-3 fill-black text-black" />}
            </button>
            <div className="w-px h-5 bg-white/10" />
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">
              {totalDone}/{totalSets} sets done
            </span>
            {isPastDate && (
              <span className="ml-auto inline-flex h-[18px] items-center rounded px-1.5 border border-[rgba(200,255,0,0.2)] bg-[rgba(200,255,0,0.06)] text-[9px] font-semibold tracking-[0.1em] text-[var(--accent)]">
                PAST
              </span>
            )}
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────────── */}
        {viewMode === 'list' ? (
          workout.exercises.length === 0 ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="w-14 h-14 rounded-xl border border-white/10 bg-[var(--bg-surface)] flex items-center justify-center">
                <Activity className="w-6 h-6 text-[var(--text-muted)]" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-1.5">No exercises yet</p>
                <p className="text-[13px] text-[var(--text-muted)]">Add your first exercise to start tracking.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExercisePicker(true)}
                className="flex h-12 items-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-[14px] font-bold text-black"
              >
                <Plus className="w-4 h-4" />
                Add Exercise
              </button>
            </div>
          ) : (
            /* Exercise list */
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="flex flex-col gap-2 p-4">
                {workout.exercises.map((ex, i) => {
                  const doneCount = ex.sets.filter((s) => s.done).length;
                  return (
                    <div key={ex.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setActiveIndex(i); setViewMode('detail'); }}
                        className="flex flex-1 items-center gap-3 p-3 rounded-xl border text-left transition-colors min-w-0"
                        style={{ background: 'var(--bg-surface)', borderColor: 'rgba(255,255,255,0.07)' }}
                      >
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border border-white/10 bg-white/[0.03]">
                          <Activity className="w-4 h-4 text-[var(--text-muted)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-none mb-1">{ex.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.08em]">
                            {ex.muscleGroup || 'Exercise'} · {ex.sets.length} set{ex.sets.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        {doneCount > 0 && (
                          <span
                            className="inline-flex h-5 items-center px-1.5 rounded border text-[10px] font-semibold shrink-0"
                            style={{ background: 'rgba(200,255,0,0.1)', borderColor: 'rgba(200,255,0,0.2)', color: 'var(--accent)' }}
                          >
                            {doneCount}/{ex.sets.length}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveExercise(i)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0 transition-colors"
                        style={{ color: 'rgba(248,113,113,0.5)' }}
                        aria-label={`Remove ${ex.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          /* Exercise detail view */
          <AnimatePresence mode="wait" initial={false}>
            {currentExercise ? (
              <motion.div
                key={currentExercise.id}
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                {/* Exercise name header */}
                <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="text-[11px] font-semibold uppercase mb-1"
                      style={{ letterSpacing: '0.18em', color: '#5DCAA5' }}
                    >
                      {currentExercise.muscleGroup || 'Exercise'}
                    </p>
                    <p className="text-[26px] font-bold text-[var(--text-primary)] leading-[1.1] truncate">
                      {currentExercise.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-1">
                    {/* Weight toggle: only shown for reps-only exercises */}
                    {resolveExerciseInputType(currentExercise.name) === 'reps_only' && (
                      <button
                        type="button"
                        onClick={() => handleToggleOptionalWeight(activeIndex)}
                        className="flex h-8 items-center gap-1.5 px-2.5 rounded-lg shrink-0 transition-colors text-[10px] font-bold uppercase tracking-wide"
                        style={{
                          background: currentExercise.optionalWeight ? 'rgba(200,255,0,0.12)' : 'var(--bg-elevated)',
                          color: currentExercise.optionalWeight ? 'var(--accent)' : 'var(--text-muted)',
                          border: `1px solid ${currentExercise.optionalWeight ? 'rgba(200,255,0,0.3)' : 'var(--border)'}`,
                        }}
                        aria-label="Toggle weight tracking"
                      >
                        <Weight className="w-3 h-3" />
                        {currentExercise.optionalWeight ? 'Weighted' : '+ Weight'}
                      </button>
                    )}
                    {/* Delete button — red-tinted box matching design */}
                    <button
                      type="button"
                      onClick={() => handleRemoveExercise(activeIndex)}
                      className="flex h-[34px] w-[34px] items-center justify-center rounded-lg shrink-0 transition-colors"
                      style={{
                        background: 'rgba(248,113,113,0.12)',
                        border: '1px solid rgba(248,113,113,0.25)',
                        color: '#f87171',
                      }}
                      aria-label="Remove exercise"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <ExerciseContent
                  exercise={currentExercise}
                  optionalWeight={currentExercise.optionalWeight}
                  weightUnit={weightUnit}
                  distanceUnit={distanceUnit}
                  bodyWeightForMath={bodyWeightForMath}
                  onWeightUnitChange={(unit) => onWeightUnitChange?.(unit)}
                  onDistanceUnitChange={(unit) => onDistanceUnitChange?.(unit)}
                  onUpdateSet={updateSetField}
                  onMarkSetDone={handleMarkSetDone}
                  onAddSet={handleAddSet}
                  onClearPrefill={handleClearPrefill}
                  showPrefillBanner={showPrefillBanner}
                  onOpenDial={handleOpenDial}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        )}

        {/* ── Bottom Bar ───────────────────────────────────────────── */}
        <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-white/5 bg-[var(--bg-base)]/80 backdrop-blur-xl pb-[max(12px,env(safe-area-inset-bottom))]">
          {allowLiveAddExercise && (
            <button
              type="button"
              onClick={() => setShowExercisePicker(true)}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[var(--bg-surface)] text-[13px] font-semibold text-[var(--text-primary)]"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
              Add Exercise
            </button>
          )}
          <button
            type="button"
            onClick={() => { haptics.complete(); onFinish(); }}
            className={`flex h-12 items-center justify-center rounded-xl bg-[var(--accent)] text-[14px] font-bold text-black ${allowLiveAddExercise ? 'flex-[2]' : 'flex-1'}`}
          >
            Finish Workout
          </button>
        </div>

      </div>

      <AnimatePresence>
        {showExercisePicker && (
          <ExercisePicker
            onSelect={(exercise) => { void handleAddExercise(exercise); }}
            onClose={() => setShowExercisePicker(false)}
            recentExercises={[]}
            onLoadTemplate={(exercises) => {
              exercises.forEach((ex) => { void handleAddExercise(ex); });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dialPicker && (
          <DialPicker
            title={dialPicker.title}
            fieldKind={dialPicker.fieldKind}
            inputType={dialPicker.inputType}
            initialValue={dialPicker.currentValue}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
            onClose={() => setDialPicker(null)}
            onConfirm={handleDialConfirm}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCalendar && (
          <CalendarPicker
            value={workoutDateValue}
            maxDate={todayDateStr}
            onSelect={handleWorkoutDateChange}
            onClose={() => setShowCalendar(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ── CalendarPicker ────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['M','T','W','T','F','S','S'];

const CalendarPicker: React.FC<{
  value: string;
  maxDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}> = ({ value, maxDate, onSelect, onClose }) => {
  const parsedSelected = parseDateInputValue(value);
  const parsedMax = parseDateInputValue(maxDate);

  const [viewYear, setViewYear] = useState(() => parsedSelected?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsedSelected?.getMonth() ?? new Date().getMonth());

  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isSelected = (d: number) =>
    parsedSelected?.getFullYear() === viewYear &&
    parsedSelected?.getMonth() === viewMonth &&
    parsedSelected?.getDate() === d;

  const isToday = (d: number) => todayY === viewYear && todayM === viewMonth && todayD === d;

  const isDisabled = (d: number) => {
    if (!parsedMax) return false;
    const cell = new Date(viewYear, viewMonth, d);
    cell.setHours(0, 0, 0, 0);
    const max = new Date(parsedMax);
    max.setHours(0, 0, 0, 0);
    return cell > max;
  };

  const canGoNext = !(viewYear === todayY && viewMonth === todayM);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const handleSelect = (d: number) => {
    if (isDisabled(d)) return;
    onSelect(`${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`);
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="relative w-full max-w-sm rounded-2xl p-5 mb-[max(16px,env(safe-area-inset-bottom))]"
        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-5">
          <button
            type="button"
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[14px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={!canGoNext}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
            style={{
              background: canGoNext ? 'var(--bg-elevated)' : 'transparent',
              color: canGoNext ? 'var(--text-secondary)' : 'var(--text-muted)',
              opacity: canGoNext ? 1 : 0.3,
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day-of-week labels */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((label, i) => (
            <div key={i} className="text-center text-[11px] font-semibold py-1.5" style={{ color: 'var(--text-muted)' }}>
              {label}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="h-9" />;
            const selected = isSelected(day);
            const todayCell = isToday(day);
            const disabled = isDisabled(day);
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(day)}
                disabled={disabled}
                className="relative flex items-center justify-center h-9 w-9 mx-auto rounded-xl text-[13px] transition-colors"
                style={{
                  background: selected ? 'var(--accent)' : 'transparent',
                  color: selected ? '#000' : disabled ? 'var(--text-muted)' : 'var(--text-primary)',
                  opacity: disabled ? 0.3 : 1,
                  fontWeight: selected || todayCell ? 700 : 500,
                }}
              >
                {day}
                {todayCell && !selected && (
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
};
