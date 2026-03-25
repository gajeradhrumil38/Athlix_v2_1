import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Trophy, Clock, Weight, Activity } from 'lucide-react';
import { WorkoutState } from '../../pages/Log';

interface FinishSheetProps {
  workout: WorkoutState;
  onConfirm: (title: string, notes: string) => void;
  onCancel: () => void;
}

export const FinishSheet: React.FC<FinishSheetProps> = ({ workout, onConfirm, onCancel }) => {
  const [title, setTitle] = useState(workout.title);
  const [notes, setNotes] = useState('');

  const totalSets = (workout.exercises || []).reduce((acc, ex) => acc + (ex.sets || []).filter(s => s.done).length, 0);
  const totalVolume = (workout.exercises || []).reduce((acc, ex) => 
    acc + (ex.sets || []).filter(s => s.done).reduce((v, s) => v + (Number(s.weight || 0) * Number(s.reps || 0)), 0), 0);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-[480px] bg-[#0D1117] rounded-t-[24px] flex flex-col border-t border-[#1E2F42]"
        style={{ height: '90%' }}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1E2F42] flex items-center justify-between">
          <button onClick={onCancel} className="p-2 text-[#3A5060]">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-[16px] font-bold text-[#E2E8F0]">Finish Workout</h2>
          <div className="w-10" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-[#141C28] border border-[#1E2F42] rounded-2xl">
              <Clock className="w-4 h-4 text-[#00D4FF] mb-2" />
              <div className="text-[20px] font-extrabold text-[#E2E8F0] tabular-nums">{formatTime(workout.elapsedSeconds)}</div>
              <div className="text-[9px] text-[#8892A4] uppercase tracking-wider">Duration</div>
            </div>
            <div className="p-4 bg-[#141C28] border border-[#1E2F42] rounded-2xl">
              <Weight className="w-4 h-4 text-[#00D4FF] mb-2" />
              <div className="text-[20px] font-extrabold text-[#E2E8F0] tabular-nums">{totalVolume.toLocaleString()}kg</div>
              <div className="text-[9px] text-[#8892A4] uppercase tracking-wider">Total Volume</div>
            </div>
            <div className="p-4 bg-[#141C28] border border-[#1E2F42] rounded-2xl">
              <Activity className="w-4 h-4 text-[#00D4FF] mb-2" />
              <div className="text-[20px] font-extrabold text-[#E2E8F0] tabular-nums">{totalSets}</div>
              <div className="text-[9px] text-[#8892A4] uppercase tracking-wider">Total Sets</div>
            </div>
            <div className="p-4 bg-[#141C28] border border-[#1E2F42] rounded-2xl">
              <Trophy className="w-4 h-4 text-[#EF9F27] mb-2" />
              <div className="text-[20px] font-extrabold text-[#E2E8F0] tabular-nums">3</div>
              <div className="text-[9px] text-[#8892A4] uppercase tracking-wider">New PRs</div>
            </div>
          </div>

          {/* Title & Notes */}
          <div className="space-y-4">
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-[1.5px] text-[#3A5060] mb-2">Workout Title</label>
              <input 
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-[#141C28] border border-[#1E2F42] rounded-xl text-[14px] text-[#E2E8F0] focus:outline-none focus:border-[#00D4FF]/50 transition-colors"
                placeholder="Morning Workout"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-[1.5px] text-[#3A5060] mb-2">Notes</label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 bg-[#141C28] border border-[#1E2F42] rounded-xl text-[14px] text-[#E2E8F0] focus:outline-none focus:border-[#00D4FF]/50 transition-colors h-24 resize-none"
                placeholder="How did it feel today?"
              />
            </div>
          </div>

          {/* Exercise Summary */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-[1.5px] text-[#3A5060] mb-3">Exercise Summary</label>
            <div className="space-y-2">
              {(workout.exercises || []).map(ex => (
                <div key={ex.id} className="flex items-center justify-between p-3 bg-[#141C28]/50 rounded-xl">
                  <span className="text-[12px] font-bold text-[#E2E8F0]">{ex.name}</span>
                  <span className="text-[10px] text-[#8892A4]">{(ex.sets || []).filter(s => s.done).length} sets</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="p-6 border-t border-[#1E2F42] bg-[#0D1117]">
          <button 
            onClick={() => onConfirm(title, notes)}
            className="w-full py-4 bg-[#00D4FF] text-black rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            Save Workout <Check className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
