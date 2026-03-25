import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { QuickStartSheet } from '../components/log/QuickStartSheet';
import { ActiveWorkout } from '../components/log/ActiveWorkout';
import { CelebrationScreen } from '../components/log/CelebrationScreen';
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
  };
}

export interface WorkoutState {
  id?: string;
  title: string;
  startTime: number;
  elapsedSeconds: number;
  exercises: ExerciseEntry[];
  notes: string;
}

const DRAFT_KEY = 'athlix_active_workout';

export const Log: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workout, setWorkout] = useState<WorkoutState | null>(null);
  const [showQuickStart, setShowQuickStart] = useState(true);
  const [showFinish, setShowFinish] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationStats, setCelebrationStats] = useState<any>(null);

  // Load draft on mount
  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      const parsed = JSON.parse(draft);
      const age = Date.now() - parsed.startTime;
      if (age < 24 * 60 * 60 * 1000) {
        // In a real app, we'd show a "Resume?" banner. 
        // For this rebuild, we'll just load it if it exists and skip QuickStart.
        setWorkout(parsed);
        setShowQuickStart(false);
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }, []);

  // Auto-save draft every 30s
  useEffect(() => {
    if (!workout) return;
    const interval = setInterval(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(workout));
    }, 30000);
    return () => clearInterval(interval);
  }, [workout]);

  const startWorkout = useCallback((initialExercises: ExerciseEntry[] = [], title?: string) => {
    const newState: WorkoutState = {
      title: title || (new Date().getHours() < 12 ? 'Morning Workout' : 'Evening Workout'),
      startTime: Date.now(),
      elapsedSeconds: 0,
      exercises: initialExercises,
      notes: ''
    };
    setWorkout(newState);
    setShowQuickStart(false);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(newState));
  }, []);

  const handleFinish = () => {
    setShowFinish(true);
  };

  const handleSave = async (title: string, notes: string) => {
    if (!workout || !user) return;
    
    // In a real app, we'd save to Supabase here
    // For now, show celebration
    const finalWorkout = { ...workout, title, notes };
    
    setCelebrationStats({
      duration: Math.round(finalWorkout.elapsedSeconds / 60),
      sets: (finalWorkout.exercises || []).reduce((acc, ex) => acc + (ex.sets || []).filter(s => s.done).length, 0),
      volume: (finalWorkout.exercises || []).reduce((acc, ex) => 
        acc + (ex.sets || []).filter(s => s.done).reduce((sAcc, s) => sAcc + (Number(s.weight || 0) * Number(s.reps || 0)), 0), 0
      ),
      prs: 0 // Logic to detect PRs
    });
    
    localStorage.removeItem(DRAFT_KEY);
    setShowFinish(false);
    setShowCelebration(true);
  };

  const handleDiscard = () => {
    localStorage.removeItem(DRAFT_KEY);
    navigate('/');
  };

  if (showCelebration) {
    return <CelebrationScreen onClose={() => navigate('/')} />;
  }

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
        />
      )}

      <AnimatePresence>
        {showFinish && workout && (
          <FinishSheet 
            workout={workout}
            onConfirm={handleSave}
            onCancel={() => setShowFinish(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
