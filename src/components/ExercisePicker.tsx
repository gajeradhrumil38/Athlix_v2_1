import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Plus, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ExercisePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exerciseName: string) => void;
}

const MUSCLE_GROUPS = [
  { id: 'Chest', icon: '🦍' },
  { id: 'Back', icon: '🦅' },
  { id: 'Shoulders', icon: '🏋️' },
  { id: 'Biceps', icon: '💪' },
  { id: 'Triceps', icon: '⚡' },
  { id: 'Legs', icon: '🦿' },
  { id: 'Core', icon: '🧱' },
  { id: 'Cardio', icon: '🏃' },
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
    const { data } = await supabase
      .from('exercise_library')
      .select('*')
      .eq('muscle_group', group)
      .or(`is_custom.eq.false,user_id.eq.${user?.id}`)
      .order('name');
    
    setExercises(data || []);
    setLoading(false);
  };

  const handleAddCustom = async () => {
    if (!searchQuery || !selectedGroup) return;
    
    const { data, error } = await supabase
      .from('exercise_library')
      .insert({
        name: searchQuery,
        muscle_group: selectedGroup,
        is_custom: true,
        user_id: user?.id
      })
      .select()
      .single();

    if (!error && data) {
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
                <button onClick={() => setStep(1)} className="text-[#00D4FF] text-sm font-medium">
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
                      className="bg-black border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center space-y-2 hover:border-[#00D4FF]/50 transition-colors"
                    >
                      <span className="text-2xl">{group.icon}</span>
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
                      className="w-full bg-black border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-[#00D4FF]"
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
                          className="w-full flex items-center justify-between p-4 bg-black border border-white/5 rounded-xl hover:border-[#00D4FF]/30 transition-colors"
                        >
                          <span className="text-white font-medium">{ex.name}</span>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        </button>
                      ))}
                      
                      {searchQuery && !filteredExercises.some(e => e.name.toLowerCase() === searchQuery.toLowerCase()) && (
                        <button
                          onClick={handleAddCustom}
                          className="w-full flex items-center justify-center space-x-2 p-4 bg-[#00D4FF]/10 border border-[#00D4FF]/30 rounded-xl text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors"
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
