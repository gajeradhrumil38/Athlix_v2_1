import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { saveWorkout } from '../lib/supabaseData';
import { QuickStartSheet } from '../components/log/QuickStartSheet';
import { ActiveWorkout } from '../components/log/ActiveWorkout';
import { FinishSheet } from '../components/log/FinishSheet';

export interface Set {
  id: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
  isPR?: boolean;
}

export interface ExerciseEntry {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  sets: Set[];
  lastSession?: {
    date: string;
    sets: number;
    reps: number;
    weight: number;
    totalVolume?: number;
  };
}

export interface WorkoutState {
  id?: string;
  title: string;
  startTime: number;
  startAt: string;
  endAt: string;
  elapsedSeconds: number;
  exercises: ExerciseEntry[];
  notes: string;
}

const DRAFT_KEY = 'athlix_active_workout';
const DRAFT_TTL = 8 * 60 * 60 * 1000;

const pad2 = (value: number) => value.toString().padStart(2, '0');

const toLocalDateTimeInput = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const parseDateTimeInput = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const parseDateParam = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const readDraft = (): WorkoutState | null => {
  try {
    const rawDraft = sessionStorage.getItem(DRAFT_KEY);
    if (!rawDraft) return null;

    const parsed = JSON.parse(rawDraft) as WorkoutState;
    if (
      !parsed ||
      typeof parsed.startTime !== 'number' ||
      !Number.isFinite(parsed.startTime) ||
      !Array.isArray(parsed.exercises)
    ) {
      sessionStorage.removeItem(DRAFT_KEY);
      return null;
    }
    const age = Date.now() - parsed.startTime;

    if (age >= DRAFT_TTL) {
      sessionStorage.removeItem(DRAFT_KEY);
      return null;
    }

    const baseStartDate = new Date(parsed.startTime || Date.now());
    const startAt = parsed.startAt || toLocalDateTimeInput(baseStartDate);
    const endAt =
      parsed.endAt ||
      toLocalDateTimeInput(new Date(baseStartDate.getTime() + (parsed.elapsedSeconds || 0) * 1000));
    const startDate = parseDateTimeInput(startAt) || baseStartDate;
    const endDate = parseDateTimeInput(endAt) || startDate;
    const elapsedSeconds = Math.max(
      0,
      Math.round((endDate.getTime() - startDate.getTime()) / 1000),
      parsed.elapsedSeconds || 0,
    );

    return {
      ...parsed,
      startAt,
      endAt,
      elapsedSeconds,
    };
  } catch {
    sessionStorage.removeItem(DRAFT_KEY);
    return null;
  }
};

const writeDraft = (draft: WorkoutState) => {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage failures and let the workout continue in memory.
  }
};

const clearDraft = () => {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore storage failures during cleanup.
  }
};

export const Log: React.FC = () => {
  const { user, profile } = useAuth();
  const weightUnit = (profile?.unit_preference || 'kg') as 'kg' | 'lbs';
  const location = useLocation();
  const allowLiveAddExercise = Boolean(profile?.start_workout_enabled);
  const showStartSheet = Boolean(profile?.show_start_sheet);
  const searchParams = new URLSearchParams(location.search);
  const forceAddExercise = searchParams.get('add') === '1';
  const forcedWorkoutDate = searchParams.get('date');

  const [workout, setWorkout] = useState<WorkoutState | null>(null);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [openPickerOnStart, setOpenPickerOnStart] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [saving, setSaving] = useState(false);

  const createWorkoutState = useCallback((initialExercises: ExerciseEntry[] = [], title?: string, dateOverride?: string | null): WorkoutState => {
    const now = new Date();
    const forcedDate = parseDateParam(dateOverride);
    const baseDate = forcedDate
      ? new Date(
          forcedDate.getFullYear(),
          forcedDate.getMonth(),
          forcedDate.getDate(),
          now.getHours(),
          now.getMinutes(),
          0,
          0,
        )
      : now;
    const localNow = toLocalDateTimeInput(baseDate);
    return {
      title: title || (now.getHours() < 12 ? 'Morning Workout' : 'Evening Workout'),
      startTime: baseDate.getTime(),
      startAt: localNow,
      endAt: localNow,
      elapsedSeconds: 0,
      exercises: initialExercises,
      notes: ''
    };
  }, []);

  // Initialize flow: resume draft -> + shortcut opens picker -> optional start sheet -> direct start
  useEffect(() => {
    if (workout) return;

    const draft = readDraft();
    if (draft) {
      setWorkout(draft);
      setShowQuickStart(false);
      setOpenPickerOnStart(false);
      return;
    }

    if (forceAddExercise) {
      const initialState = createWorkoutState([], undefined, forcedWorkoutDate);
      setWorkout(initialState);
      setShowQuickStart(false);
      setOpenPickerOnStart(true);
      writeDraft(initialState);
      return;
    }

    if (showStartSheet) {
      setShowQuickStart(true);
      setOpenPickerOnStart(false);
      return;
    }

    const initialState = createWorkoutState([], undefined, forcedWorkoutDate);
    setWorkout(initialState);
    setShowQuickStart(false);
    setOpenPickerOnStart(false);
    writeDraft(initialState);
  }, [showStartSheet, workout, createWorkoutState, forceAddExercise, forcedWorkoutDate]);

  // Auto-save draft every 30s
  useEffect(() => {
    if (!workout) return;
    const interval = setInterval(() => {
      writeDraft(workout);
    }, 30000);
    return () => clearInterval(interval);
  }, [workout]);

  const startWorkout = useCallback((initialExercises: ExerciseEntry[] = [], title?: string) => {
    const newState = createWorkoutState(initialExercises, title, forcedWorkoutDate);
    setWorkout(newState);
    setShowQuickStart(false);
    setOpenPickerOnStart(false);
    writeDraft(newState);
  }, [createWorkoutState, forcedWorkoutDate]);

  const handleFinish = () => {
    setShowFinish(true);
  };

  const handleSave = async (title: string, notes: string) => {
    if (!workout || !user) return;

    const completedExercises = workout.exercises
      .map((exercise, exerciseIndex) => {
        const completedSets = exercise.sets.filter(
          (set) => set.done && Number(set.reps || 0) > 0,
        );
        return { exercise, completedSets, exerciseIndex };
      })
      .filter(({ completedSets }) => completedSets.length > 0);

    if (completedExercises.length === 0) {
      toast.error('Complete at least one set with reps greater than 0 before saving.');
      return;
    }

    const finalWorkout = { ...workout, title, notes };
    const startDate = parseDateTimeInput(finalWorkout.startAt) || new Date(finalWorkout.startTime);
    const endDate = parseDateTimeInput(finalWorkout.endAt) || new Date(startDate.getTime() + finalWorkout.elapsedSeconds * 1000);
    const elapsedFromTime = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
    const finalElapsedSeconds = elapsedFromTime > 0 ? elapsedFromTime : finalWorkout.elapsedSeconds;

    setSaving(true);

    try {
      await saveWorkout(user.id, {
        title,
        date: formatLocalDate(startDate),
        duration_minutes: Math.max(1, Math.round(finalElapsedSeconds / 60)),
        notes: notes || null,
        exercises: completedExercises.map(({ exercise, completedSets, exerciseIndex }) => ({
          name: exercise.name,
          muscle_group: exercise.muscleGroup,
          exercise_db_id: exercise.exercise_db_id || null,
          order_index: exerciseIndex,
          completed_sets: completedSets.map((set) => ({
            reps: Number(set.reps || 0),
            weight: Number(set.weight || 0),
            unit: weightUnit,
          })),
        })),
      });

      clearDraft();
      const nextWorkout = createWorkoutState([], undefined, forcedWorkoutDate);
      setShowFinish(false);
      setShowQuickStart(false);
      setOpenPickerOnStart(true);
      setWorkout(nextWorkout);
      writeDraft(nextWorkout);
      toast('Workout added', {
        duration: 1600,
        icon: '',
        style: {
          background: '#141C28',
          color: '#E2E8F0',
          border: '1px solid #1E2F42',
          fontSize: '12px',
          padding: '8px 12px',
        },
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to save workout.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#E2E8F0]">
      <AnimatePresence>
        {showQuickStart && (
          <QuickStartSheet 
            onStartEmpty={() => startWorkout()}
            onStartTemplate={(exercises, title) => startWorkout(exercises, title)}
          />
        )}
      </AnimatePresence>

      {workout && !showQuickStart && (
        <ActiveWorkout 
          workout={workout}
          setWorkout={setWorkout}
          onFinish={handleFinish}
          allowLiveAddExercise={allowLiveAddExercise}
          openExercisePickerOnStart={openPickerOnStart}
          weightUnit={weightUnit}
        />
      )}

      <AnimatePresence>
        {showFinish && workout && (
          <FinishSheet 
            workout={workout}
            weightUnit={weightUnit}
            onConfirm={handleSave}
            onCancel={() => setShowFinish(false)}
            saving={saving}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
