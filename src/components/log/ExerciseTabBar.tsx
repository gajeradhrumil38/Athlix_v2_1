import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { ExerciseEntry } from '../../pages/Log';

interface ExerciseTabBarProps {
  exercises: ExerciseEntry[];
  activeIndex: number;
  onTabClick: (index: number) => void;
  onAddExercise: () => void;
}

export const ExerciseTabBar: React.FC<ExerciseTabBarProps> = ({
  exercises,
  activeIndex,
  onTabClick,
  onAddExercise,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const activeTab = scrollRef.current.children[activeIndex] as HTMLElement;
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeIndex]);

  const getMuscleColor = (muscle: string) => {
    const colors: Record<string, string> = {
      'Chest': '#C45A7A',
      'Back': '#5A7AC4',
      'Shoulders': '#C49A5A',
      'Biceps': '#7AC45A',
      'Triceps': '#5AC49A',
      'Legs': '#9A5AC4',
      'Abs': '#C4C45A',
      'Cardio': '#5AC4C4',
    };
    return colors[muscle] || '#8892A4';
  };

  return (
    <div className="h-[44px] flex-shrink-0 flex items-center bg-[#0D1117] border-b border-[#1E2F42] px-2.5 overflow-hidden">
      <div 
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto no-scrollbar h-full pt-2"
      >
        {exercises.map((ex, i) => {
          const isActive = activeIndex === i;
          const doneSets = ex.sets.filter(s => s.done).length;
          const totalSets = ex.sets.length;
          const isAllDone = doneSets === totalSets && totalSets > 0;
          const color = getMuscleColor(ex.muscleGroup);

          return (
            <button
              key={ex.id}
              onClick={() => onTabClick(i)}
              className={`inline-flex flex-col items-center px-3 py-1.5 mr-1 rounded-t-lg min-w-fit cursor-pointer transition-all border-x border-t ${isActive ? 'bg-[#141C28] border-[#1E2F42] border-b-transparent' : 'bg-transparent border-transparent'}`}
            >
              <span 
                className={`text-[9px] font-bold uppercase tracking-wider ${isActive ? '' : 'text-[#8892A4]'}`}
                style={{ color: isActive ? color : undefined }}
              >
                {ex.name.length > 12 ? ex.name.substring(0, 10) + '..' : ex.name}
              </span>
              <span className={`text-[7px] font-bold tracking-[0.5px] mt-0.5 ${isAllDone ? 'text-[#5DCAA5]' : doneSets > 0 ? 'text-[#00D4FF]' : 'text-[#3A5060]'}`}>
                {doneSets}/{totalSets} SETS
              </span>
            </button>
          );
        })}
      </div>

      <button 
        onClick={onAddExercise}
        className="w-7 h-7 rounded-full bg-[#1A2538] border border-[#1E2F42] text-[#00D4FF] flex items-center justify-center ml-2 active:scale-90 transition-transform"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
