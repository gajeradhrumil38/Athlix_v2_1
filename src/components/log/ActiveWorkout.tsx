import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ChevronLeft, ChevronRight, Pause, Play, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { WorkoutState, ExerciseEntry, Set } from '../../legacy-pages/Log';
import { ExerciseTabBar } from './ExerciseTabBar';
import { ExerciseContent } from './ExerciseContent';
import { RestTimer } from './RestTimer';
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

interface ActiveWorkoutProps {
  workout: WorkoutState;
  setWorkout: React.Dispatch<React.SetStateAction<WorkoutState | null>>;
  onFinish: () => void;
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

const formatClockTime = (value?: string) => {
  const date = parseLocalDateTime(value);
  if (!date) return '--:--';
  const hour = date.getHours();
  const displayHour = hour % 12 || 12;
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${displayHour}:${pad2(date.getMinutes())} ${period}`;
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
  allowLiveAddExercise = true,
  openExercisePickerOnStart = false,
  weightUnit = 'kg',
  distanceUnit = 'km',
  onWeightUnitChange,
  onDistanceUnitChange,
}) => {
  const { user } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [activeRestTimer, setActiveRestTimer] = useState<{ duration: number; exerciseName: string } | null>(null);
  const [dialPicker, setDialPicker] = useState<DialPickerState | null>(null);
  const [hiddenPrefillExerciseIds, setHiddenPrefillExerciseIds] = useState<string[]>([]);
  const [showExerciseSummary, setShowExerciseSummary] = useState(false);
  const autoOpenedPickerForStartRef = useRef<number | null>(null);

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
    if (workout.exercises.length > 0) return;
    if (autoOpenedPickerForStartRef.current === workout.startTime) return;

    autoOpenedPickerForStartRef.current = workout.startTime;
    setShowExercisePicker(true);
  }, [openExercisePickerOnStart, workout.exercises.length, workout.startTime]);

  useEffect(() => {
    if (workout.exercises.length > 0 && activeIndex > workout.exercises.length - 1) {
      setActiveIndex(workout.exercises.length - 1);
    }
  }, [activeIndex, workout.exercises.length]);

  const currentExercise = workout.exercises[activeIndex];
  const hasExercises = workout.exercises.length > 0;

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
        toast.error('Add valid values before completing this set.');
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
        setActiveRestTimer({ duration: 90, exerciseName: exercise.name });

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
      const existingIndex = workout.exercises.findIndex(
        (entry) => entry.name.toLowerCase() === exerciseOption.name.toLowerCase(),
      );

      if (existingIndex !== -1) {
        setActiveIndex(existingIndex);
        setShowExercisePicker(false);
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

      setActiveIndex(workout.exercises.length);
      setShowExercisePicker(false);
      haptics.tick();
    },
    [setWorkout, user, workout.exercises],
  );

  const handleDeleteExercise = () => {
    if (!currentExercise) return;
    if (!window.confirm(`Remove ${currentExercise.name}?`)) return;

    setWorkout((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.filter((_, index) => index !== activeIndex),
      };
    });

    setActiveIndex((prev) => Math.max(0, prev - 1));
    haptics.tick();
  };

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

  const handleDialConfirm = (value: number) => {
    if (!dialPicker) return;
    updateSetField(dialPicker.setId, dialPicker.field, value);
    setDialPicker(null);
  };

  const currentSummary = useMemo(() => {
    if (!currentExercise) return null;
    const totalVolume = currentExercise.sets
      .filter((set) => set.done)
      .reduce((sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0), 0);

    const doneSets = currentExercise.sets.filter((set) => set.done).length;
    const vsLast = totalVolume - Number(currentExercise.lastSession?.totalVolume || 0);

    return {
      totalVolume,
      doneSets,
      totalSets: currentExercise.sets.length,
      vsLast,
    };
  }, [currentExercise]);

  const showPrefillBanner =
    Boolean(currentExercise?.lastSession) && !hiddenPrefillExerciseIds.includes(currentExercise?.id || '');

  return (
    <div className="fixed inset-0 z-40 bg-[#0D1117] flex flex-col overflow-hidden">
      <div className="h-[68px] shrink-0 border-b border-[#1E2F42] bg-[#0D1117] px-4 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-black uppercase tracking-wide text-[#E2E8F0]">{workout.title}</h1>
          <p className="text-[11px] text-[#8FA6BD]">{workout.exercises.length} exercise{workout.exercises.length === 1 ? '' : 's'}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused((prev) => !prev)}
            className="h-9 w-9 rounded-full border border-white/20 bg-white/5 text-[#9FDFF0] flex items-center justify-center"
          >
            {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              haptics.complete();
              onFinish();
            }}
            className="h-9 rounded-full bg-[#00D4FF] px-4 text-[12px] font-black text-black"
          >
            Finish
          </button>
        </div>
      </div>

      <ExerciseTabBar
        exercises={workout.exercises}
        activeIndex={activeIndex}
        onTabClick={setActiveIndex}
        onAddExercise={() => setShowExercisePicker(true)}
        showAddButton={allowLiveAddExercise}
      />

      <AnimatePresence mode="wait" initial={false}>
        {currentExercise ? (
          <motion.div
            key={currentExercise.id}
            className="flex-1 min-h-0"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <ExerciseContent
              exercise={currentExercise}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
              elapsedLabel={formatElapsedTime(workout.elapsedSeconds)}
              startedAtLabel={formatClockTime(workout.startAt)}
              onWeightUnitChange={(unit) => onWeightUnitChange?.(unit)}
              onDistanceUnitChange={(unit) => onDistanceUnitChange?.(unit)}
              onUpdateSet={updateSetField}
              onMarkSetDone={handleMarkSetDone}
              onAddSet={handleAddSet}
              onClearPrefill={handleClearPrefill}
              showPrefillBanner={showPrefillBanner}
              onOpenDial={handleOpenDial}
              onSwipeLeft={() => activeIndex < workout.exercises.length - 1 && setActiveIndex(activeIndex + 1)}
              onSwipeRight={() => activeIndex > 0 && setActiveIndex(activeIndex - 1)}
              onFinishExercise={() => {
                haptics.success();
                setShowExerciseSummary(true);
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="empty-workout"
            className="flex-1 flex flex-col items-center justify-center p-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <Activity className="w-12 h-12 text-[#1E2F42] mb-4" />
            <h3 className="text-[16px] font-black text-[#8892A4] mb-2">No exercises yet</h3>
            <p className="text-[12px] text-[#3A5060] mb-6">Add your first exercise to start tracking.</p>
            <button
              onClick={() => setShowExercisePicker(true)}
              className="h-11 px-8 bg-[#141C28] border border-[#1E2F42] text-[#00D4FF] text-[12px] font-black rounded-xl"
            >
              + Add Exercise
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-[52px] shrink-0 bg-[#0D1117]/95 border-t border-[#1E2F42] px-4 flex items-center justify-between">
        <button
          onClick={handleDeleteExercise}
          className="p-2 text-[#3A5060] hover:text-[#EF4444] transition-colors"
          disabled={!currentExercise}
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => hasExercises && activeIndex > 0 && setActiveIndex(activeIndex - 1)}
            disabled={!hasExercises || activeIndex === 0}
            className={`p-2 ${!hasExercises || activeIndex === 0 ? 'text-[#1E2F42]' : 'text-[#A7B7C8]'}`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-[11px] text-[#6F8499] font-bold tabular-nums">
            {hasExercises ? activeIndex + 1 : 0} / {workout.exercises.length}
          </span>
          <button
            onClick={() => hasExercises && activeIndex < workout.exercises.length - 1 && setActiveIndex(activeIndex + 1)}
            disabled={!hasExercises || activeIndex >= workout.exercises.length - 1}
            className={`p-2 ${
              !hasExercises || activeIndex >= workout.exercises.length - 1 ? 'text-[#1E2F42]' : 'text-[#A7B7C8]'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="w-8" />
      </div>

      <AnimatePresence>
        {activeRestTimer && (
          <RestTimer
            duration={activeRestTimer.duration}
            exerciseName={activeRestTimer.exerciseName}
            onComplete={() => setActiveRestTimer(null)}
            onSkip={() => setActiveRestTimer(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showExercisePicker && (
          <ExercisePicker
            onSelect={(exercise) => {
              void handleAddExercise(exercise);
            }}
            onClose={() => setShowExercisePicker(false)}
            recentExercises={[]}
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
        {showExerciseSummary && currentExercise && currentSummary && (
          <motion.div
            className="fixed inset-0 z-[210] bg-black/65 backdrop-blur-[2px] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[22px] border-t border-white/10 bg-[#0F1724] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
            >
              <h3 className="text-[24px] font-black text-white">Great work! 💪</h3>
              <p className="text-[#9EB4C8] mt-1">{currentExercise.name} summary</p>

              <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 text-[15px]">
                <div className="flex justify-between text-[#C9DAEA]">
                  <span>Total volume</span>
                  <span className="font-black text-white">
                    {currentSummary.totalVolume.toLocaleString()} {weightUnit}
                  </span>
                </div>
                <div className="flex justify-between text-[#C9DAEA]">
                  <span>Sets completed</span>
                  <span className="font-black text-white">
                    {currentSummary.doneSets}/{currentSummary.totalSets}
                  </span>
                </div>
                <div className="flex justify-between text-[#C9DAEA]">
                  <span>vs Last session</span>
                  <span className={`font-black ${currentSummary.vsLast >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {currentSummary.vsLast >= 0 ? '+' : ''}
                    {currentSummary.vsLast.toLocaleString()} {weightUnit}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowExerciseSummary(false);
                  if (activeIndex < workout.exercises.length - 1) {
                    setActiveIndex(activeIndex + 1);
                  }
                }}
                className="mt-5 w-full h-[52px] rounded-xl bg-[#00D4FF] text-black font-black"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
