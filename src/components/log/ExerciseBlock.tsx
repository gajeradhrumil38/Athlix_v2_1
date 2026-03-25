import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Plus, Trophy } from 'lucide-react';
import { ExerciseEntry, Set } from '../../pages/Log';
import { SetRow } from './SetRow';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ExerciseBlockProps {
  exercise: ExerciseEntry;
  onUpdate: (updated: ExerciseEntry) => void;
  onRemove: () => void;
  onStartRest: (duration: number, exerciseName: string) => void;
}

export const ExerciseBlock: React.FC<ExerciseBlockProps> = ({ exercise, onUpdate, onRemove, onStartRest }) => {
  const { user } = useAuth();
  const [lastSession, setLastSession] = useState<any>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [isPR, setIsPR] = useState(false);

  useEffect(() => {
    const fetchLastSession = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('exercises')
        .select('*, workouts(date)')
        .eq('name', exercise.name)
        .order('id', { ascending: false }) // In a real app, we'd order by workout date
        .limit(1)
        .single();
      
      if (data) setLastSession(data);
    };
    fetchLastSession();
  }, [user, exercise.name]);

  const handleAddSet = () => {
    const sets = exercise.sets || [];
    const lastSet = sets[sets.length - 1];
    const newSet: Set = {
      id: Math.random().toString(36).substr(2, 9),
      weight: lastSet ? lastSet.weight : (lastSession?.weight || null),
      reps: lastSet ? lastSet.reps : (lastSession?.reps || null),
      done: false
    };
    onUpdate({ ...exercise, sets: [...sets, newSet] });
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleUpdateSet = (setId: string, updatedSet: Set) => {
    onUpdate({
      ...exercise,
      sets: (exercise.sets || []).map(s => s.id === setId ? updatedSet : s)
    });

    if (updatedSet.done) {
      // Check for PR
      if (updatedSet.weight && (!lastSession || updatedSet.weight > lastSession.weight)) {
        setIsPR(true);
        setTimeout(() => setIsPR(false), 3000);
      }
      
      // Start rest timer
      const restPrefs = JSON.parse(localStorage.getItem('athlix_rest_prefs') || '{}');
      const duration = restPrefs[exercise.name] || 90;
      onStartRest(duration, exercise.name);
    }
  };

  const totalVolume = (exercise.sets || [])
    .filter(s => s.done)
    .reduce((acc, s) => acc + (Number(s.weight || 0) * Number(s.reps || 0)), 0);

  return (
    <div className="bg-[#141C28] border border-[#1E2F42] rounded-[14px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2F42]">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-[#E2E8F0]">{exercise.name}</h3>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00D4FF]" />
            <span className="text-[9px] text-[#8892A4] uppercase tracking-wider">{exercise.muscleGroup}</span>
          </div>
          <AnimatePresence>
            {isPR && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="flex items-center gap-1 px-2 py-0.5 bg-[#EF9F27]/20 rounded-full"
              >
                <Trophy className="w-3 h-3 text-[#EF9F27]" />
                <span className="text-[9px] font-bold text-[#EF9F27]">NEW PR!</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-[#3A5060]">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Last Session Row */}
      <div className="px-4 py-2 bg-[#1A2538]/50 flex items-center justify-between">
        {lastSession ? (
          <span className="text-[10px] text-[#8892A4]">
            Last: {new Date(lastSession.workouts?.date).toLocaleDateString()} · {lastSession.reps} reps @ {lastSession.weight}kg
          </span>
        ) : (
          <span className="text-[10px] text-[#00D4FF]">First time — set your benchmark 🎯</span>
        )}
      </div>

        {/* Sets */}
        <div className="p-4 space-y-2">
          <div className="flex items-center text-[9px] font-bold text-[#3A5060] uppercase tracking-[1.5px] px-2 mb-1">
            <span className="w-8">Set</span>
            <span className="flex-1 text-center">Weight (kg)</span>
            <span className="flex-1 text-center">Reps</span>
            <span className="w-10"></span>
          </div>
          {(exercise.sets || []).map((set, i) => (
            <SetRow 
              key={set.id}
              index={i + 1}
              set={set}
              onUpdate={(updated) => handleUpdateSet(set.id, updated)}
            />
          ))}
        </div>

      {/* Add Set Button */}
      <button 
        onClick={handleAddSet}
        className="w-full py-3 border-t border-[#1E2F42] text-[10px] font-bold text-[#00D4FF]/60 hover:text-[#00D4FF] transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-3 h-3" /> Add Set
      </button>

      {/* Footer */}
      <div className="px-4 py-2 bg-[#0D1117]/30 flex items-center justify-between border-t border-[#1E2F42]">
        <span className="text-[9px] text-[#3A5060] uppercase tracking-wider font-bold">
          Total: {(exercise.sets || []).filter(s => s.done).length} sets · {totalVolume.toLocaleString()}kg
        </span>
      </div>
    </div>
  );
};
