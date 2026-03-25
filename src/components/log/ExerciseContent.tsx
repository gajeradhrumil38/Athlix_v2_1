import React, { useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trophy, Activity, Weight, Clock } from 'lucide-react';
import { ExerciseEntry, Set } from '../../pages/Log';
import { SetRow } from './SetRow';

interface ExerciseContentProps {
  exercise: ExerciseEntry;
  onUpdateSet: (setId: string, field: 'weight' | 'reps', value: number) => void;
  onMarkSetDone: (setId: string) => void;
  onAddSet: () => void;
  onOpenModal: (setId: string, field: 'weight' | 'reps', currentValue: number) => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

export const ExerciseContent: React.FC<ExerciseContentProps> = ({
  exercise,
  onUpdateSet,
  onMarkSetDone,
  onAddSet,
  onOpenModal,
  onSwipeLeft,
  onSwipeRight,
}) => {
  const touchStart = useRef<number>(0);
  const touchEnd = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStart.current - touchEnd.current;
    if (diff > 50) onSwipeLeft();
    if (diff < -50) onSwipeRight();
  };

  const activeSetIndex = exercise.sets.findIndex(s => !s.done);
  const currentSetId = activeSetIndex !== -1 ? exercise.sets[activeSetIndex].id : null;

  const exerciseVolume = useMemo(() => 
    exercise.sets
      .filter(s => s.done)
      .reduce((sum, s) => sum + (Number(s.weight || 0) * Number(s.reps || 0)), 0)
  , [exercise.sets]);

  const vsLastSession = exerciseVolume - (exercise.lastSession?.weight || 0) * (exercise.lastSession?.reps || 0);

  return (
    <div 
      className="flex-1 overflow-y-auto bg-[#141C28] p-2.5 flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Last Session Row */}
      <div className="w-full bg-[#0a1520] border border-[#1E2F42] rounded-lg p-2.5 mb-2 flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-[#3A5060] uppercase tracking-[0.8px] mb-0.5">
            LAST SESSION · {exercise.lastSession?.date || 'N/A'}
          </span>
          <span className="text-[10px] font-bold text-[#8892A4]">
            {exercise.lastSession ? `${exercise.lastSession.sets}×${exercise.lastSession.reps} @ ${exercise.lastSession.weight}kg · Total ${exercise.lastSession.weight * exercise.lastSession.reps}kg` : 'No history found'}
          </span>
        </div>
        {exercise.lastSession ? (
          <span className="text-[8px] font-bold text-[#5DCAA5] uppercase tracking-wider">Beat it ›</span>
        ) : (
          <span className="text-[8px] font-bold text-[#00D4FF] uppercase tracking-wider">First time 🎯</span>
        )}
      </div>

      {/* Set Column Headers */}
      <div className="grid grid-cols-[24px_1fr_1fr_36px] gap-1 px-1 mb-1.5">
        <span className="text-[8px] font-bold text-[#3A5060] uppercase tracking-widest text-center">SET</span>
        <span className="text-[8px] font-bold text-[#3A5060] uppercase tracking-widest text-center">KG</span>
        <span className="text-[8px] font-bold text-[#3A5060] uppercase tracking-widest text-center">REPS</span>
        <span className="w-9"></span>
      </div>

      {/* Set Rows */}
      <div className="space-y-1">
        {exercise.sets.map((set, i) => (
          <SetRow 
            key={set.id}
            index={i + 1}
            set={set}
            isActive={set.id === currentSetId}
            onUpdate={(field, value) => onUpdateSet(set.id, field, value)}
            onMarkDone={() => onMarkSetDone(set.id)}
            onOpenModal={(field) => onOpenModal(set.id, field, Number(set[field] || 0))}
          />
        ))}
      </div>

      {/* Add Set Button */}
      <button 
        onClick={onAddSet}
        className="w-full h-9 border-t border-[#1E2F42] mt-1 text-[10px] font-bold text-[#00D4FF]/60 flex items-center justify-center gap-1 active:scale-95 transition-transform"
      >
        <Plus className="w-3 h-3" /> Add Set
      </button>

      {/* Volume Footer */}
      <div className="mt-auto pt-4 border-t border-[#1E2F42] flex justify-between items-center px-1">
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-[#3A5060] uppercase tracking-wider">Done</span>
          <span className="text-[11px] font-black text-[#E2E8F0]">{exercise.sets.filter(s => s.done).length}/{exercise.sets.length}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[8px] font-bold text-[#3A5060] uppercase tracking-wider">Vol kg</span>
          <span className="text-[11px] font-black text-[#E2E8F0]">{exerciseVolume.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-bold text-[#3A5060] uppercase tracking-wider">vs Last</span>
          <span className={`text-[11px] font-black ${vsLastSession >= 0 ? 'text-[#5DCAA5]' : 'text-[#EF4444]'}`}>
            {vsLastSession >= 0 ? '+' : ''}{vsLastSession.toLocaleString()}kg
          </span>
        </div>
      </div>
    </div>
  );
};
