import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Plus, History, LayoutGrid, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getExerciseLibraryByGroup, getRecentExerciseOptions, searchExerciseLibrary } from '../../lib/supabaseData';
import { ExerciseImage } from '../shared/ExerciseImage';

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  lastSession?: {
    weight: number;
    reps: number;
    date: string;
  };
}

interface ExercisePickerProps {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
  recentExercises: Exercise[];
}

const MUSCLE_GROUPS = [
  { name: 'Chest', previewExerciseId: 'ot_benchpress' },
  { name: 'Back', previewExerciseId: 'ot_tbarrow' },
  { name: 'Shoulders', previewExerciseId: 'ot_arnoldpress' },
  { name: 'Biceps', previewExerciseId: 'ot_bicepscurl' },
  { name: 'Triceps', previewExerciseId: 'ot_tricepskickback' },
  { name: 'Legs', previewExerciseId: 'ot_legpressx' },
  { name: 'Core', previewExerciseId: 'ot_crunches' },
  { name: 'Cardio', previewExerciseId: '' },
];

export const ExercisePicker: React.FC<ExercisePickerProps> = ({ onSelect, onClose, recentExercises }) => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'recent' | 'muscle' | 'search'>('recent');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [libraryExercises, setLibraryExercises] = useState<Exercise[]>([]);
  const [recentLibraryExercises, setRecentLibraryExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    const loadRecent = async () => {
      if (!user) return;
      const recent = await getRecentExerciseOptions(user.id);
      setRecentLibraryExercises(
        recent.map((exercise, index) => ({
          id: `${exercise.name}-${index}`,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          exercise_db_id: exercise.exercise_db_id || undefined,
          lastSession: exercise.lastSession
            ? {
                weight: exercise.lastSession.weight,
                reps: exercise.lastSession.reps,
                date: exercise.lastSession.date,
              }
            : undefined,
        })),
      );
    };
    void loadRecent();
  }, [user]);

  useEffect(() => {
    const loadList = async () => {
      if (!user) return;

      if (search.trim()) {
        const results = await searchExerciseLibrary(user.id, search);
        setLibraryExercises(
          results.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            muscleGroup: exercise.muscle_group,
            exercise_db_id: exercise.exercise_db_id || undefined,
          })),
        );
        return;
      }

      if (selectedMuscle) {
        const results = await getExerciseLibraryByGroup(user.id, selectedMuscle);
        setLibraryExercises(
          results.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            muscleGroup: exercise.muscle_group,
            exercise_db_id: exercise.exercise_db_id || undefined,
          })),
        );
        return;
      }

      setLibraryExercises([]);
    };

    void loadList();
  }, [user, search, selectedMuscle]);

  const filteredExercises = useMemo(() => libraryExercises, [libraryExercises]);
  const isNestedView = Boolean(search.trim()) || Boolean(selectedMuscle);

  const handleSelect = (exercise: Exercise) => {
    onSelect(exercise);
    onClose();
  };

  const handleBack = () => {
    if (search.trim()) {
      setSearch('');
      setActiveTab(selectedMuscle ? 'muscle' : 'recent');
      return;
    }
    if (selectedMuscle) {
      setSelectedMuscle(null);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="absolute inset-0 mx-auto w-full max-w-[860px] bg-[#0F1623] flex flex-col border-x border-white/10"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
          <button
            onClick={handleBack}
            className="h-9 rounded-lg border border-white/10 bg-[#1A2433] px-3 text-[12px] font-medium text-[#D1DCE7] inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {isNestedView ? 'Back' : 'Close'}
          </button>
          <h2 className="text-[16px] font-semibold text-[#E7EEF6] tracking-tight">Add Exercise</h2>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg border border-white/10 bg-[#1A2433] text-[#9CB1C7] inline-flex items-center justify-center"
            aria-label="Close add exercise"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-2 border-b border-white/5">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#687E95]" />
            <input
              type="text"
              placeholder="Search exercises"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                if (event.target.value) setActiveTab('search');
              }}
              className="w-full h-11 rounded-xl bg-[#161F2C] border border-white/10 pl-10 pr-4 text-[14px] text-white placeholder-[#6F8398] focus:outline-none focus:border-[#3D5067] transition-colors"
            />
          </div>

          <div className="flex gap-2">
            {[
              { id: 'recent', label: 'Recent', icon: History },
              { id: 'muscle', label: 'Muscle', icon: LayoutGrid },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as 'recent' | 'muscle');
                  setSearch('');
                  setSelectedMuscle(null);
                }}
                className={`flex-1 h-10 rounded-xl border text-[12px] font-medium flex items-center justify-center gap-2 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#212E40] border-[#3D5067] text-white'
                    : 'bg-[#161F2C] border-white/10 text-[#9CB1C7]'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+24px)] no-scrollbar">
          {activeTab === 'recent' && !search && (
            <div className="space-y-2">
              {(recentExercises.length > 0 ? recentExercises : recentLibraryExercises).map((exercise) => (
                <ExerciseRow key={exercise.id} exercise={exercise} onSelect={handleSelect} />
              ))}
              {recentExercises.length === 0 && recentLibraryExercises.length === 0 && (
                <div className="text-center py-12 text-[#7D90A6] text-[13px]">No recent exercises</div>
              )}
            </div>
          )}

          {activeTab === 'muscle' && !search && !selectedMuscle && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {MUSCLE_GROUPS.map((muscle) => (
                <button
                  key={muscle.name}
                  onClick={() => setSelectedMuscle(muscle.name)}
                  className="h-24 rounded-2xl border border-white/10 bg-[#161F2C] flex flex-col items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <ExerciseImage
                    exerciseId={muscle.previewExerciseId}
                    exerciseName={muscle.name}
                    muscleGroup={muscle.name}
                    size="sm"
                  />
                  <span className="text-[11px] font-semibold text-[#E3EBF4] uppercase tracking-wide">{muscle.name}</span>
                </button>
              ))}
            </div>
          )}

          {(selectedMuscle || activeTab === 'search') && (
            <div className="space-y-2">
              {selectedMuscle && (
                <button
                  onClick={() => setSelectedMuscle(null)}
                  className="text-[12px] font-medium text-[#C1CFDC] inline-flex items-center gap-1 mb-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to muscle groups
                </button>
              )}

              {filteredExercises.map((exercise) => (
                <ExerciseRow key={exercise.id} exercise={exercise} onSelect={handleSelect} />
              ))}

              {filteredExercises.length === 0 && (
                <div className="text-center py-12 text-[#7D90A6] text-[13px]">No exercises found</div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const ExerciseRow: React.FC<{ exercise: Exercise; onSelect: (exercise: Exercise) => void }> = ({ exercise, onSelect }) => {
  return (
    <button
      onClick={() => onSelect(exercise)}
      className="w-full min-h-[66px] rounded-2xl border border-white/10 bg-[#161F2C] px-3 py-3 flex items-center gap-3 text-left active:scale-[0.995] transition-transform"
    >
      <ExerciseImage
        exerciseId={exercise.exercise_db_id || ''}
        exerciseName={exercise.name}
        muscleGroup={exercise.muscleGroup}
        size="sm"
      />

      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-[#EDF4FB] truncate">{exercise.name}</div>
        <div className="text-[11px] text-[#8DA1B6]">{exercise.muscleGroup}</div>
      </div>

      {exercise.lastSession && (
        <div className="hidden sm:flex flex-col items-end pr-1">
          <span className="text-[11px] text-[#B4C4D4] tabular-nums">
            {exercise.lastSession.weight}kg × {exercise.lastSession.reps}
          </span>
          <span className="text-[10px] text-[#7489A0]">{exercise.lastSession.date}</span>
        </div>
      )}

      <div className="h-8 w-8 rounded-lg border border-white/10 bg-[#202C3C] text-[#D9E4EF] flex items-center justify-center">
        <Plus className="w-4 h-4" />
      </div>
    </button>
  );
};
