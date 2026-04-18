import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Plus, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FitnessBadge, MUSCLE_COLORS, muscleToGlyph } from './FitnessIcons';
import { addCustomExercise, getExerciseLibraryByGroup } from '../lib/supabaseData';

interface ExercisePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exerciseName: string) => void;
}

const MUSCLE_GROUPS = [
  { id: 'Chest' },
  { id: 'Back' },
  { id: 'Shoulders' },
  { id: 'Biceps' },
  { id: 'Triceps' },
  { id: 'Legs' },
  { id: 'Core' },
  { id: 'Cardio' },
];

export const ExercisePicker: React.FC<ExercisePickerProps> = ({ isOpen, onClose, onSelect }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [exercises, setExercises] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedGroup(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (step === 2 && selectedGroup) {
      fetchExercises(selectedGroup);
    }
  }, [step, selectedGroup]);

  const fetchExercises = async (group: string) => {
    setLoading(true);
    if (!user) {
      setExercises([]);
      setLoading(false);
      return;
    }
    const data = await getExerciseLibraryByGroup(user.id, group);
    
    setExercises(data || []);
    setLoading(false);
  };

  const handleAddCustom = async () => {
    if (!searchQuery || !selectedGroup || !user) return;
    
    const data = await addCustomExercise(user.id, searchQuery, selectedGroup);

    if (data) {
      onSelect(data.name);
      onClose();
    }
  };

  const filteredExercises = exercises.filter(ex => 
    ex.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 h-[80vh] bg-[#1A1A1A] rounded-t-3xl border-t border-white/10 z-50 flex flex-col"
          >
            <div className="p-4 flex justify-between items-center border-b border-white/5">
              {step === 2 ? (
                <button onClick={() => setStep(1)} className="text-[var(--accent)] text-sm font-medium">
                  Back
                </button>
              ) : (
                <div className="w-10" /> // Spacer
              )}
              <h2 className="text-lg font-bold text-white">
                {step === 1 ? 'Select Muscle Group' : selectedGroup}
              </h2>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {step === 1 ? (
                <div className="grid grid-cols-2 gap-3">
                  {MUSCLE_GROUPS.map(group => (
                    <button
                      key={group.id}
                      onClick={() => {
                        setSelectedGroup(group.id);
                        setStep(2);
                      }}
                      className="bg-black border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center space-y-2 hover:border-[var(--accent)]/50 transition-colors"
                    >
                      <FitnessBadge
                        name={muscleToGlyph(group.id)}
                        color={MUSCLE_COLORS[group.id] || 'var(--accent)'}
                        size={42}
                      />
                      <span className="text-white font-medium">{group.id}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search exercises..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {loading ? (
                    <div className="space-y-2">
                      {[1,2,3].map(i => <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse"></div>)}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredExercises.map(ex => (
                        <button
                          key={ex.id}
                          onClick={() => {
                            onSelect(ex.name);
                            onClose();
                          }}
                          className="w-full flex items-center justify-between p-4 bg-black border border-white/5 rounded-xl hover:border-[var(--accent)]/30 transition-colors"
                        >
                          <span className="text-white font-medium">{ex.name}</span>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        </button>
                      ))}
                      
                      {searchQuery && !filteredExercises.some(e => e.name.toLowerCase() === searchQuery.toLowerCase()) && (
                        <button
                          onClick={handleAddCustom}
                          className="w-full flex items-center justify-center space-x-2 p-4 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="font-medium">Add "{searchQuery}"</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
