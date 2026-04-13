import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, ArrowRight, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { ExerciseEntry } from '../../legacy-pages/Log';
import { FitnessBadge } from '../FitnessIcons';
import { buildExercisesFromWorkout, getTemplates, getWorkouts } from '../../lib/supabaseData';
import { parseDateAtStartOfDay } from '../../lib/dates';

interface QuickStartSheetProps {
  onStartEmpty: () => void;
  onStartTemplate: (exercises: ExerciseEntry[], title: string) => void;
}

export const QuickStartSheet: React.FC<QuickStartSheetProps> = ({ onStartEmpty, onStartTemplate }) => {
  const { user } = useAuth();
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecent = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      const [workoutData, templateData] = await Promise.all([
        getWorkouts(user.id, {
          includeExercises: true,
          limit: 5,
        }),
        getTemplates(user.id),
      ]);

      if (workoutData) setRecentWorkouts(workoutData);
      if (templateData) setTemplates(templateData);
      setLoading(false);
    };
    fetchRecent();
  }, [user]);

  const handleLoadRecent = async (workout: any) => {
    if (!user) return;

    const sourceExercises = await buildExercisesFromWorkout(user.id, workout.id);
    const exercises: ExerciseEntry[] = sourceExercises.map((ex) => ({
      id: crypto.randomUUID(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      exercise_db_id: ex.exercise_db_id || undefined,
      sets: ex.sets.map((set) => ({
        id: crypto.randomUUID(),
        weight: set.weight,
        reps: set.reps,
        done: false,
      })),
    }));

    onStartTemplate(exercises, workout.title);
  };

  const handleLoadTemplate = (template: any) => {
    const exercises: ExerciseEntry[] = template.template_exercises.map((ex: any) => ({
      id: crypto.randomUUID(),
      name: ex.name,
      muscleGroup: ex.muscle_group || ex.muscleGroup || 'Core',
      exercise_db_id: ex.exercise_db_id || undefined,
      sets: Array.from({ length: ex.default_sets || 3 }).map(() => ({
        id: crypto.randomUUID(),
        weight: ex.default_weight || 0,
        reps: ex.default_reps || 0,
        done: false,
      })),
    }));

    onStartTemplate(exercises, template.title);
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
            className="flex-1 px-4 py-3 bg-[#00D4FF]/10 border border-[#00D4FF]/25 rounded-2xl text-left shadow-[0_0_30px_rgba(0,212,255,0.08)]"
          >
            <div className="flex items-center gap-3">
              <FitnessBadge name="push" color="#00D4FF" size={38} />
              <div>
                <span className="block text-[12px] font-bold text-[#00D4FF]">Push Day</span>
                <span className="text-[9px] text-[#00D4FF]/60 uppercase tracking-wider">Suggested</span>
              </div>
            </div>
          </button>
          <button 
            onClick={onStartEmpty}
            className="flex-1 px-4 py-3 bg-[#1A2538] border border-[#1E2F42] rounded-2xl text-left"
          >
            <div className="flex items-center gap-3">
              <FitnessBadge name="legs" color="#A78BFA" size={38} />
              <div>
                <span className="block text-[12px] font-bold text-[#E2E8F0]">Leg Day</span>
                <span className="text-[9px] text-[#8892A4] uppercase tracking-wider">Next in split</span>
              </div>
            </div>
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
                <div className="text-[9px] text-[#8892A4] mb-2">
                  {(() => {
                    const parsedDate = parseDateAtStartOfDay(w.date);
                    return parsedDate ? parsedDate.toLocaleDateString() : '--';
                  })()}
                </div>
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

        {templates.length > 0 ? (
          <div className="space-y-2">
            <div className="w-full py-2 text-[12px] font-bold text-[#8892A4] flex items-center justify-center gap-2">
              <ClipboardList className="w-4 h-4" /> Load Template
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleLoadTemplate(template)}
                  className="flex-shrink-0 px-4 py-2 rounded-xl bg-[#1A2538] border border-[#1E2F42] text-left"
                >
                  <div className="text-[11px] font-bold text-[#E2E8F0]">{template.title}</div>
                  <div className="text-[9px] text-[#8892A4]">
                    {template.template_exercises?.length || 0} exercises
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button className="w-full py-2 text-[12px] font-bold text-[#8892A4] flex items-center justify-center gap-2 opacity-50" disabled>
            <ClipboardList className="w-4 h-4" /> No Templates Yet
          </button>
        )}
      </motion.div>
    </div>
  );
};
