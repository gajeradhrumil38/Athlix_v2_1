import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Pause, Play, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { WorkoutState, ExerciseEntry, Set } from '../../legacy-pages/Log';
import { ExerciseTabBar } from './ExerciseTabBar';
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
  const [isPaused, setIsPaused] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
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
    const doneSets = currentExercise.sets.filter((set) => set.done).length;
    return {
      doneSets,
      totalSets: currentExercise.sets.length,
    };
  }, [currentExercise]);

  const showPrefillBanner =
    Boolean(currentExercise?.lastSession) && !hiddenPrefillExerciseIds.includes(currentExercise?.id || '');

  const workoutDateValue = useMemo(() => formatDateInputValue(workout.startAt), [workout.startAt]);

  const handleWorkoutDateChange = useCallback(
    (nextDate: string) => {
      const parsedDate = parseDateInputValue(nextDate);
      if (!parsedDate) return;

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
        const nextEnd = new Date(nextStart.getTime() + prev.elapsedSeconds * 1000);

        return {
          ...prev,
          startTime: nextStart.getTime(),
          startAt: toLocalDateTimeInput(nextStart),
          endAt: toLocalDateTimeInput(nextEnd),
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
    <div className="fixed inset-0 z-40 bg-[#0B1019] overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[920px] flex-col bg-[radial-gradient(circle_at_top,rgba(31,45,66,0.28)_0%,rgba(11,16,25,0.96)_40%,#0B1019_100%)]">
      <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-white/5 bg-[#0B1019]/74 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackToPrevious}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[12px] font-medium text-[#D2DEEA]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <h1 className="text-[15px] font-semibold tracking-wide text-[#E2E8F0]">{workout.title}</h1>
            <p className="text-[11px] text-[#8FA6BD]">
              {workout.exercises.length} exercise{workout.exercises.length === 1 ? '' : 's'}
            </p>
            <label className="mt-1 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-[#9FB4C8]">
              <CalendarDays className="h-3.5 w-3.5" />
              <input
                type="date"
                value={workoutDateValue}
                onChange={(event) => handleWorkoutDateChange(event.target.value)}
                className="bg-transparent text-[#C7D6E4] outline-none"
                aria-label="Workout date"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#C4D0DC]"
          >
            {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              haptics.complete();
              onFinish();
            }}
            className="h-9 rounded-full bg-[#CAD7E4] px-4 text-[12px] font-semibold text-[#0F1A27]"
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
            className="flex-1 min-h-0 overflow-hidden"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <ExerciseContent
              exercise={currentExercise}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
              bodyWeightForMath={bodyWeightForMath}
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
            <h3 className="text-[16px] font-semibold text-[#B6C2CF] mb-2">No exercises yet</h3>
            <p className="text-[12px] text-[#7B8FA5] mb-6">Add your first exercise to start tracking.</p>
            <button
              onClick={() => setShowExercisePicker(true)}
              className="h-11 rounded-xl border border-white/15 bg-white/[0.04] px-8 text-[12px] font-semibold text-[#E3ECF5]"
            >
              + Add Exercise
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-h-[56px] shrink-0 items-center justify-between border-t border-white/5 bg-[#0B1019]/78 px-4 py-1 pb-[max(0px,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <button
          onClick={handleDeleteExercise}
          className="p-2 text-[#5F738A] hover:text-[#D8E1EB] transition-colors"
          disabled={!currentExercise}
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => hasExercises && activeIndex > 0 && setActiveIndex(activeIndex - 1)}
            disabled={!hasExercises || activeIndex === 0}
            className={`p-2 ${!hasExercises || activeIndex === 0 ? 'text-[#2A3545]' : 'text-[#A7B7C8]'}`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-[11px] text-[#7F92A8] font-semibold tabular-nums">
            {hasExercises ? activeIndex + 1 : 0} / {workout.exercises.length}
          </span>
          <button
            onClick={() => hasExercises && activeIndex < workout.exercises.length - 1 && setActiveIndex(activeIndex + 1)}
            disabled={!hasExercises || activeIndex >= workout.exercises.length - 1}
            className={`p-2 ${
              !hasExercises || activeIndex >= workout.exercises.length - 1 ? 'text-[#2A3545]' : 'text-[#A7B7C8]'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="w-8" />
      </div>
      </div>

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
            className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-[2px] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[20px] border-t border-white/10 bg-[#121A28] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
            >
              <h3 className="text-[20px] font-semibold text-white">Exercise completed</h3>
              <p className="text-[#AABBCB] mt-1 text-[14px]">
                {currentSummary.doneSets}/{currentSummary.totalSets} sets finished.
              </p>

              <button
                onClick={() => {
                  setShowExerciseSummary(false);
                  if (activeIndex < workout.exercises.length - 1) {
                    setActiveIndex(activeIndex + 1);
                  }
                }}
                className="mt-5 w-full h-[48px] rounded-xl bg-[#DDE6F0] text-[#111827] font-semibold"
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
