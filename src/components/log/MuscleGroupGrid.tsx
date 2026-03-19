import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface MuscleGroupGridProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

const MUSCLES = [
  { id: 'Chest', label: 'Chest', icon: '💪', color: '#F09595' },
  { id: 'Back', label: 'Back', icon: '🏋️', color: '#5DCAA5' },
  { id: 'Shoulders', label: 'Shoulders', icon: '🔺', color: '#AFA9EC' },
  { id: 'Biceps', label: 'Biceps', icon: '💪', color: '#85B7EB' },
  { id: 'Triceps', label: 'Triceps', icon: '🔽', color: '#AFA9EC' },
  { id: 'Legs', label: 'Legs', icon: '🦵', color: '#EF9F27' },
  { id: 'Core', label: 'Core', icon: '⬡', color: '#00D4FF' },
  { id: 'Cardio', label: 'Cardio', icon: '🏃', color: '#4FC3F7' },
  { id: 'Full Body', label: 'Full Body', icon: '✦', color: '#888888' },
];

export const MuscleGroupGrid: React.FC<MuscleGroupGridProps> = ({ selected, onChange }) => {
  const toggleMuscle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(m => m !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {MUSCLES.map((m, i) => {
          const isSelected = selected.includes(m.id);
          return (
            <motion.button
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => toggleMuscle(m.id)}
              className={`relative flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 min-h-[88px] ${
                isSelected 
                  ? 'bg-[var(--bg-elevated)] border-[var(--accent)]' 
                  : 'bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--text-muted)]'
              }`}
              style={{
                backgroundColor: isSelected ? `color-mix(in srgb, ${m.color} 15%, var(--bg-surface))` : undefined,
                borderColor: isSelected ? m.color : undefined
              }}
            >
              <span className="text-2xl mb-1">{m.icon}</span>
              <span className="text-[10px] font-medium text-[var(--text-primary)]">{m.label}</span>
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: m.color }}>
                  <Check className="w-2.5 h-2.5 text-black" />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
      
      {selected.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-wrap gap-1.5 justify-center p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl"
        >
          {selected.map(s => {
            const m = MUSCLES.find(x => x.id === s);
            return (
              <span key={s} className="text-[10px] px-2 py-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)]">
                {m?.icon} {s}
              </span>
            );
          })}
        </motion.div>
      )}
    </div>
  );
};
