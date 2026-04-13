import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import type { ExerciseEntry } from '../../legacy-pages/Log';

interface ExerciseTabBarProps {
  exercises: ExerciseEntry[];
  activeIndex: number;
  onTabClick: (index: number) => void;
  onAddExercise: () => void;
  showAddButton?: boolean;
}

export const ExerciseTabBar: React.FC<ExerciseTabBarProps> = ({
  exercises,
  activeIndex,
  onTabClick,
  onAddExercise,
  showAddButton = true,
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

  return (
    <div className="h-[48px] flex-shrink-0 flex items-center bg-[#0B1019] border-b border-white/10 px-3 overflow-hidden">
      <div 
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto no-scrollbar h-full"
      >
        {exercises.map((ex, i) => {
          const isActive = activeIndex === i;
          const doneSets = ex.sets.filter(s => s.done).length;
          const totalSets = ex.sets.length;

          return (
            <button
              key={ex.id}
              onClick={() => onTabClick(i)}
              className={`inline-flex flex-col items-center px-3 py-1.5 mr-2 rounded-xl min-w-fit cursor-pointer transition-all border ${
                isActive
                  ? 'bg-[#161F2D] border-[#334258]'
                  : 'bg-transparent border-transparent'
              }`}
            >
              <span 
                className={`text-[9px] font-semibold uppercase tracking-wider ${
                  isActive ? 'text-[#E2E8F0]' : 'text-[#8B9CAF]'
                }`}
              >
                {ex.name.length > 12 ? ex.name.substring(0, 10) + '..' : ex.name}
              </span>
              <span className="text-[7px] font-semibold tracking-[0.5px] mt-0.5 text-[#73859B]">
                {doneSets}/{totalSets} SETS
              </span>
            </button>
          );
        })}
      </div>

      {showAddButton && (
        <button 
          onClick={onAddExercise}
          className="w-8 h-8 rounded-full bg-[#1A2433] border border-white/10 text-[#B6C5D6] flex items-center justify-center ml-2 active:scale-90 transition-transform"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
