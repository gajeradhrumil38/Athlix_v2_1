import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Check, X } from 'lucide-react';
import { ExerciseEntry } from './ExerciseBlock';
import { StepIndicator } from './StepIndicator';
import { useExerciseDB } from '../../hooks/useExerciseDB';
import { ExerciseImage } from '../shared/ExerciseImage';

interface ExercisePickerProps {
  selectedMuscles: string[];
  onSelect: (exercises: ExerciseEntry[]) => void;
}

export const ExercisePicker: React.FC<ExercisePickerProps> = ({ selectedMuscles, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [selectedExercises, setSelectedExercises] = useState<any[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  
  const { searchExercises, mapToAthlix } = useExerciseDB();

  const filteredExercises = useMemo(() => {
    // Search using the hook
    const results = searchExercises(searchQuery);
    
    // Filter by muscle group
    return results.filter(ex => {
      const athlixMuscle = mapToAthlix(ex.primaryMuscles);
      const matchesFilter = activeFilter === 'All' || athlixMuscle === activeFilter;
      return matchesFilter;
    });
  }, [searchQuery, activeFilter, searchExercises, mapToAthlix]);

  const toggleExercise = (ex: any) => {
    setSelectedExercises(prev => {
      const exists = prev.find(e => e.id === ex.id);
      if (exists) return prev.filter(e => e.id !== ex.id);
      return [...prev, ex];
    });
  };

  const handleContinue = () => {
    if (selectedExercises.length > 0) {
      const formatted = selectedExercises.map(ex => ({
        id: Math.random().toString(36).substr(2, 9),
        name: ex.name,
        muscleGroup: mapToAthlix(ex.primaryMuscles),
        exercise_db_id: ex.id,
        sets: [{ id: Math.random().toString(36).substr(2, 9), weight: null, reps: null, done: false }]
      }));
      onSelect(formatted);
    }
  };

  return (
    <div className="flex flex-col h-screen -mx-4">
      
      {/* STICKY TOP — step indicator + filter tabs + search */}
      <div className="flex-shrink-0">
        <StepIndicator currentStep={3} />
        
        {/* Filter tabs - horizontal scroll */}
        <div className="flex gap-2 px-3 py-2 overflow-x-auto no-scrollbar">
          {['All', ...selectedMuscles].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className="flex-shrink-0 text-[9px] font-bold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: activeFilter === tab 
                  ? 'rgba(0,212,255,0.15)' 
                  : 'var(--bg-elevated)',
                color: activeFilter === tab 
                  ? 'var(--accent)' 
                  : 'var(--text-muted)',
                border: activeFilter === tab 
                  ? '0.5px solid rgba(0,212,255,0.4)' 
                  : '0.5px solid var(--border)',
                letterSpacing: '0.8px'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors"
          style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border)' }}>
          <Search className="w-4 h-4" style={{ color:'var(--text-muted)' }} />
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search exercises..."
            className="flex-1 bg-transparent text-[12px] outline-none"
            style={{ color:'var(--text-primary)' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <X className="w-3 h-3" style={{ color:'var(--text-muted)' }} />
            </button>
          )}
        </div>
      </div>

      {/* SCROLLABLE MIDDLE — exercise list only */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
        {filteredExercises.map((ex, i) => {
          const isSelected = selectedExercises.some(e => e.id === ex.id);
          const athlixMuscle = mapToAthlix(ex.primaryMuscles);
          
          return (
            <motion.button
              key={ex.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => toggleExercise(ex)}
              className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-left transition-colors"
              style={{
                background: isSelected
                  ? '#0E1E2E'
                  : 'var(--bg-surface)',
                border: isSelected
                  ? '0.5px solid rgba(0,212,255,0.3)'
                  : '0.5px solid var(--border)'
              }}
            >
              <div className="flex items-center gap-3">
                <ExerciseImage 
                  exerciseId={ex.id} 
                  exerciseName={ex.name} 
                  muscleGroup={athlixMuscle} 
                  size="md" 
                  showToggle={true} 
                />
                <div>
                  <div className="text-[12px] font-semibold"
                    style={{ color:'var(--text-primary)' }}>
                    {ex.name}
                  </div>
                  <div className="text-[10px] mt-0.5"
                    style={{ color:'var(--text-muted)' }}>
                    {athlixMuscle}
                  </div>
                </div>
              </div>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-3 transition-colors"
                style={{
                  background: isSelected
                    ? 'var(--accent)'
                    : 'var(--accent-dim)',
                  border: '0.5px solid rgba(0,212,255,0.4)'
                }}
              >
                {isSelected
                  ? <Check className="w-3.5 h-3.5 text-black" />
                  : <Plus className="w-3.5 h-3.5" style={{ color:'var(--accent)' }} />
                }
              </div>
            </motion.button>
          );
        })}

        {/* Add custom exercise */}
        <button
          onClick={() => setShowCustomInput(true)}
          className="w-full py-3 rounded-xl text-[10px] text-center transition-colors"
          style={{
            color: 'var(--text-muted)',
            border: '0.5px dashed var(--border)',
            background: 'transparent'
          }}
        >
          + Add custom exercise
        </button>
      </div>

      {/* STICKY BOTTOM — always visible CTA */}
      <div
        className="flex-shrink-0 px-3 py-3 pb-safe"
        style={{
          background: 'var(--bg-base)',
          borderTop: '0.5px solid var(--border)'
        }}
      >
        {/* Selected count preview */}
        {selectedExercises.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-2">
            {selectedExercises.slice(0, 3).map(e => (
              <span key={e.name}
                className="text-[9px] px-2 py-0.5 rounded-lg"
                style={{
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  border: '0.5px solid rgba(0,212,255,0.2)'
                }}>
                {e.name}
              </span>
            ))}
            {selectedExercises.length > 3 && (
              <span className="text-[9px]" style={{ color:'var(--text-muted)' }}>
                +{selectedExercises.length - 3} more
              </span>
            )}
          </div>
        )}

        <button
          onClick={handleContinue}
          disabled={selectedExercises.length === 0}
          className="w-full py-3 rounded-xl text-[13px] font-extrabold tracking-wide transition-opacity"
          style={{
            background: selectedExercises.length > 0
              ? 'var(--accent)'
              : 'var(--bg-elevated)',
            color: selectedExercises.length > 0
              ? '#000'
              : 'var(--text-muted)',
            opacity: selectedExercises.length > 0 ? 1 : 0.4,
            cursor: selectedExercises.length > 0 ? 'pointer' : 'not-allowed'
          }}
        >
          {selectedExercises.length > 0
            ? `Start Logging ${selectedExercises.length} Exercise${selectedExercises.length > 1 ? 's' : ''} →`
            : 'Select at least 1 exercise'
          }
        </button>
      </div>

    </div>
  );
};
