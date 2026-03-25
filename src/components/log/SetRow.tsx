import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Check, Trophy } from 'lucide-react';
import { Set } from '../../pages/Log';

interface SetRowProps {
  index: number;
  set: Set;
  isActive: boolean;
  onUpdate: (field: 'weight' | 'reps', value: number) => void;
  onMarkDone: () => void;
  onOpenModal: (field: 'weight' | 'reps') => void;
}

export const SetRow: React.FC<SetRowProps> = ({
  index,
  set,
  isActive,
  onUpdate,
  onMarkDone,
  onOpenModal,
}) => {
  const handleAdjust = (field: 'weight' | 'reps', amount: number) => {
    const current = Number(set[field] || 0);
    onUpdate(field, Math.max(0, current + amount));
    if (navigator.vibrate) {
      try { navigator.vibrate(8); } catch (e) {}
    }
  };

  const getRowBg = () => {
    if (set.done) return 'rgba(0,212,255,0.1)';
    if (isActive) return 'rgba(0,212,255,0.05)';
    return 'transparent';
  };

  const getRowBorder = () => {
    if (set.done) return '0.5px solid rgba(0,212,255,0.3)';
    if (isActive) return '0.5px solid rgba(0,212,255,0.4)';
    return '0.5px solid transparent';
  };

  return (
    <div 
      className="grid grid-cols-[24px_1fr_1fr_36px] gap-1 mb-1 items-center p-1 rounded-lg transition-all"
      style={{ background: getRowBg(), border: getRowBorder() }}
    >
      {/* Set Number */}
      <div className="flex items-center justify-center">
        <div 
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${set.done ? 'bg-[#00D4FF]/20 text-[#00D4FF]' : isActive ? 'bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]' : 'bg-transparent text-[#3A5060]'}`}
        >
          {index}
        </div>
      </div>

      {/* Weight Cell */}
      <div className={`h-11 rounded-lg flex flex-col items-center justify-center overflow-hidden transition-all ${set.done ? 'bg-[#141C28]/50' : isActive ? 'bg-[#141C28]' : 'bg-[#141C28]/30 border border-[#1E2F42]'}`}>
        <div className="flex items-center justify-between w-full px-1">
          <button 
            onClick={() => handleAdjust('weight', -2.5)}
            className={`p-1 active:scale-90 transition-transform ${isActive || set.done ? 'text-[#00D4FF]' : 'text-[#3A5060]'}`}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button 
            onClick={() => onOpenModal('weight')}
            className={`text-[14px] font-black tabular-nums ${isActive || set.done ? 'text-[#00D4FF]' : 'text-[#8892A4]'}`}
          >
            {set.weight || 0}
          </button>
          <button 
            onClick={() => handleAdjust('weight', 2.5)}
            className={`p-1 active:scale-90 transition-transform ${isActive || set.done ? 'text-[#00D4FF]' : 'text-[#3A5060]'}`}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <span className="text-[7px] font-bold text-[#3A5060] uppercase tracking-widest -mt-1">kg</span>
      </div>

      {/* Reps Cell */}
      <div className={`h-11 rounded-lg flex flex-col items-center justify-center overflow-hidden transition-all ${set.done ? 'bg-[#141C28]/50' : isActive ? 'bg-[#141C28]' : 'bg-[#141C28]/30 border border-[#1E2F42]'}`}>
        <div className="flex items-center justify-between w-full px-1">
          <button 
            onClick={() => handleAdjust('reps', -1)}
            className={`p-1 active:scale-90 transition-transform ${isActive || set.done ? 'text-[#00D4FF]' : 'text-[#3A5060]'}`}
          >
            <Minus className="w-3 h-3" />
          </button>
          <button 
            onClick={() => onOpenModal('reps')}
            className={`text-[14px] font-black tabular-nums ${isActive || set.done ? 'text-[#00D4FF]' : 'text-[#8892A4]'}`}
          >
            {set.reps || 0}
          </button>
          <button 
            onClick={() => handleAdjust('reps', 1)}
            className={`p-1 active:scale-90 transition-transform ${isActive || set.done ? 'text-[#00D4FF]' : 'text-[#3A5060]'}`}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <span className="text-[7px] font-bold text-[#3A5060] uppercase tracking-widest -mt-1">reps</span>
      </div>

      {/* Done Button */}
      <div className="flex items-center justify-center">
        <button 
          onClick={onMarkDone}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${set.done ? 'bg-[#00D4FF] text-black' : 'bg-[#1A2538] border border-[#1E2F42] text-[#3A5060]'}`}
        >
          <AnimatePresence mode="wait">
            {set.done ? (
              <motion.div
                key="done"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.2, opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <Check className="w-5 h-5" />
              </motion.div>
            ) : (
              <div key="pending" className="w-4 h-4 rounded-full border border-[#3A5060]" />
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
};
