import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Trophy, ArrowRight, Flame, Zap, AlertTriangle, Scale, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, isSameDay, isSameWeek, isSameMonth, addWeeks, subWeeks, subDays, addDays, addMonths, subMonths, isAfter, startOfDay } from 'date-fns';
import { MuscleMap, MuscleData } from '../components/home/MuscleMap';
import { WeeklyRing } from '../components/home/WeeklyRing';
import { ThreeRingHero } from '../components/home/ThreeRingHero';
import { useNavigate } from 'react-router-dom';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { getBodyWeightLogs, getPersonalRecords, getWorkouts } from '../lib/supabaseData';
import { parseDateAtStartOfDay } from '../lib/dates';
import { getExerciseMuscleProfile, getMuscleSlugLabel, PRIMARY_LOAD_WEIGHT, SECONDARY_LOAD_WEIGHT } from '../lib/exerciseMuscles';
import { convertWeight, type WeightUnit } from '../lib/units';

// --- Utility Functions ---
const calculateStreak = (workouts: { date: string }[]) => {
  if (!workouts || workouts.length === 0) return 0;
  
  const getDayTimestamp = (value: string) => parseDateAtStartOfDay(value)?.getTime() ?? 0;
  const uniqueDates = Array.from(new Set(workouts.map((w) => w.date))).sort(
    (a, b) => getDayTimestamp(b) - getDayTimestamp(a),
  );
  
  let streak = 0;
  let currentDate = startOfDay(new Date());
  
  // Check if they worked out today
  const latestWorkoutDate = uniqueDates.length > 0 ? parseDateAtStartOfDay(uniqueDates[0]) : null;
  if (latestWorkoutDate && isSameDay(latestWorkoutDate, currentDate)) {
    streak = 1;
    currentDate = subDays(currentDate, 1);
    uniqueDates.shift();
  } else if (latestWorkoutDate && isSameDay(latestWorkoutDate, subDays(currentDate, 1))) {
    // Or yesterday
    currentDate = subDays(currentDate, 1);
  } else {
    return 0; // No workout today or yesterday, streak broken
  }

  for (const dateStr of uniqueDates) {
    const date = parseDateAtStartOfDay(dateStr);
    if (!date) continue;
    if (isSameDay(date, currentDate)) {
      streak++;
      currentDate = subDays(currentDate, 1);
    } else {
      break;
    }
  }
  return streak;
};

const CountUp = ({ value, duration = 600, decimals = 0 }: { value: number, duration?: number, decimals?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const start = 0;
    const end = value;
    if (start === end) return;

    let startTime: number | null = null;
    let frameId = 0;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(progress * (end - start) + start);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };
    frameId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [value, duration]);

  return <>{count.toFixed(decimals)}</>;
};

// --- Main Component ---
export const Home: React.FC = () => {
  const { user, profile } = useAuth();
  const displayUnit = profile?.unit_preference || 'kg';
  const navigate = useNavigate();
  const { visibleWidgets, loading: layoutLoading } = useDashboardLayout();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'Day' | 'Week' | 'Month'>('Day');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<any[]>([]);
  const [rangeWorkouts, setRangeWorkouts] = useState<any[]>([]);
  const [todaysWorkout, setTodaysWorkout] = useState<any | null>(null);
  const [prs, setPrs] = useState<any[]>([]);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const [currentPrIndex, setCurrentPrIndex] = useState(0);
  const targetWeightUnit = displayUnit as WeightUnit;

  const toDisplayExerciseWeight = useCallback((exercise: any) => {
    return convertWeight(
      Number(exercise.weight || 0),
      (exercise.unit || targetWeightUnit) as WeightUnit,
      targetWeightUnit,
      0.1,
    );
  }, [targetWeightUnit]);

  const bodyWeightKg = useMemo(() => {
    if (!profile?.body_weight) return null;
    return profile.body_weight_unit === 'lbs'
      ? Number(profile.body_weight) * 0.45359237
      : Number(profile.body_weight);
  }, [profile?.body_weight, profile?.body_weight_unit]);

  useEffect(() => {
    if (prs.length > 1) {
      const interval = setInterval(() => {
        setCurrentPrIndex(prev => (prev + 1) % prs.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [prs.length]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      let rangeStart = currentDate;
      let rangeEnd = currentDate;
      if (viewMode === 'Week') {
        rangeStart = weekStart;
        rangeEnd = weekEnd;
      } else if (viewMode === 'Month') {
        rangeStart = startOfMonth(currentDate);
        rangeEnd = endOfMonth(currentDate);
      }
      const rangeStartStr = format(rangeStart, 'yyyy-MM-dd');
      const rangeEndStr = format(rangeEnd, 'yyyy-MM-dd');

      const [workoutsRes, allWorkoutsRes, prsRes, weightRes, rangeWorkoutsRes, todaysWorkoutRes] = await Promise.all([
        getWorkouts(user.id, {
          startDate: weekStartStr,
          endDate: weekEndStr,
          includeExercises: true,
        }),
        getWorkouts(user.id),
        getPersonalRecords(user.id, {
          startDate: weekStartStr,
          endDate: weekEndStr,
        }),
        getBodyWeightLogs(user.id),
        getWorkouts(user.id, {
          startDate: rangeStartStr,
          endDate: rangeEndStr,
          includeExercises: true,
        }),
        getWorkouts(user.id, {
          startDate: todayStr,
          endDate: todayStr,
          includeExercises: true,
          limit: 1,
        }),
      ]);

      setWorkouts(workoutsRes || []);
      setAllWorkouts(allWorkoutsRes || []);
      setPrs(prsRes || []);
      setRangeWorkouts(rangeWorkoutsRes || []);
      setTodaysWorkout((todaysWorkoutRes && todaysWorkoutRes[0]) || null);
      setWeightLogs(
        (weightRes || []).filter((log) => log.date >= format(subDays(new Date(), 30), 'yyyy-MM-dd')).reverse(),
      );
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, currentDate, viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Computed Data ---
  const streak = useMemo(() => calculateStreak(allWorkouts), [allWorkouts]);
  
  const totalVolume = useMemo(() => {
    return workouts.reduce((total, w) => {
      return total + (Array.isArray(w.exercises) ? w.exercises.reduce((sum: number, ex: any) => sum + (toDisplayExerciseWeight(ex) * (ex.reps || 0) * (ex.sets || 0)), 0) : 0);
    }, 0);
  }, [workouts, toDisplayExerciseWeight]);

  const muscleData = useMemo(() => {
    const data: MuscleData = {};
    workouts.forEach((workout) => {
      const workoutGroups = new Set<string>();
      (workout.exercises || []).forEach((ex: any) => {
        const profile = getExerciseMuscleProfile(ex.name, ex.muscle_group);
        const exerciseLoad = (toDisplayExerciseWeight(ex) * Number(ex.reps || 0) * Number(ex.sets || 0)) || 0;
        profile.primary.forEach((region) => {
          if (!data[region]) data[region] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
          data[region].sets += (Number(ex.sets || 0) || 0) * PRIMARY_LOAD_WEIGHT;
          data[region].load += exerciseLoad * PRIMARY_LOAD_WEIGHT;
          if (bodyWeightKg && bodyWeightKg > 0) {
            data[region].relativeLoad += (exerciseLoad * PRIMARY_LOAD_WEIGHT) / bodyWeightKg;
          }
          workoutGroups.add(region);
        });
        profile.secondary.forEach((region) => {
          if (!data[region]) data[region] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
          data[region].sets += (Number(ex.sets || 0) || 0) * SECONDARY_LOAD_WEIGHT;
          data[region].load += exerciseLoad * SECONDARY_LOAD_WEIGHT;
          if (bodyWeightKg && bodyWeightKg > 0) {
            data[region].relativeLoad += (exerciseLoad * SECONDARY_LOAD_WEIGHT) / bodyWeightKg;
          }
          workoutGroups.add(region);
        });
      });
      workoutGroups.forEach((region) => {
        if (!data[region]) data[region] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
        data[region].sessions += 1;
      });
    });

    return data;
  }, [workouts, bodyWeightKg, toDisplayExerciseWeight]);

  const trainedMuscleGroups = Object.keys(muscleData);

  const muscleMapData = useMemo(() => {
    const data: MuscleData = {};
    rangeWorkouts.forEach((workout) => {
      const workoutGroups = new Set<string>();
      (workout.exercises || []).forEach((ex: any) => {
        const sets = Number(ex.sets || 0) || 0;
        const exerciseLoad = (toDisplayExerciseWeight(ex) * Number(ex.reps || 0) * Number(ex.sets || 0)) || 0;
        const profile = getExerciseMuscleProfile(ex.name, ex.muscle_group);
        profile.targets.forEach(({ slug, weight }) => {
          if (!data[slug]) data[slug] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
          data[slug].sets += sets * weight;
          data[slug].load += exerciseLoad * weight;
          if (bodyWeightKg && bodyWeightKg > 0) {
            data[slug].relativeLoad += (exerciseLoad * weight) / bodyWeightKg;
          }
          workoutGroups.add(slug);
        });
      });

      workoutGroups.forEach((slug) => {
        if (!data[slug]) data[slug] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
        data[slug].sessions += 1;
      });
    });
    return data;
  }, [rangeWorkouts, bodyWeightKg, toDisplayExerciseWeight]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(start, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const isToday = isSameDay(date, new Date());
      const isFuture = isAfter(date, new Date()) && !isToday;
      const workout = workouts.find(w => w.date === dateStr);
      
      let status: 'trained' | 'rest' | 'future' | 'today-trained' | 'today-rest' = 'future';
      if (isToday) {
        status = workout ? 'today-trained' : 'today-rest';
      } else if (!isFuture) {
        status = workout ? 'trained' : 'rest';
      }

      return {
        date,
        dateStr,
        label: format(date, 'EEEEE'), // M, T, W...
        dayName: format(date, 'EEE'), // Mon, Tue...
        dayNum: format(date, 'd'),
        status,
        workout
      };
    });
  }, [currentDate, workouts]);

  const trainedDaysCount = weekDays.filter(d => d.status === 'trained' || d.status === 'today-trained').length;

  const rangeTitle = useMemo(() => {
    if (viewMode === 'Day') {
      return isSameDay(currentDate, new Date()) ? 'Today' : format(currentDate, 'MMM d');
    }
    if (viewMode === 'Week') {
      return `Week ${format(currentDate, 'w')}`;
    }
    return format(currentDate, 'MMMM');
  }, [viewMode, currentDate]);

  const rangeExercises = useMemo(() => {
    return rangeWorkouts.flatMap((workout) => workout.exercises || []);
  }, [rangeWorkouts]);

  const dayExerciseStats = useMemo(() => {
    if (viewMode !== 'Day') return [];
    const byName = new Map<string, { name: string; volume: number; sets: number }>();
    rangeExercises.forEach((ex: any) => {
      const volume = (toDisplayExerciseWeight(ex) * Number(ex.reps || 0) * Number(ex.sets || 0));
      const prev = byName.get(ex.name) || { name: ex.name, volume: 0, sets: 0 };
      byName.set(ex.name, {
        name: ex.name,
        volume: prev.volume + volume,
        sets: prev.sets + (Number(ex.sets || 0) || 0),
      });
    });
    return Array.from(byName.values()).sort((a, b) => b.volume - a.volume);
  }, [rangeExercises, viewMode, toDisplayExerciseWeight]);

  const muscleLoadStats = useMemo(() => {
    if (viewMode === 'Day') return [];
    return (Object.entries(muscleMapData) as Array<[string, MuscleData[string]]>)
      .map(([slug, data]) => ({
        name: getMuscleSlugLabel(slug),
        volume: data.load,
      }))
      .sort((a, b) => b.volume - a.volume);
  }, [muscleMapData, viewMode]);

  const muscleMapTitle = useMemo(() => {
    if (viewMode === 'Day') {
      return isSameDay(currentDate, new Date()) ? "Today's Muscles" : `${format(currentDate, 'MMM d')} Muscles`;
    }
    if (viewMode === 'Week') {
      return `Week ${format(currentDate, 'w')} Muscles`;
    }
    return `${format(currentDate, 'MMMM')} Muscles`;
  }, [viewMode, currentDate]);

  const isCurrentRange = useMemo(() => {
    const now = new Date();
    if (viewMode === 'Day') return isSameDay(currentDate, now);
    if (viewMode === 'Week') return isSameWeek(currentDate, now, { weekStartsOn: 1 });
    return isSameMonth(currentDate, now);
  }, [viewMode, currentDate]);

  // Dynamic Ring Calculations
  const volumeScore = Math.min((totalVolume / 15000) * 100, 100); // Example: 15k is 100%
  const recoveryScore = Math.max(100 - (trainedDaysCount * 15), 10); // Example
  const strainScore = Math.min((trainedDaysCount / 5) * 100, 100); // Example: 5 days is 100%

  // --- Alert Logic ---
  const alert = useMemo(() => {
    if (strainScore > 90) {
      return { type: 'warning', icon: 'warning', text: 'High strain detected. Prioritize recovery today.', color: 'var(--red)' };
    }
    if (trainedMuscleGroups.includes('Chest') && !trainedMuscleGroups.includes('Back')) {
      return { type: 'imbalance', icon: 'imbalance', text: 'Muscle imbalance: You trained Chest but not Back.', color: 'var(--yellow)' };
    }
    if (prs.length > 0) {
      return { 
        type: 'pr', 
        icon: 'pr', 
        text: `New PR: ${prs[currentPrIndex]?.exercise_name} ${prs[currentPrIndex]?.best_weight}${displayUnit}`, 
        color: 'var(--pr-gold)' 
      };
    }
    return null;
  }, [strainScore, trainedMuscleGroups, prs, currentPrIndex, displayUnit]);

  // --- Handlers ---
  const handlePrev = useCallback(() => {
    if (viewMode === 'Week') setCurrentDate(prev => subWeeks(prev, 1));
    else if (viewMode === 'Day') setCurrentDate(prev => subDays(prev, 1));
    else if (viewMode === 'Month') setCurrentDate(prev => subMonths(prev, 1));
  }, [viewMode]);

  const handleNext = useCallback(() => {
    if (viewMode === 'Week') setCurrentDate(prev => addWeeks(prev, 1));
    else if (viewMode === 'Day') setCurrentDate(prev => addDays(prev, 1));
    else if (viewMode === 'Month') setCurrentDate(prev => addMonths(prev, 1));
  }, [viewMode]);

  const handleToday = useCallback(() => setCurrentDate(new Date()), []);
  const handleWorkoutEntry = useCallback(() => {
    navigate('/log');
  }, [navigate]);

  // --- Render Helpers ---
  if ((loading || layoutLoading) && workouts.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] p-3 space-y-2 animate-pulse">
        <div className="h-11 bg-[var(--bg-surface)] rounded-xl"></div>
        <div className="h-12 bg-[var(--bg-surface)] rounded-xl"></div>
        <div className="h-9 bg-[var(--bg-surface)] rounded-xl"></div>
        <div className="grid grid-cols-4 gap-1.5"><div className="h-16 bg-[var(--bg-surface)] rounded-xl"></div><div className="h-16 bg-[var(--bg-surface)] rounded-xl"></div><div className="h-16 bg-[var(--bg-surface)] rounded-xl"></div><div className="h-16 bg-[var(--bg-surface)] rounded-xl"></div></div>
        <div className="grid grid-cols-2 gap-2"><div className="h-64 bg-[var(--bg-surface)] rounded-xl"></div><div className="h-64 bg-[var(--bg-surface)] rounded-xl"></div></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center p-4 text-center">
        <p className="text-[var(--text-muted)] mb-4">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-[var(--accent)] text-black rounded-lg font-bold">Retry</button>
      </div>
    );
  }

  const WIDGET_COMPONENTS: Record<string, React.ReactNode> = {
    date_navigator: (
      <div key="date_navigator" className="flex flex-col gap-2">
        <header className="sticky top-0 z-50 h-[44px] bg-[var(--bg-base)] border-b border-[var(--border)] grid grid-cols-[1fr_auto_1fr] items-center px-1">
          <div className="flex items-center gap-2 justify-self-start min-w-0">
            <div className="flex items-center gap-1.5 bg-[var(--bg-surface)] px-2 py-1 rounded-full border border-[var(--border)]">
              {streak > 7 ? (
                <Flame className="w-3 h-3 text-[var(--pr-gold)]" />
              ) : (
                <Zap className="w-3 h-3 text-[var(--accent)]" />
              )}
              <span className="text-[12px] font-bold text-[var(--text-primary)]">{streak}</span>
            </div>
            {!isCurrentRange && (
              <button
                onClick={handleToday}
                className="px-2.5 py-1 text-[10px] font-semibold rounded-full border bg-[var(--bg-elevated)] text-white/90 border-[var(--border)] hover:bg-[var(--bg-surface)] transition-colors"
                aria-label="Jump to today"
              >
                Today
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-3 justify-self-center">
            <button onClick={handlePrev} className="p-1 text-[var(--ring-volume)] hover:bg-[var(--bg-surface)] rounded-full transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[13px] font-semibold text-[var(--text-primary)] min-w-[60px] text-center" onClick={handleToday}>
              {rangeTitle}
            </span>
            <button onClick={handleNext} className="p-1 text-[var(--ring-volume)] hover:bg-[var(--bg-surface)] rounded-full transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => navigate('/settings')}
            className="w-8 h-8 rounded-full bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)] text-[12px] font-bold border border-[var(--accent)]/20 hover:bg-[var(--accent)]/15 transition-colors justify-self-end"
            aria-label="Open settings"
          >
            {profile?.full_name?.charAt(0).toUpperCase() || 'A'}
          </button>
        </header>

        <div className="flex pt-2 px-1">
              {['Day', 'Week', 'Month'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as 'Day' | 'Week' | 'Month')}
                  className={`flex-1 text-center py-1.5 text-[12px] font-medium transition-all duration-200 ${
                    viewMode === mode 
                      ? 'bg-[var(--accent-dim)] text-[var(--accent)] border-b-[1.5px] border-[var(--accent)] rounded-t-md' 
                  : 'bg-transparent text-[#cdd6e1]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    ),
    quick_stats: <div key="quick_stats"><ThreeRingHero volume={volumeScore} recovery={recoveryScore} strain={strainScore} /></div>,
    muscle_map: (
      <div key="muscle_map" className="flex flex-col h-full">
        <MuscleMap muscleData={muscleMapData} view={muscleView} onViewChange={setMuscleView} title={muscleMapTitle} />
      </div>
    ),
    weekly_goal: (
      <div key="weekly_goal" className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-[10px_8px] h-full flex flex-col justify-between">
        <h3 className="text-[9px] uppercase tracking-[1.5px] text-white/80 font-bold mb-2">WEEKLY GOAL</h3>
        <WeeklyRing 
          trainedDays={trainedDaysCount} 
          goalDays={4} 
          days={weekDays} 
          balanceWarning={alert?.type === 'imbalance' ? alert.text : undefined} 
        />
      </div>
    ),
    train_next: (
      <div key="train_next" className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-3 h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-[0.8px] text-white/80 font-semibold">
            {rangeTitle}
          </div>
          <button
            onClick={handleWorkoutEntry}
            className="text-[10px] font-semibold text-[var(--accent)] hover:opacity-80"
          >
            {viewMode === 'Day' && rangeExercises.length > 0 ? 'Edit' : 'Start'}
          </button>
        </div>
        {viewMode === 'Day' ? (
          rangeExercises.length > 0 ? (
            <div className="flex flex-col gap-2">
              {dayExerciseStats.slice(0, 4).map((ex) => {
                const maxVolume = Math.max(dayExerciseStats[0]?.volume || 0, 1);
                const pct = Math.min((ex.volume / maxVolume) * 100, 100);
                return (
                  <div key={ex.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px] text-white/80">
                      <span className="truncate">{ex.name}</span>
                      <span className="text-[9px] text-[#cdd6e1]">{ex.sets} sets</span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: 'var(--accent)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
              <div className="text-[11px] text-white/80">No exercises logged today.</div>
              <button
                onClick={handleWorkoutEntry}
                className="px-3 py-1.5 bg-[var(--accent)] text-black text-[10px] font-bold rounded-lg"
              >
                Start Workout
              </button>
            </div>
          )
        ) : muscleLoadStats.length > 0 ? (
          <div className="flex flex-col gap-2">
            {muscleLoadStats.slice(0, 4).map((ex) => {
              const maxVolume = Math.max(muscleLoadStats[0]?.volume || 0, 1);
              const pct = Math.min((ex.volume / maxVolume) * 100, 100);
              return (
                <div key={ex.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] text-white/80">
                    <span className="truncate">{ex.name}</span>
                    <span className="text-[9px] text-[#cdd6e1]">{ex.volume.toFixed(0)} {displayUnit}</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: 'var(--accent)' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
            <div className="text-[11px] text-white/80">No training data for this range.</div>
            <button
              onClick={handleWorkoutEntry}
              className="px-3 py-1.5 bg-[var(--accent)] text-black text-[10px] font-bold rounded-lg"
            >
              Log Workout
            </button>
          </div>
        )}
      </div>
    ),
    pr_banner: alert ? (
      <AnimatePresence mode="wait" key="pr_banner">
        <motion.div 
          key={alert.type === 'pr' ? currentPrIndex : alert.type}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="w-full border rounded-[10px] p-2.5 flex items-center gap-2.5 animate-card-enter shadow-sm"
          style={{ 
            animationDelay: '180ms',
            backgroundColor: `color-mix(in srgb, ${alert.color} 10%, var(--bg-surface))`,
            borderColor: `color-mix(in srgb, ${alert.color} 30%, transparent)`
          }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${alert.color} 14%, transparent)` }}>
            {alert.icon === 'warning' && <AlertTriangle className="w-3.5 h-3.5" style={{ color: alert.color }} />}
            {alert.icon === 'imbalance' && <Scale className="w-3.5 h-3.5" style={{ color: alert.color }} />}
            {alert.icon === 'pr' && <Trophy className="w-3.5 h-3.5" style={{ color: alert.color }} />}
          </span>
          <div className="text-[11px] flex-1 truncate font-medium" style={{ color: alert.color }}>
            {alert.text}
          </div>
        </motion.div>
      </AnimatePresence>
    ) : null,
    today_card: (
      <div key="today_card" className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 animate-card-enter" style={{ animationDelay: '300ms' }}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[10px] uppercase tracking-[0.8px] text-white/80 font-semibold">TODAY'S ACTIVITIES</h3>
          <span className="text-[10px] text-[#cdd6e1]">{format(new Date(), 'MMM d')}</span>
        </div>

        {todaysWorkout ? (
          <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--green)] shadow-[0_0_8px_var(--green)]"></div>
              <div>
                <h4 className="text-[13px] font-medium text-[var(--text-primary)]">{todaysWorkout.title || 'Workout'}</h4>
                <p className="text-[10px] text-[#cdd6e1] flex items-center gap-1.5">
                  <span>{todaysWorkout.duration_minutes || 0} min</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-[#cdd6e1]"></span>
                  <span>{Array.isArray(todaysWorkout.exercises) ? todaysWorkout.exercises.reduce((sum: number, ex: any) => sum + (toDisplayExerciseWeight(ex) * (ex.reps || 0) * (ex.sets || 0)), 0).toLocaleString() : 0} {displayUnit}</span>
                </p>
              </div>
            </div>
            <button onClick={() => navigate('/timeline')} className="p-1.5 text-[var(--accent)] hover:bg-[var(--accent-dim)] rounded-md transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] border-dashed">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--text-muted)]"></div>
              <div>
                <h4 className="text-[13px] font-medium text-[var(--text-primary)]">Rest Day</h4>
                <p className="text-[10px] text-[#cdd6e1]">No activity logged</p>
              </div>
            </div>
            <button
              onClick={handleWorkoutEntry}
              className="px-3 py-1 bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-medium rounded-md border border-[var(--accent)]/30 hover:bg-[var(--accent)] hover:text-black transition-colors"
            >
              Log
            </button>
          </div>
        )}
      </div>
    ),
    week_strip: (
      <div key="week_strip" className="flex flex-col gap-2">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 animate-card-enter" style={{ animationDelay: '270ms' }}>
          <h3 className="text-[10px] uppercase tracking-[0.8px] text-white/80 font-semibold mb-3">MUSCLE LOAD</h3>
          <div className="flex flex-col gap-2.5">
            {trainedMuscleGroups.length > 0 ? (
              trainedMuscleGroups.map(m => {
                const load = Math.min(((muscleData[m]?.sets || 0) / 10) * 100, 100);
                const colorVar = m.toLowerCase() === 'cardio' ? 'var(--accent)' : `var(--${m.toLowerCase()})`;
                return (
                  <div key={m} className="flex flex-col gap-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[var(--text-primary)]">{m}</span>
                      <span className="text-[#cdd6e1]">{load.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full rounded-full" 
                        style={{ backgroundColor: colorVar }}
                        initial={{ width: 0 }}
                        animate={{ width: `${load}%` }}
                        transition={{ duration: 1, delay: 0.5 }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-[10px] text-[#cdd6e1] text-center py-2">No data yet</div>
            )}
          </div>
        </div>
      </div>
    ),
    ai_summary: (
        <div key="ai_summary" className="bg-gradient-to-br from-[#0d0d1a] to-[#0a0e14] border border-[var(--purple)]/20 rounded-xl p-3 animate-card-enter" style={{ animationDelay: '360ms' }}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[11px] text-[var(--purple)] font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Weekly AI Summary</h3>
          {new Date().getDay() === 0 && (
            <button className="text-[9px] px-2 py-0.5 rounded-md bg-[var(--purple)]/10 text-[var(--purple)] border border-[var(--purple)]/30 hover:bg-[var(--purple)]/20 transition-colors">
              Generate
            </button>
          )}
        </div>
        <p className="text-[11px] text-white/80 leading-[1.6]">
          {trainedMuscleGroups.length > 0 
            ? `You hit ${trainedMuscleGroups.join(', ')} this week. Consistency is key. Keep pushing your limits and ensure adequate recovery for optimal growth.`
            : `You haven't logged any workouts this week. Start a session to generate insights.`}
        </p>
      </div>
    ),
    whoop_row: (
      <div key="whoop_row">
        <div className="grid grid-cols-4 gap-[6px] opacity-50 animate-card-enter" style={{ animationDelay: '420ms' }}>
          {['Recovery', 'HRV', 'Sleep', 'Strain'].map(label => (
            <div key={label} className="bg-[var(--bg-surface)] border border-dashed border-[var(--border)] rounded-[10px] p-2 text-center">
              <div className="text-[16px] font-bold text-[#cdd6e1]">—</div>
              <div className="text-[9px] text-[#cdd6e1] mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <div className="text-center mt-2 animate-card-enter" style={{ animationDelay: '420ms' }}>
          <span className="text-[10px] text-[var(--accent)]/50 cursor-pointer">Connect Whoop →</span>
        </div>
      </div>
    )
  };

  const renderWidgets = () => {
    const rendered = [];
    for (let i = 0; i < visibleWidgets.length; i++) {
      const id = visibleWidgets[i];
      const nextId = visibleWidgets[i + 1];
      const isHalf = id === 'muscle_map' || id === 'train_next';
      const nextIsHalf = nextId === 'muscle_map' || nextId === 'train_next';
      
      if (isHalf && nextIsHalf) {
        rendered.push(
          <div key={`${id}-${nextId}`} className="grid grid-cols-2 gap-2 animate-card-enter" style={{ animationDelay: '120ms' }}>
            {WIDGET_COMPONENTS[id]}
            {WIDGET_COMPONENTS[nextId]}
          </div>
        );
        i++; // Skip next
      } else {
        rendered.push(
          <React.Fragment key={id}>
            {WIDGET_COMPONENTS[id]}
          </React.Fragment>
        );
      }
    }
    return rendered;
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] pb-24 md:pb-0 font-sans">
      <div className="max-w-[480px] mx-auto pb-6 flex flex-col gap-2">
        {renderWidgets()}
      </div>
    </div>
  );
};
