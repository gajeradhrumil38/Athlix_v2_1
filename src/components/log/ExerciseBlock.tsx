import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Check } from 'lucide-react';
import { ExerciseImage } from '../shared/ExerciseImage';

export interface SetRow {
  id: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
}

export interface ExerciseEntry {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  sets: SetRow[];
}

interface ExerciseBlockProps {
  exercise: ExerciseEntry;
  onUpdateSet: (exId: string, setId: string, field: 'weight' | 'reps', value: number | null) => void;
  onAddSet: (exId: string) => void;
  onSetDone: (exId: string, setId: string) => void;
  index: number;
}

export const ExerciseBlock: React.FC<ExerciseBlockProps> = ({ exercise, onUpdateSet, onAddSet, onSetDone, index }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl overflow-hidden mb-4"
    >
      <div className="p-3 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-elevated)]/50">
        <div className="flex items-center gap-3">
          {exercise.exercise_db_id && (
            <ExerciseImage 
              exerciseId={exercise.exercise_db_id} 
              exerciseName={exercise.name} 
              muscleGroup={exercise.muscleGroup} 
              size="sm" 
            />
          )}
          <div>
            <h3 className="text-[14px] font-bold text-[var(--text-primary)]">{exercise.name}</h3>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Previous: 60kg · 3x10</p>
          </div>
        </div>
        <div className="text-[10px] px-2 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)]">
          {exercise.muscleGroup}
        </div>
      </div>

      <div className="p-2">
        <div className="grid grid-cols-[30px_1fr_1fr_1fr_40px] gap-2 px-2 py-1.5 mb-1">
          <div className="text-[9px] font-semibold text-[var(--text-muted)] tracking-wider text-center">SET</div>
          <div className="text-[9px] font-semibold text-[var(--text-muted)] tracking-wider text-center">KG</div>
          <div className="text-[9px] font-semibold text-[var(--text-muted)] tracking-wider text-center">REPS</div>
          <div className="text-[9px] font-semibold text-[var(--text-muted)] tracking-wider text-center">VOL</div>
          <div className="text-[9px] font-semibold text-[var(--text-muted)] tracking-wider text-center">DONE</div>
        </div>

        {exercise.sets.map((set, i) => {
          const vol = (set.weight || 0) * (set.reps || 0);
          return (
            <div 
              key={set.id} 
              className={`grid grid-cols-[30px_1fr_1fr_1fr_40px] gap-2 px-2 py-1.5 items-center rounded-lg mb-1 transition-colors ${
                set.done ? 'bg-[var(--accent-dim)] border border-[var(--accent)]/30' : 'bg-transparent border border-transparent'
              }`}
            >
              <div className="text-[12px] font-bold text-[var(--text-muted)] text-center">{i + 1}</div>
              
              <input 
                type="number" 
                value={set.weight || ''} 
                onChange={(e) => onUpdateSet(exercise.id, set.id, 'weight', e.target.value ? Number(e.target.value) : null)}
                className="w-full h-8 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md text-center text-[13px] font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                placeholder="-"
                disabled={set.done}
              />
              
              <input 
                type="number" 
                value={set.reps || ''} 
                onChange={(e) => onUpdateSet(exercise.id, set.id, 'reps', e.target.value ? Number(e.target.value) : null)}
                className="w-full h-8 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md text-center text-[13px] font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                placeholder="-"
                disabled={set.done}
              />
              
              <div className="text-[12px] font-medium text-[var(--text-secondary)] text-center">
                {vol > 0 ? vol : '-'}
              </div>
              
              <button 
                onClick={() => onSetDone(exercise.id, set.id)}
                className={`w-8 h-8 mx-auto rounded-md flex items-center justify-center transition-colors ${
                  set.done ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:text-white'
                }`}
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        <button 
          onClick={() => onAddSet(exercise.id)}
          className="w-full mt-2 py-2 flex items-center justify-center gap-1 text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Set
        </button>
      </div>
    </motion.div>
  );
};
