import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  LayoutGrid,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { deleteWorkout, getWorkouts } from '../lib/supabaseData';
import { convertWeight, type WeightUnit } from '../lib/units';

const MUSCLE_COLORS: Record<string, string> = {
  Chest: '#FF5A5F',
  Back: '#2F80FF',
  Legs: '#35D07F',
  Shoulders: '#FF9F1C',
  Arms: '#AF52DE',
  Biceps: '#8B5CF6',
  Triceps: '#C084FC',
  Core: '#FFCC00',
  Cardio: '#46C8FF',
  'Full Body': '#9AA4B2',
};

const MUSCLE_FILTERS = [
  'All',
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Cardio',
  'Full Body',
] as const;

type ViewMode = 'today' | 'week' | 'month';

const parseStoredDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value !== 'string') return null;

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(value);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
};

const getWorkoutExerciseCount = (workout: any) =>
  (() => {
    const fromRows = new Set((workout.exercises || []).map((exercise: any) => exercise.name).filter(Boolean)).size;
    if (fromRows > 0) return fromRows;
    // Fallback for legacy/corrupted entries saved before strict set validation.
    if (Array.isArray(workout.muscle_groups) && workout.muscle_groups.length > 0) return 1;
    if (Number(workout.duration_minutes || 0) > 0) return 1;
    return 0;
  })();

const getWorkoutVolume = (workout: any, targetUnit: WeightUnit = 'kg') =>
  (workout.exercises || []).reduce(
    (sum: number, exercise: any) =>
      sum +
      convertWeight(
        Number(exercise.weight || 0),
        (exercise.unit || targetUnit) as WeightUnit,
        targetUnit,
        0.1,
      ) *
        Number(exercise.reps || 0) *
        Number(exercise.sets || 0),
    0,
  );

const getWorkoutAccent = (workout: any) =>
  MUSCLE_COLORS[(workout.muscle_groups || [])[0]] || '#00D4FF';

const isGenericWorkoutTitle = (title?: string | null) => {
  if (!title) return true;
  const normalized = title.trim().toLowerCase();
  return (
    normalized === 'workout' ||
    normalized === 'morning workout' ||
    normalized === 'afternoon workout' ||
    normalized === 'evening workout'
  );
};

const getOrderedExerciseNames = (workout: any) =>
  Array.from(
    new Set((workout.exercises || []).map((exercise: any) => exercise.name).filter(Boolean)),
  );

const getWorkoutDisplayTitle = (workout: any) => {
  const exerciseNames = getOrderedExerciseNames(workout);

  if (exerciseNames.length > 0 && isGenericWorkoutTitle(workout.title)) {
    return exerciseNames[0];
  }

  return workout.title || exerciseNames[0] || 'Workout';
};

const workoutMatchesFilter = (workout: any, filter: string | null) => {
  if (!filter || filter === 'All') return true;
  const groups = Array.isArray(workout.muscle_groups) ? workout.muscle_groups : [];
  if (filter === 'Arms') return groups.includes('Arms') || groups.includes('Biceps') || groups.includes('Triceps');
  if (filter === 'Full Body') return groups.includes('Full Body') || groups.length >= 4;
  return groups.includes(filter);
};

const getDaySummary = (workouts: any[], targetUnit: WeightUnit = 'kg') => {
  const totalDuration = workouts.reduce((sum, workout) => sum + Number(workout.duration_minutes || 0), 0);
  const totalVolume = workouts.reduce((sum, workout) => sum + getWorkoutVolume(workout, targetUnit), 0);
  const exerciseCount = workouts.reduce((sum, workout) => sum + getWorkoutExerciseCount(workout), 0);

  return {
    totalDuration,
    totalVolume,
    exerciseCount,
    workoutCount: workouts.length,
  };
};

const getRangeLabel = (viewMode: ViewMode, currentDate: Date) => {
  if (viewMode === 'today') return format(currentDate, 'EEEE, MMM d');
  if (viewMode === 'week') {
    const start = startOfWeek(currentDate);
    const end = endOfWeek(currentDate);
    return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
  }
  return format(currentDate, 'MMMM yyyy');
};

const shiftDateByView = (date: Date, viewMode: ViewMode, direction: 1 | -1) => {
  if (viewMode === 'month') return direction > 0 ? addMonths(date, 1) : subMonths(date, 1);
  if (viewMode === 'week') return direction > 0 ? addWeeks(date, 1) : subWeeks(date, 1);
  return direction > 0 ? addDays(date, 1) : subDays(date, 1);
};

export const Calendar: React.FC = () => {
  const { user, profile } = useAuth();
  const displayUnit = profile?.unit_preference || 'kg';
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fetchWorkouts = async () => {
      setLoading(true);
      try {
        if (!user) {
          setWorkouts([]);
          return;
        }

        let start = currentDate;
        let end = currentDate;
        if (viewMode === 'month') {
          start = startOfWeek(startOfMonth(currentDate));
          end = endOfWeek(endOfMonth(currentDate));
        } else if (viewMode === 'week') {
          start = startOfWeek(currentDate);
          end = endOfWeek(currentDate);
        } else {
          start = currentDate;
          end = currentDate;
        }

        const data = await getWorkouts(user.id, {
          startDate: format(start, 'yyyy-MM-dd'),
          endDate: format(end, 'yyyy-MM-dd'),
          includeExercises: true,
        });

        setWorkouts(data || []);
      } catch (error) {
        console.error('Error fetching workouts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkouts();
  }, [currentDate, user, viewMode]);

  useEffect(() => {
    if (viewMode === 'today') {
      setSelectedDate(currentDate);
    }
  }, [currentDate, viewMode]);

  const days = useMemo(() => {
    if (viewMode === 'month') {
      return eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate)),
        end: endOfWeek(endOfMonth(currentDate)),
      });
    }
    if (viewMode === 'week') {
      return eachDayOfInterval({
        start: startOfWeek(currentDate),
        end: endOfWeek(currentDate),
      });
    }
    return [currentDate];
  }, [currentDate, viewMode]);

  const getWorkoutsForDay = (day: Date) =>
    workouts.filter(
      (workout) => {
        const parsed = parseStoredDate(workout.date);
        return parsed !== null && isSameDay(parsed, day) && workoutMatchesFilter(workout, activeFilter);
      },
    );

  const visibleWeekDays = useMemo(() => {
    if (viewMode !== 'week' || !activeFilter) return days;
    return days.filter((day) => getWorkoutsForDay(day).length > 0);
  }, [activeFilter, days, viewMode, workouts]);

  useEffect(() => {
    if (viewMode !== 'week' || !activeFilter || visibleWeekDays.length === 0) return;

    const hasVisibleSelection = visibleWeekDays.some((day) => isSameDay(day, selectedDate));
    if (!hasVisibleSelection) {
      setSelectedDate(visibleWeekDays[0]);
    }
  }, [activeFilter, selectedDate, viewMode, visibleWeekDays]);

  const selectedDayWorkouts = useMemo(() => getWorkoutsForDay(selectedDate), [selectedDate, workouts, activeFilter]);
  const selectedDaySummary = useMemo(
    () => getDaySummary(selectedDayWorkouts, displayUnit as WeightUnit),
    [selectedDayWorkouts, displayUnit],
  );
  const todayWorkouts = useMemo(() => getWorkoutsForDay(currentDate), [currentDate, workouts, activeFilter]);
  const todaySummary = useMemo(
    () => getDaySummary(todayWorkouts, displayUnit as WeightUnit),
    [todayWorkouts, displayUnit],
  );
  const today = new Date();
  const isCurrentRange = useMemo(() => {
    if (viewMode === 'today') return true;
    if (viewMode === 'week') return isSameWeek(currentDate, today);
    return isSameMonth(currentDate, today);
  }, [currentDate, today, viewMode]);

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'today') {
      const now = new Date();
      setViewMode('today');
      setCurrentDate(now);
      setSelectedDate(now);
      return;
    }
    setViewMode(mode);
    setCurrentDate(selectedDate);
  };

  const nextPeriod = () => {
    if (viewMode === 'today') return;
    setCurrentDate((prev) => shiftDateByView(prev, viewMode, 1));
    setSelectedDate((prev) => shiftDateByView(prev, viewMode, 1));
  };

  const prevPeriod = () => {
    if (viewMode === 'today') return;
    setCurrentDate((prev) => shiftDateByView(prev, viewMode, -1));
    setSelectedDate((prev) => shiftDateByView(prev, viewMode, -1));
  };

  const handleSelectDay = (day: Date) => {
    setSelectedDate(day);
    if (viewMode === 'today') {
      setCurrentDate(day);
    }
  };

  const handleTouchStart = (day: Date, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch') return;
    longPressTimer.current = setTimeout(() => {
      if (navigator.vibrate) {
        try {
          navigator.vibrate(45);
        } catch {
          // Ignore unsupported vibration behavior.
        }
      }
      navigate(`/log?date=${format(day, 'yyyy-MM-dd')}`);
    }, 480);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
  }, []);

  const handleDeleteWorkout = async (workoutId: string, workoutTitle: string) => {
    if (!user) return;
    const confirmed = window.confirm(`Delete "${workoutTitle}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await deleteWorkout(user.id, workoutId);
      setWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
      toast.success('Workout deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete workout');
    }
  };

  const renderWorkoutCard = (workout: any, compact = false) => {
    const volume = getWorkoutVolume(workout, displayUnit as WeightUnit);
    const exerciseCount = getWorkoutExerciseCount(workout);
    const accent = getWorkoutAccent(workout);
    const exerciseNames = getOrderedExerciseNames(workout);
    const fallbackTitle = getWorkoutDisplayTitle(workout);
    const primaryExercise = exerciseNames[0] || fallbackTitle;
    const secondaryExercises = exerciseNames.slice(1);
    const mainMuscle = (workout.muscle_groups || [])[0];
    const customSessionLabel =
      workout.title &&
      !isGenericWorkoutTitle(workout.title) &&
      workout.title.trim().toLowerCase() !== primaryExercise.trim().toLowerCase()
        ? workout.title
        : null;

    return (
      <div
        key={workout.id}
        className={`group relative overflow-hidden rounded-2xl border border-white/8 bg-[linear-gradient(180deg,#151F2D_0%,#111923_100%)] ${
          compact ? 'p-4' : 'p-5'
        }`}
      >
        <div
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: accent }}
        />
        <div className="ml-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                  {mainMuscle || 'Workout'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDeleteWorkout(workout.id, workout.title)}
                className="rounded-full p-2 text-red-400 transition-colors hover:bg-red-500/10"
                aria-label={`Delete ${workout.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <Link
                to="/timeline"
                className="rounded-full border border-[#00D4FF]/25 bg-[#00D4FF]/10 px-3 py-1.5 text-[11px] font-semibold text-[#72DFFF] transition-colors hover:bg-[#00D4FF]/15"
              >
                Details
              </Link>
            </div>
          </div>

          <div
            className="mt-1 rounded-[20px] border px-4 py-3"
            style={{
              borderColor: `${accent}2f`,
              background: `linear-gradient(180deg, ${accent}14 0%, rgba(255,255,255,0.02) 100%)`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.02), 0 12px 30px ${accent}10`,
            }}
          >
            <div className="min-w-0">
              <div className="min-w-0">
                <h4 className="truncate text-[22px] font-bold leading-tight text-white">{primaryExercise}</h4>
                {customSessionLabel && (
                  <div className="mt-1 text-[11px] font-medium text-[#9FB0C3]">{customSessionLabel}</div>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#A8B4C4]">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5 text-[#72DFFF]" />
                {workout.duration_minutes || 0} min
              </span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span>{exerciseCount} exercises</span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span>{volume.toLocaleString()} {displayUnit}</span>
            </div>
          </div>
        </div>

        {secondaryExercises.length > 0 && (
          <div className="ml-3 mt-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7E8DA0]">
              Also Logged
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {secondaryExercises.slice(0, 6).map((exerciseName) => (
                <span
                  key={exerciseName}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-[#D9E4EE]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white/65" />
                  {exerciseName}
                </span>
              ))}
              {secondaryExercises.length > 6 && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-[#B7C4D2]">
                  +{secondaryExercises.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}

        {Array.isArray(workout.muscle_groups) && workout.muscle_groups.length > 1 && (
          <div className="ml-3 mt-3 flex flex-wrap gap-2">
            {workout.muscle_groups.map((muscle: string) => (
              <span
                key={muscle}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-[#CFD8E3]"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: MUSCLE_COLORS[muscle] || '#00D4FF' }}
                />
                {muscle}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderDayCell = (day: Date, compact = false) => {
    const dayWorkouts = getWorkoutsForDay(day);
    const daySummary = getDaySummary(dayWorkouts, displayUnit as WeightUnit);
    const isToday = isSameDay(day, today);
    const isSelected = isSameDay(day, selectedDate);
    const isOutsideMonth = viewMode === 'month' && !isSameMonth(day, currentDate);

    if (compact) {
      const visibleMarkers = dayWorkouts.slice(0, 4);
      const extraWorkoutCount = Math.max(0, dayWorkouts.length - visibleMarkers.length);

      return (
        <button
          key={day.toISOString()}
          onClick={() => handleSelectDay(day)}
          onPointerDown={(event) => handleTouchStart(day, event)}
          onPointerUp={handleTouchEnd}
          onPointerLeave={handleTouchEnd}
          onPointerCancel={handleTouchEnd}
          className={`group relative min-h-[116px] min-w-0 overflow-hidden rounded-2xl border px-2 py-2 text-left transition-all ${
            isSelected
              ? 'border-[#00D4FF]/55 bg-[linear-gradient(180deg,rgba(18,37,50,0.98)_0%,rgba(15,24,35,1)_100%)] shadow-[0_0_0_1px_rgba(0,212,255,0.10)]'
              : 'border-white/6 bg-[linear-gradient(180deg,#181818_0%,#141414_100%)] hover:border-white/12 hover:bg-white/[0.03]'
          } ${isOutsideMonth ? 'opacity-40' : ''}`}
        >
          <div className="flex h-full flex-col items-center">
            <div className="flex-1 flex items-center justify-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-[16px] font-semibold ${
                  isToday
                    ? 'bg-[#00D4FF] text-black'
                    : isSelected
                      ? 'border border-[#00D4FF]/35 bg-[#00D4FF]/10 text-white'
                      : 'text-white'
                }`}
              >
                {format(day, 'd')}
              </div>
            </div>

            <div className="w-full pb-1">
              {dayWorkouts.length > 0 ? (
                <div className="flex items-end justify-center gap-1.5">
                    {visibleMarkers.map((workout) => (
                      <div
                        key={workout.id}
                        className="h-5 w-1 rounded-full"
                        style={{ backgroundColor: getWorkoutAccent(workout) }}
                      />
                    ))}
                    {extraWorkoutCount > 0 && (
                      <div className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-1 text-[9px] font-semibold text-[#C8D4E0]">
                        +{extraWorkoutCount}
                      </div>
                    )}
                </div>
              ) : (
                <div className="flex h-7 items-center justify-center rounded-lg border border-dashed border-white/8 bg-black/10 px-2 text-center text-[10px] font-medium text-[#647284]">
                  Rest
                </div>
              )}
            </div>
          </div>
        </button>
      );
    }

    return (
      <button
        key={day.toISOString()}
        onClick={() => handleSelectDay(day)}
        onPointerDown={(event) => handleTouchStart(day, event)}
        onPointerUp={handleTouchEnd}
        onPointerLeave={handleTouchEnd}
        onPointerCancel={handleTouchEnd}
        className={`group min-h-[132px] rounded-2xl border p-3 text-left transition-all ${
          isSelected
            ? 'border-[#00D4FF]/45 bg-[linear-gradient(180deg,rgba(18,37,50,0.96)_0%,rgba(16,25,35,1)_100%)] shadow-[0_0_0_1px_rgba(0,212,255,0.08)]'
            : 'border-white/6 bg-[linear-gradient(180deg,#181818_0%,#141414_100%)] hover:border-white/12 hover:bg-white/[0.03]'
        } ${isOutsideMonth ? 'opacity-45' : ''} ${compact ? 'min-h-[116px]' : ''}`}
      >
        <div className="flex h-full flex-col">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#788496]">
                {format(day, compact ? 'EEE' : 'EEEEEE')}
              </div>
              <div
                className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full text-[16px] font-semibold ${
                  isToday ? 'bg-[#00D4FF] text-black' : isSelected ? 'bg-white/8 text-white' : 'text-white'
                }`}
              >
                {format(day, 'd')}
              </div>
            </div>

            {dayWorkouts.length > 0 && (
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-bold text-[#D7E2EC]">
                {dayWorkouts.length} workout{dayWorkouts.length > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {dayWorkouts.length > 0 ? (
            <div className="mt-auto space-y-2">
              <div className="flex items-center gap-1.5">
                {dayWorkouts.slice(0, 4).map((workout) => (
                  <div
                    key={workout.id}
                    className="h-2 flex-1 rounded-full"
                    style={{ backgroundColor: getWorkoutAccent(workout) }}
                  />
                ))}
              </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-[#9EABBB]">
                  <div>
                    <div className="font-semibold text-white">{daySummary.totalDuration}m</div>
                    <div>Duration</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-white">{daySummary.exerciseCount}</div>
                    <div>Exercises</div>
                  </div>
                </div>
            </div>
          ) : (
            <div className="mt-auto rounded-xl border border-dashed border-white/8 bg-black/10 px-3 py-3 text-center text-[11px] text-[#647284]">
              {isToday ? 'Nothing logged yet' : 'Rest'}
            </div>
          )}
        </div>
      </button>
    );
  };

  const renderSelectedDayPanel = () => {
    const title = isSameDay(selectedDate, today) ? 'Today' : format(selectedDate, 'EEEE, MMMM d');

    return (
      <AnimatePresence mode="wait">
        <motion.section
          key={`${viewMode}-${format(selectedDate, 'yyyy-MM-dd')}-${activeFilter || 'all'}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="rounded-[24px] border border-white/6 bg-[linear-gradient(180deg,#171717_0%,#121212_100%)] p-5"
        >
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#00D4FF]/20 bg-[#00D4FF]/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#72DFFF]">
                <Sparkles className="h-3.5 w-3.5" />
                {title}
              </div>
              <h3 className="text-[22px] font-semibold text-white">
                {selectedDaySummary.workoutCount > 0
                  ? `${selectedDaySummary.workoutCount} workout${selectedDaySummary.workoutCount > 1 ? 's' : ''}`
                  : 'No workouts yet'}
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-2 md:min-w-[320px]">
              {[
                { label: 'Minutes', value: selectedDaySummary.totalDuration },
                { label: 'Exercises', value: selectedDaySummary.exerciseCount },
                { label: 'Volume', value: `${Math.round(selectedDaySummary.totalVolume).toLocaleString()} ${displayUnit}` },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#8090A3]">{item.label}</div>
                  <div className="mt-1 text-[15px] font-semibold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
              <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
            </div>
          ) : selectedDayWorkouts.length > 0 ? (
            <div className="space-y-3">{selectedDayWorkouts.map((workout) => renderWorkoutCard(workout, true))}</div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/8 bg-black/10 px-6 py-10 text-center">
              <Zap className="mx-auto mb-4 h-10 w-10 text-[#00D4FF]/55" />
              <div className="mb-2 text-[18px] font-semibold text-white">No workouts on this day</div>
              <div className="mb-5 text-[13px] text-[#95A3B4]">
                Start a session here and this day will fill in with volume, time, and muscle data.
              </div>
              <Link
                to={`/log?date=${format(selectedDate, 'yyyy-MM-dd')}`}
                className="inline-flex items-center justify-center rounded-full bg-[#00D4FF] px-5 py-2.5 text-[12px] font-bold text-black transition-colors hover:bg-[#27DCFF]"
              >
                Log a Workout
              </Link>
            </div>
          )}
        </motion.section>
      </AnimatePresence>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 md:pb-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7A8798]">Training Calendar</div>
            <h1 className="mt-1 text-3xl font-bold text-white">Calendar</h1>
          </div>

          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
            {!isCurrentRange && (
              <button
                onClick={handleToday}
                className="rounded-full border border-[#00D4FF]/22 bg-[#00D4FF]/10 px-4 py-2 text-[12px] font-semibold text-[#72DFFF] transition-colors hover:bg-[#00D4FF]/16"
              >
                Jump To Today
              </button>
            )}

            <div className="flex space-x-1 rounded-2xl border border-white/6 bg-[#171717] p-1">
              {[
                { id: 'today', icon: Zap, label: 'Today' },
                { id: 'week', icon: CalendarIcon, label: 'Week' },
                { id: 'month', icon: LayoutGrid, label: 'Month' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => handleViewModeChange(mode.id as ViewMode)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors md:flex-none ${
                    viewMode === mode.id
                      ? 'bg-[#00D4FF] text-black'
                      : 'text-[#A7B2C2] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <mode.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{mode.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {MUSCLE_FILTERS.map((muscle) => {
            const isAll = muscle === 'All';
            const active = isAll ? activeFilter === null : activeFilter === muscle;
            return (
              <button
                key={muscle}
                onClick={() => setActiveFilter(isAll ? null : activeFilter === muscle ? null : muscle)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-white/30 bg-white text-black'
                    : 'border-white/10 bg-transparent text-[#B2BDCB] hover:border-white/20 hover:text-white'
                }`}
              >
                {!isAll && (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: MUSCLE_COLORS[muscle] || '#00D4FF' }}
                  />
                )}
                <span>{muscle}</span>
              </button>
            );
          })}
        </div>
      </header>

      <section className="overflow-hidden rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,#171717_0%,#111111_100%)]">
        <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
          <button
            onClick={prevPeriod}
            disabled={viewMode === 'today'}
            className={`rounded-full p-2 transition-colors ${
              viewMode === 'today'
                ? 'opacity-0 pointer-events-none'
                : 'text-[#A8B4C4] hover:bg-white/5 hover:text-white'
            }`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7C889A]">
              {viewMode === 'today' ? 'Today' : viewMode}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-white">{getRangeLabel(viewMode, currentDate)}</h2>
          </div>
          <button
            onClick={nextPeriod}
            disabled={viewMode === 'today'}
            className={`rounded-full p-2 transition-colors ${
              viewMode === 'today'
                ? 'opacity-0 pointer-events-none'
                : 'text-[#A8B4C4] hover:bg-white/5 hover:text-white'
            }`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {viewMode === 'month' && (
          <div className="p-3">
            <div className="mb-2 grid grid-cols-7 gap-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div
                  key={day}
                  className="px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6F7D8E]"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {days.map((day) => renderDayCell(day, true))}
            </div>
          </div>
        )}

        {viewMode === 'week' && (
          <div className="p-3">
            {loading ? (
              <div className="space-y-3">
                <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
                <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
              </div>
            ) : visibleWeekDays.length > 0 ? (
              <div
                className={`grid grid-cols-1 gap-3 ${
                  activeFilter ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-7'
                }`}
              >
                {visibleWeekDays.map((day) => renderDayCell(day))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/8 bg-black/10 px-6 py-10 text-center">
                <Sparkles className="mx-auto mb-4 h-10 w-10 text-white/30" />
                <div className="mb-2 text-[18px] font-semibold text-white">No {activeFilter} sessions this week</div>
                <div className="text-[13px] text-[#95A3B4]">
                  Switch filters or log a {activeFilter?.toLowerCase()} workout to see matching days here.
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'today' && (
          <div className="p-5">
            {loading ? (
              <div className="space-y-3">
                <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
                <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
              </div>
            ) : todayWorkouts.length > 0 ? (
              <div className="space-y-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7C889A]">Today&apos;s Log</div>
                    <div className="mt-1 text-[18px] font-semibold text-white">
                      {todaySummary.workoutCount} workout{todaySummary.workoutCount > 1 ? 's' : ''} logged
                    </div>
                  </div>
                  <Link
                    to={`/log?date=${format(currentDate, 'yyyy-MM-dd')}`}
                    className="rounded-full border border-[#00D4FF]/25 bg-[#00D4FF]/10 px-4 py-2 text-[11px] font-semibold text-[#72DFFF] transition-colors hover:bg-[#00D4FF]/15"
                  >
                    Log More
                  </Link>
                </div>
                {todayWorkouts.map((workout) => renderWorkoutCard(workout))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/8 bg-black/10 px-6 py-12 text-center">
                <Dumbbell className="mx-auto mb-4 h-12 w-12 text-[#647284]" />
                <div className="mb-2 text-[18px] font-semibold text-white">Nothing logged today</div>
                <div className="mb-5 text-[13px] text-[#95A3B4]">
                  This view is locked to today, so you can quickly check today&apos;s session the same way you do on Home.
                </div>
                <Link
                  to={`/log?date=${format(currentDate, 'yyyy-MM-dd')}`}
                  className="inline-flex items-center justify-center rounded-full bg-[#00D4FF] px-5 py-2.5 text-[12px] font-bold text-black transition-colors hover:bg-[#27DCFF]"
                >
                  Log Today&apos;s Workout
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {(viewMode === 'month' || (viewMode === 'week' && visibleWeekDays.length > 0)) && renderSelectedDayPanel()}
    </div>
  );
};
