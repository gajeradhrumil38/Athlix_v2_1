import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trophy, ArrowRight, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { startOfWeek, endOfWeek, format, isSameDay, addWeeks, subWeeks, subDays, addDays, isAfter, startOfDay } from 'date-fns';
import { MuscleMap, MuscleData } from '../components/home/MuscleMap';
import { WeeklyRing } from '../components/home/WeeklyRing';
import { ThreeRingHero } from '../components/home/ThreeRingHero';
import { TrainNext } from '../components/home/TrainNext';
import { useNavigate } from 'react-router-dom';
import { useDashboardLayout } from '../hooks/useDashboardLayout';

// --- Utility Functions ---
const calculateStreak = (workouts: { date: string }[]) => {
  if (!workouts || workouts.length === 0) return 0;
  
  const uniqueDates = Array.from(new Set(workouts.map(w => w.date))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  
  let streak = 0;
  let currentDate = startOfDay(new Date());
  
  // Check if they worked out today
  if (uniqueDates.length > 0 && isSameDay(new Date(uniqueDates[0]), currentDate)) {
    streak = 1;
    currentDate = subDays(currentDate, 1);
    uniqueDates.shift();
  } else if (uniqueDates.length > 0 && isSameDay(new Date(uniqueDates[0]), subDays(currentDate, 1))) {
    // Or yesterday
    currentDate = subDays(currentDate, 1);
  } else {
    return 0; // No workout today or yesterday, streak broken
  }

  for (const dateStr of uniqueDates) {
    const date = startOfDay(new Date(dateStr));
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
    let start = 0;
    const end = value;
    if (start === end) return;

    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(progress * (end - start) + start);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };
    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <>{count.toFixed(decimals)}</>;
};

// --- Main Component ---
export const Home: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { visibleWidgets, loading: layoutLoading } = useDashboardLayout();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'Day' | 'Week' | 'Month'>('Week');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<any[]>([]);
  const [prs, setPrs] = useState<any[]>([]);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const [currentPrIndex, setCurrentPrIndex] = useState(0);

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
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');

      const [workoutsRes, allWorkoutsRes, prsRes, weightRes] = await Promise.all([
        supabase
          .from('workouts')
          .select('*, exercises(*)')
          .eq('user_id', user.id)
          .gte('date', startStr)
          .lte('date', endStr)
          .order('date', { ascending: false }),
        supabase
          .from('workouts')
          .select('date')
          .eq('user_id', user.id)
          .order('date', { ascending: false }),
        supabase
          .from('personal_records')
          .select('*')
          .eq('user_id', user.id)
          .gte('achieved_date', startStr)
          .lte('achieved_date', endStr)
          .order('achieved_date', { ascending: false }),
        supabase
          .from('body_weight_logs')
          .select('*')
          .eq('user_id', user.id)
          .gte('date', format(subDays(new Date(), 30), 'yyyy-MM-dd'))
          .order('date', { ascending: false })
      ]);

      if (workoutsRes.error) {
        console.warn('Workouts table error:', workoutsRes.error);
        // Don't throw, just let it be empty so the app doesn't crash completely
      }
      if (allWorkoutsRes.error) {
        console.warn('All Workouts table error:', allWorkoutsRes.error);
      }
      
      if (prsRes.error) console.warn('PRs table error:', prsRes.error);
      if (weightRes.error) console.warn('Weight logs table error:', weightRes.error);

      setWorkouts(!workoutsRes.error ? (workoutsRes.data || []) : []);
      setAllWorkouts(!allWorkoutsRes.error ? (allWorkoutsRes.data || []) : []);
      setPrs(!prsRes.error ? (prsRes.data || []) : []);
      setWeightLogs(!weightRes.error ? (weightRes.data || []) : []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, currentDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Computed Data ---
  const streak = useMemo(() => calculateStreak(allWorkouts), [allWorkouts]);
  
  const totalVolume = useMemo(() => {
    return workouts.reduce((total, w) => {
      return total + (Array.isArray(w.exercises) ? w.exercises.reduce((sum: number, ex: any) => sum + ((ex.weight || 0) * (ex.reps || 0) * (ex.sets || 0)), 0) : 0);
    }, 0);
  }, [workouts]);

  const muscleData = useMemo(() => {
    const data: MuscleData = {};
    workouts.forEach(w => {
      const totalSetsInWorkout = Array.isArray(w.exercises) ? w.exercises.reduce((sum: number, ex: any) => sum + (ex.sets || 0), 0) : 0;
      if (Array.isArray(w.muscle_groups)) {
        w.muscle_groups.forEach((m: string) => {
          if (!data[m]) data[m] = { sessions: 0, sets: 0 };
          data[m].sessions += 1;
          data[m].sets += totalSetsInWorkout;
        });
      }
    });

    return data;
  }, [workouts]);

  const trainedMuscleGroups = Object.keys(muscleData);

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
  const todaysWorkout = workouts.find(w => isSameDay(new Date(w.date), new Date()));

  // Dynamic Ring Calculations
  const volumeScore = Math.min((totalVolume / 15000) * 100, 100); // Example: 15k is 100%
  const recoveryScore = Math.max(100 - (trainedDaysCount * 15), 10); // Example
  const strainScore = Math.min((trainedDaysCount / 5) * 100, 100); // Example: 5 days is 100%

  // --- Alert Logic ---
  const alert = useMemo(() => {
    if (strainScore > 90) {
      return { type: 'warning', icon: '⚠️', text: 'High strain detected. Prioritize recovery today.', color: 'var(--red)' };
    }
    if (trainedMuscleGroups.includes('Chest') && !trainedMuscleGroups.includes('Back')) {
      return { type: 'imbalance', icon: '⚖️', text: 'Muscle imbalance: You trained Chest but not Back.', color: 'var(--yellow)' };
    }
    if (prs.length > 0) {
      return { 
        type: 'pr', 
        icon: '🏆', 
        text: `New PR: ${prs[currentPrIndex]?.exercise_name} ${prs[currentPrIndex]?.best_weight}kg`, 
        color: 'var(--pr-gold)' 
      };
    }
    return null;
  }, [strainScore, trainedMuscleGroups, prs, currentPrIndex]);

  // --- Handlers ---
  const handlePrev = useCallback(() => {
    if (viewMode === 'Week') setCurrentDate(prev => subWeeks(prev, 1));
    else if (viewMode === 'Day') setCurrentDate(prev => subDays(prev, 1));
  }, [viewMode]);

  const handleNext = useCallback(() => {
    if (viewMode === 'Week') setCurrentDate(prev => addWeeks(prev, 1));
    else if (viewMode === 'Day') setCurrentDate(prev => addDays(prev, 1));
  }, [viewMode]);

  const handleToday = useCallback(() => setCurrentDate(new Date()), []);

  // --- Render Helpers ---
  if (loading && workouts.length === 0) {
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

  const isFirstTimeUser = allWorkouts.length === 0;

  const WIDGET_COMPONENTS: Record<string, React.ReactNode> = {
    date_navigator: (
      <div key="date_navigator" className="flex flex-col gap-2">
        <header className="sticky top-0 z-50 h-[44px] bg-[var(--bg-base)] border-b border-[var(--border)] flex items-center justify-between -mx-3 px-3">
          <div className="flex items-center gap-1.5 bg-[var(--bg-surface)] px-2 py-1 rounded-full border border-[var(--border)]">
            <span className="text-[12px]">{streak > 7 ? '🔥' : '⚡'}</span>
            <span className="text-[12px] font-bold text-[var(--text-primary)]">{streak}</span>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={handlePrev} className="p-1 text-[var(--ring-volume)] hover:bg-[var(--bg-surface)] rounded-full transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[13px] font-semibold text-[var(--text-primary)] min-w-[60px] text-center" onClick={handleToday}>
              {viewMode === 'Week' ? `Week ${format(currentDate, 'w')}` : isSameDay(currentDate, new Date()) ? 'Today' : format(currentDate, 'MMM d')}
            </span>
            <button onClick={handleNext} className="p-1 text-[var(--ring-volume)] hover:bg-[var(--bg-surface)] rounded-full transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="w-8 h-8 rounded-full bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)] text-[12px] font-bold border border-[var(--accent)]/20">
            {profile?.full_name?.charAt(0).toUpperCase() || 'A'}
          </div>
        </header>

        <div className="flex pt-2 px-1">
          {['Day', 'Week', 'Month'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode as any)}
              className={`flex-1 text-center py-1.5 text-[12px] font-medium transition-all duration-200 ${
                viewMode === mode 
                  ? 'bg-[var(--accent-dim)] text-[var(--accent)] border-b-[1.5px] border-[var(--accent)] rounded-t-md' 
                  : 'bg-transparent text-[var(--text-muted)]'
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
        <MuscleMap muscleData={muscleData} view={muscleView} onViewChange={setMuscleView} />
      </div>
    ),
    weekly_goal: (
      <div key="weekly_goal" className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-[10px_8px] h-full flex flex-col justify-between">
        <h3 className="text-[9px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-bold mb-2">WEEKLY GOAL</h3>
        <WeeklyRing 
          trainedDays={trainedDaysCount} 
          goalDays={4} 
          days={weekDays} 
          balanceWarning={alert?.type === 'imbalance' ? alert.text : undefined} 
        />
      </div>
    ),
    train_next: (
      <div key="train_next" className="flex flex-col h-full">
        <TrainNext muscleData={muscleData} weekDays={weekDays} />
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
          <span className="text-[14px]">{alert.icon}</span>
          <div className="text-[11px] flex-1 truncate font-medium" style={{ color: alert.color }}>
            {alert.text}
          </div>
        </motion.div>
      </AnimatePresence>
    ) : null,
    today_card: (
      <div key="today_card" className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 animate-card-enter" style={{ animationDelay: '300ms' }}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-muted)] font-semibold">TODAY'S ACTIVITIES</h3>
          <span className="text-[10px] text-[var(--text-muted)]">{format(new Date(), 'MMM d')}</span>
        </div>

        {todaysWorkout ? (
          <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--green)] shadow-[0_0_8px_var(--green)]"></div>
              <div>
                <h4 className="text-[13px] font-medium text-[var(--text-primary)]">{todaysWorkout.title || 'Workout'}</h4>
                <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
                  <span>{todaysWorkout.duration_minutes || 0} min</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-[var(--text-muted)]"></span>
                  <span>{Array.isArray(todaysWorkout.exercises) ? todaysWorkout.exercises.reduce((sum: number, ex: any) => sum + ((ex.weight || 0) * (ex.reps || 0) * (ex.sets || 0)), 0).toLocaleString() : 0} kg</span>
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
                <p className="text-[10px] text-[var(--text-muted)]">No activity logged</p>
              </div>
            </div>
            <button onClick={() => navigate('/log')} className="px-3 py-1 bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-medium rounded-md border border-[var(--accent)]/30 hover:bg-[var(--accent)] hover:text-black transition-colors">
              Log
            </button>
          </div>
        )}
      </div>
    ),
    week_strip: (
      <div key="week_strip" className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 animate-card-enter" style={{ animationDelay: '240ms' }}>
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 flex flex-col items-center justify-center text-center">
            <h3 className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-muted)] font-semibold mb-2">MUSCLE COVER</h3>
            <div className="w-10 h-10 rounded-full bg-[var(--accent-dim)] flex items-center justify-center mb-2 border border-[var(--accent)]/20">
              <div className="w-3 h-3 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]"></div>
            </div>
            <span className="text-[18px] font-bold text-[var(--text-primary)]">{trainedMuscleGroups.length}</span>
            <span className="text-[10px] text-[var(--text-muted)]">Groups hit this week</span>
          </div>

          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 flex flex-col items-center justify-center text-center">
            <h3 className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-muted)] font-semibold mb-2">PR MONITOR</h3>
            {prs.length > 0 ? (
              <>
                <div className="w-10 h-10 rounded-full bg-[var(--pr-gold)]/10 flex items-center justify-center mb-2 border border-[var(--pr-gold)]/20">
                  <Trophy className="w-5 h-5 text-[var(--pr-gold)]" />
                </div>
                <span className="text-[18px] font-bold text-[var(--text-primary)]">{prs.length}</span>
                <span className="text-[10px] text-[var(--text-muted)]">PRs this week</span>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mb-2 border border-[var(--border)]">
                  <Trophy className="w-5 h-5 text-[var(--text-muted)]" />
                </div>
                <span className="text-[18px] font-bold text-[var(--text-muted)]">0</span>
                <span className="text-[10px] text-[var(--text-muted)]">No PRs this week</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 animate-card-enter" style={{ animationDelay: '270ms' }}>
          <h3 className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-muted)] font-semibold mb-3">MUSCLE LOAD</h3>
          <div className="flex flex-col gap-2.5">
            {trainedMuscleGroups.length > 0 ? (
              trainedMuscleGroups.map(m => {
                const load = Math.min((muscleData[m] / 10) * 100, 100);
                const colorVar = `var(--${m.toLowerCase()})`;
                return (
                  <div key={m} className="flex flex-col gap-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[var(--text-primary)]">{m}</span>
                      <span className="text-[var(--text-muted)]">{load.toFixed(0)}%</span>
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
              <div className="text-[10px] text-[var(--text-muted)] text-center py-2">No data yet</div>
            )}
          </div>
        </div>
      </div>
    ),
    ai_summary: (
      <div key="ai_summary" className="bg-gradient-to-br from-[#0d0d1a] to-[#0a0e14] border border-[var(--purple)]/20 rounded-xl p-3 animate-card-enter" style={{ animationDelay: '360ms' }}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[11px] text-[var(--purple)] font-medium">✦ Weekly AI Summary</h3>
          {new Date().getDay() === 0 && (
            <button className="text-[9px] px-2 py-0.5 rounded-md bg-[var(--purple)]/10 text-[var(--purple)] border border-[var(--purple)]/30 hover:bg-[var(--purple)]/20 transition-colors">
              Generate
            </button>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] leading-[1.6]">
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
              <div className="text-[16px] font-bold text-[var(--text-muted)]">—</div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{label}</div>
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
    if (isFirstTimeUser) {
      return (
        <>
          {WIDGET_COMPONENTS['date_navigator']}
          <div className="flex flex-col items-center justify-center py-20 text-center animate-card-enter">
            <div className="w-32 h-32 opacity-20 mb-6">
              <svg viewBox="0 0 80 170" width="100%" preserveAspectRatio="xMidYMid meet">
                <ellipse cx="40" cy="13" rx="11" ry="12" fill="none" stroke="currentColor" strokeWidth="1" />
                <path d="M25 32 L55 32 L50 50 L30 50 Z" fill="none" stroke="currentColor" strokeWidth="1" />
                <rect x="28" y="84" width="11" height="35" rx="4" fill="none" stroke="currentColor" strokeWidth="1" />
                <rect x="41" y="84" width="11" height="35" rx="4" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            </div>
            <h2 className="text-[18px] text-[var(--text-primary)] font-bold mb-2">Your journey starts today 💪</h2>
            <p className="text-[12px] text-[var(--text-secondary)] mb-8 max-w-[250px]">Log your first workout to start tracking progress</p>
            <button onClick={() => navigate('/log')} className="px-6 py-3 bg-[var(--accent)] text-black font-bold rounded-xl flex items-center gap-2">
              Start First Workout <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      );
    }

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
      <div className="max-w-[480px] mx-auto px-3 pb-6 flex flex-col gap-2">
        {renderWidgets()}
      </div>
    </div>
  );
};
