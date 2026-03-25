import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, ArrowRight, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ExerciseEntry } from '../../pages/Log';

interface QuickStartSheetProps {
  onStartEmpty: () => void;
  onStartTemplate: (exercises: ExerciseEntry[], title: string) => void;
}

export const QuickStartSheet: React.FC<QuickStartSheetProps> = ({ onStartEmpty, onStartTemplate }) => {
  const { user } = useAuth();
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecent = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('workouts')
        .select('*, exercises(*)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(5);
      
      if (data) setRecentWorkouts(data);
      setLoading(false);
    };
    fetchRecent();
  }, [user]);

  const handleLoadRecent = (workout: any) => {
    const exercises: ExerciseEntry[] = workout.exercises.map((ex: any) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: ex.name,
      muscleGroup: '', // We'd ideally fetch this or have it denormalized
      exercise_db_id: ex.exercise_db_id,
      sets: Array.from({ length: ex.sets || 3 }).map(() => ({
        id: Math.random().toString(36).substr(2, 9),
        weight: ex.weight,
        reps: ex.reps,
        done: false
      }))
    }));
    onStartTemplate(exercises, workout.title);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-[480px] bg-[#141C28] rounded-t-[20px] p-6 pb-safe border-t border-[#1E2F42]"
        style={{ height: '65%' }}
      >
        <div className="w-12 h-1 bg-[#3A5060] rounded-full mx-auto mb-6" />
        
        <div className="mb-6">
          <h2 className="text-[14px] font-bold text-[#E2E8F0]">Start Workout</h2>
          <p className="text-[11px] text-[#8892A4]">What are you training today?</p>
        </div>

        {/* Suggested */}
        <div className="flex gap-2 mb-8">
          <button 
            onClick={onStartEmpty}
            className="flex-1 px-4 py-3 bg-[#00D4FF]/10 border border-[#00D4FF]/20 rounded-xl text-left"
          >
            <span className="block text-[12px] font-bold text-[#00D4FF]">💪 Push Day</span>
            <span className="text-[9px] text-[#00D4FF]/60 uppercase tracking-wider">Suggested</span>
          </button>
          <button 
            onClick={onStartEmpty}
            className="flex-1 px-4 py-3 bg-[#1A2538] border border-[#1E2F42] rounded-xl text-left"
          >
            <span className="block text-[12px] font-bold text-[#E2E8F0]">🦵 Leg Day</span>
            <span className="text-[9px] text-[#8892A4] uppercase tracking-wider">Next in split</span>
          </button>
        </div>

        {/* Recent Workouts */}
        <div className="mb-8">
          <label className="block text-[9px] font-bold uppercase tracking-[1.5px] text-[#3A5060] mb-3">Recent Workouts</label>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-6 px-6">
            {recentWorkouts.map((w) => (
              <button 
                key={w.id}
                onClick={() => handleLoadRecent(w)}
                className="flex-shrink-0 w-[140px] p-3 bg-[#1A2538] border border-[#1E2F42] rounded-xl text-left"
              >
                <div className="text-[12px] font-bold text-[#E2E8F0] truncate mb-1">{w.title}</div>
                <div className="text-[9px] text-[#8892A4] mb-2">{new Date(w.date).toLocaleDateString()}</div>
                <div className="text-[9px] font-bold text-[#00D4FF] uppercase tracking-wider">{w.exercises?.length || 0} Exercises</div>
              </button>
            ))}
            {loading && [1,2,3].map(i => (
              <div key={i} className="flex-shrink-0 w-[140px] h-[80px] bg-[#1A2538] animate-pulse rounded-xl" />
            ))}
          </div>
        </div>

        <button 
          onClick={onStartEmpty}
          className="w-full py-4 bg-[#00D4FF] text-black rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 mb-4"
        >
          Start Empty Workout <ArrowRight className="w-4 h-4" />
        </button>

        <button className="w-full py-2 text-[12px] font-bold text-[#8892A4] flex items-center justify-center gap-2">
          <ClipboardList className="w-4 h-4" /> Load Template
        </button>
      </motion.div>
    </div>
  );
};
