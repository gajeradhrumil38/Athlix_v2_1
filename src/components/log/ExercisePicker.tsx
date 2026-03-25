import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Plus, ChevronRight, History, Dumbbell, LayoutGrid } from 'lucide-react';

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  lastSession?: {
    weight: number;
    reps: number;
    date: string;
  };
}

interface ExercisePickerProps {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
  recentExercises: Exercise[];
}

const MUSCLE_GROUPS = [
  { name: 'Chest', icon: '🎯', color: '#C45A7A' },
  { name: 'Back', icon: '🦅', color: '#5A7AC4' },
  { name: 'Shoulders', icon: '🛡️', color: '#C49A5A' },
  { name: 'Biceps', icon: '💪', color: '#7AC45A' },
  { name: 'Triceps', icon: '⚡', color: '#5AC49A' },
  { name: 'Legs', icon: '🦵', color: '#9A5AC4' },
  { name: 'Abs', icon: '🍫', color: '#C4C45A' },
  { name: 'Cardio', icon: '🏃', color: '#5AC4C4' },
];

const ALL_EXERCISES: Exercise[] = [
  { id: '1', name: 'Bench Press', muscleGroup: 'Chest', lastSession: { weight: 80, reps: 8, date: '2 days ago' } },
  { id: '2', name: 'Incline Dumbbell Press', muscleGroup: 'Chest', lastSession: { weight: 30, reps: 10, date: '2 days ago' } },
  { id: '3', name: 'Pull Ups', muscleGroup: 'Back', lastSession: { weight: 0, reps: 12, date: '3 days ago' } },
  { id: '4', name: 'Deadlift', muscleGroup: 'Back', lastSession: { weight: 140, reps: 5, date: '1 week ago' } },
  { id: '5', name: 'Overhead Press', muscleGroup: 'Shoulders', lastSession: { weight: 50, reps: 8, date: '4 days ago' } },
  { id: '6', name: 'Lateral Raises', muscleGroup: 'Shoulders', lastSession: { weight: 12, reps: 15, date: '4 days ago' } },
  { id: '7', name: 'Barbell Squat', muscleGroup: 'Legs', lastSession: { weight: 100, reps: 8, date: '5 days ago' } },
  { id: '8', name: 'Leg Press', muscleGroup: 'Legs', lastSession: { weight: 200, reps: 12, date: '5 days ago' } },
  { id: '9', name: 'Bicep Curls', muscleGroup: 'Biceps', lastSession: { weight: 15, reps: 12, date: '2 days ago' } },
  { id: '10', name: 'Tricep Pushdowns', muscleGroup: 'Triceps', lastSession: { weight: 25, reps: 15, date: '2 days ago' } },
];

export const ExercisePicker: React.FC<ExercisePickerProps> = ({ onSelect, onClose, recentExercises }) => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'recent' | 'muscle' | 'search'>('recent');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);

  const filteredExercises = useMemo(() => {
    let list = ALL_EXERCISES;
    if (search) {
      list = list.filter(ex => ex.name.toLowerCase().includes(search.toLowerCase()));
    } else if (selectedMuscle) {
      list = list.filter(ex => ex.muscleGroup === selectedMuscle);
    }
    return list;
  }, [search, selectedMuscle]);

  const handleSelect = (ex: Exercise) => {
    onSelect(ex);
    onClose();
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-[#0D1117] flex flex-col"
    >
      {/* Header */}
      <div className="h-[60px] flex items-center justify-between px-4 border-b border-[#1E2F42]">
        <h2 className="text-[16px] font-black text-[#E2E8F0] tracking-tight">ADD EXERCISE</h2>
        <button onClick={onClose} className="p-2 text-[#8892A4] hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3A5060]" />
          <input 
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (e.target.value) setActiveTab('search');
            }}
            className="w-full h-11 bg-[#141C28] border border-[#1E2F42] rounded-xl pl-10 pr-4 text-[14px] text-white placeholder-[#3A5060] focus:outline-none focus:border-[#00D4FF]/50 transition-all"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-2 mb-4">
        {[
          { id: 'recent', label: 'Recent', icon: History },
          { id: 'muscle', label: 'Muscle', icon: LayoutGrid },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setSearch('');
              setSelectedMuscle(null);
            }}
            className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-[11px] font-bold transition-all ${activeTab === tab.id ? 'bg-[#00D4FF]/15 text-[#00D4FF] border border-[#00D4FF]/40' : 'bg-[#141C28] text-[#8892A4] border border-[#1E2F42]'}`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 no-scrollbar">
        {activeTab === 'recent' && !search && (
          <div className="space-y-2">
            {recentExercises.length > 0 ? recentExercises.map(ex => (
              <ExerciseRow key={ex.id} ex={ex} onSelect={handleSelect} />
            )) : (
              <div className="text-center py-12 text-[#3A5060] text-[12px] font-medium">No recent exercises</div>
            )}
          </div>
        )}

        {activeTab === 'muscle' && !search && !selectedMuscle && (
          <div className="grid grid-cols-2 gap-3">
            {MUSCLE_GROUPS.map(m => (
              <button
                key={m.name}
                onClick={() => setSelectedMuscle(m.name)}
                className="h-20 bg-[#141C28] border border-[#1E2F42] rounded-2xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
              >
                <span className="text-xl">{m.icon}</span>
                <span className="text-[11px] font-black text-[#E2E8F0] uppercase tracking-wider">{m.name}</span>
              </button>
            ))}
          </div>
        )}

        {(selectedMuscle || activeTab === 'search') && (
          <div className="space-y-2">
            {selectedMuscle && (
              <button 
                onClick={() => setSelectedMuscle(null)}
                className="text-[10px] font-bold text-[#00D4FF] uppercase tracking-widest mb-2 flex items-center gap-1"
              >
                ← Back to Muscle Groups
              </button>
            )}
            {filteredExercises.map(ex => (
              <ExerciseRow key={ex.id} ex={ex} onSelect={handleSelect} />
            ))}
            {filteredExercises.length === 0 && (
              <div className="text-center py-12 text-[#3A5060] text-[12px] font-medium">No exercises found</div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const ExerciseRow: React.FC<{ ex: Exercise, onSelect: (ex: Exercise) => void }> = ({ ex, onSelect }) => {
  const getMuscleColor = (muscle: string) => {
    const colors: Record<string, string> = {
      'Chest': '#C45A7A', 'Back': '#5A7AC4', 'Shoulders': '#C49A5A',
      'Biceps': '#7AC45A', 'Triceps': '#5AC49A', 'Legs': '#9A5AC4',
      'Abs': '#C4C45A', 'Cardio': '#5AC4C4',
    };
    return colors[muscle] || '#8892A4';
  };

  return (
    <button 
      onClick={() => onSelect(ex)}
      className="w-full h-16 bg-[#141C28] border border-[#1E2F42] rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
    >
      <div className="w-1.5 h-8 rounded-full" style={{ background: getMuscleColor(ex.muscleGroup) }} />
      <div className="flex-1 flex flex-col">
        <span className="text-[13px] font-black text-[#E2E8F0] tracking-tight leading-tight">{ex.name}</span>
        <span className="text-[9px] font-bold text-[#3A5060] uppercase tracking-wider mt-0.5">{ex.muscleGroup}</span>
      </div>
      {ex.lastSession && (
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black text-[#8892A4]">{ex.lastSession.weight}kg × {ex.lastSession.reps}</span>
          <span className="text-[8px] font-bold text-[#3A5060] uppercase tracking-widest">{ex.lastSession.date}</span>
        </div>
      )}
      <div className="w-8 h-8 rounded-full bg-[#00D4FF]/10 flex items-center justify-center text-[#00D4FF] ml-1">
        <Plus className="w-4 h-4" />
      </div>
    </button>
  );
};
