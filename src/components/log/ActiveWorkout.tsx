import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Check, X, Plus, ChevronLeft, ChevronRight, Clock, Activity, Trash2 } from 'lucide-react';
import { WorkoutState, ExerciseEntry, Set } from '../../pages/Log';
import { ExerciseTabBar } from './ExerciseTabBar';
import { ExerciseContent } from './ExerciseContent';
import { RestTimer } from './RestTimer';
import { ExercisePicker } from './ExercisePicker';
import { WeightRepsModal } from './WeightRepsModal';

interface ActiveWorkoutProps {
  workout: WorkoutState;
  setWorkout: React.Dispatch<React.SetStateAction<WorkoutState | null>>;
  onFinish: () => void;
}

export const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({
  workout,
  setWorkout,
  onFinish,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [activeRestTimer, setActiveRestTimer] = useState<{ duration: number; exerciseName: string } | null>(null);
  const [weightRepsModal, setWeightRepsModal] = useState<{ 
    setId: string; 
    field: 'weight' | 'reps'; 
    currentValue: number;
    exerciseName: string;
    setNumber: number;
  } | null>(null);

  // Timer logic
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setWorkout(prev => {
        if (!prev) return null;
        return { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, setWorkout]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentExercise = workout.exercises[activeIndex];

  const handleUpdateSet = (setId: string, field: 'weight' | 'reps', value: number) => {
    setWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(ex => ({
          ...ex,
          sets: ex.sets.map(s => s.id === setId ? { ...s, [field]: value } : s)
        }))
      };
    });
  };

  const handleMarkSetDone = (setId: string) => {
    const ex = workout.exercises.find(e => e.sets.some(s => s.id === setId));
    if (!ex) return;
    
    const set = ex.sets.find(s => s.id === setId);
    if (!set) return;

    const isMarkingDone = !set.done;

    setWorkout(prev => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map(e => e.id === ex.id ? {
          ...e,
          sets: e.sets.map(s => s.id === setId ? { ...s, done: isMarkingDone } : s)
        } : e)
      };
    });

    if (isMarkingDone) {
      setActiveRestTimer({ duration: 90, exerciseName: ex.name });
      if (navigator.vibrate) {
        try { navigator.vibrate([10, 30, 10]); } catch (e) {}
      }
    }
  };

  const handleAddSet = () => {
    setWorkout(prev => {
      if (!prev) return null;
      const newExercises = [...prev.exercises];
      const ex = newExercises[activeIndex];
      const lastSet = ex.sets[ex.sets.length - 1];
      const newSet: Set = {
        id: Math.random().toString(36).substr(2, 9),
        weight: lastSet?.weight || 0,
        reps: lastSet?.reps || 0,
        done: false
      };
      ex.sets.push(newSet);
      return { ...prev, exercises: newExercises };
    });
  };

  const handleAddExercise = (ex: any) => {
    const newEntry: ExerciseEntry = {
      id: Math.random().toString(36).substr(2, 9),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      sets: [
        { id: Math.random().toString(36).substr(2, 9), weight: ex.lastSession?.weight || 0, reps: ex.lastSession?.reps || 0, done: false },
        { id: Math.random().toString(36).substr(2, 9), weight: ex.lastSession?.weight || 0, reps: ex.lastSession?.reps || 0, done: false },
        { id: Math.random().toString(36).substr(2, 9), weight: ex.lastSession?.weight || 0, reps: ex.lastSession?.reps || 0, done: false },
      ],
      lastSession: ex.lastSession
    };
    setWorkout(prev => {
      if (!prev) return null;
      return { ...prev, exercises: [...prev.exercises, newEntry] };
    });
    setActiveIndex(workout.exercises.length);
    setShowExercisePicker(false);
  };

  const handleDeleteExercise = () => {
    if (window.confirm('Remove this exercise?')) {
      setWorkout(prev => {
        if (!prev) return null;
        const newEx = prev.exercises.filter((_, i) => i !== activeIndex);
        return { ...prev, exercises: newEx };
      });
      setActiveIndex(Math.max(0, activeIndex - 1));
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#0D1117] flex flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="h-[56px] flex items-center justify-between px-4 bg-[#0D1117] border-b border-[#1E2F42]">
        <div className="flex flex-col">
          <h1 className="text-[14px] font-black text-[#E2E8F0] tracking-tight leading-none mb-1 uppercase">{workout.title}</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#00D4FF]" />
              <span className="text-[11px] font-bold text-[#00D4FF] tabular-nums">{formatTime(workout.elapsedSeconds)}</span>
            </div>
            <button onClick={() => setIsPaused(!isPaused)} className="text-[#3A5060] hover:text-[#00D4FF] transition-colors">
              {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
            </button>
          </div>
        </div>
        <button 
          onClick={onFinish}
          className="h-8 px-4 bg-[#00D4FF] text-black text-[11px] font-black rounded-full uppercase tracking-wider active:scale-95 transition-transform"
        >
          Finish
        </button>
      </div>

      {/* Exercise Tab Bar */}
      <ExerciseTabBar 
        exercises={workout.exercises}
        activeIndex={activeIndex}
        onTabClick={setActiveIndex}
        onAddExercise={() => setShowExercisePicker(true)}
      />

      {/* Main Content */}
      {currentExercise ? (
          <ExerciseContent 
            exercise={currentExercise}
            onUpdateSet={handleUpdateSet}
            onMarkSetDone={handleMarkSetDone}
            onAddSet={handleAddSet}
            onOpenModal={(setId, field, currentValue) => {
              const setIndex = currentExercise.sets.findIndex(s => s.id === setId);
              setWeightRepsModal({ 
                setId, 
                field, 
                currentValue, 
                exerciseName: currentExercise.name,
                setNumber: setIndex + 1
              });
            }}
            onSwipeLeft={() => activeIndex < workout.exercises.length - 1 && setActiveIndex(activeIndex + 1)}
            onSwipeRight={() => activeIndex > 0 && setActiveIndex(activeIndex - 1)}
          />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Activity className="w-12 h-12 text-[#1E2F42] mb-4" />
          <h3 className="text-[16px] font-black text-[#8892A4] mb-2">NO EXERCISES YET</h3>
          <p className="text-[12px] text-[#3A5060] mb-6">Add your first exercise to start tracking your progress.</p>
          <button 
            onClick={() => setShowExercisePicker(true)}
            className="h-11 px-8 bg-[#141C28] border border-[#1E2F42] text-[#00D4FF] text-[12px] font-black rounded-xl uppercase tracking-widest active:scale-95 transition-transform"
          >
            + Add Exercise
          </button>
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="h-[48px] bg-[#0D1117] border-t border-[#1E2F42] flex items-center justify-between px-4">
        <button 
          onClick={handleDeleteExercise}
          className="p-2 text-[#3A5060] hover:text-[#EF4444] transition-colors"
          disabled={!currentExercise}
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => activeIndex > 0 && setActiveIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            className={`p-2 transition-colors ${activeIndex === 0 ? 'text-[#1E2F42]' : 'text-[#8892A4] hover:text-white'}`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-[10px] font-bold text-[#3A5060] uppercase tracking-widest">
            {activeIndex + 1} / {workout.exercises.length}
          </span>
          <button 
            onClick={() => activeIndex < workout.exercises.length - 1 && setActiveIndex(activeIndex + 1)}
            disabled={activeIndex === workout.exercises.length - 1}
            className={`p-2 transition-colors ${activeIndex === workout.exercises.length - 1 ? 'text-[#1E2F42]' : 'text-[#8892A4] hover:text-white'}`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="w-8" /> {/* Spacer */}
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {activeRestTimer && (
          <RestTimer 
            duration={activeRestTimer.duration}
            exerciseName={activeRestTimer.exerciseName}
            onComplete={() => setActiveRestTimer(null)}
            onSkip={() => setActiveRestTimer(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showExercisePicker && (
          <ExercisePicker 
            onSelect={handleAddExercise}
            onClose={() => setShowExercisePicker(false)}
            recentExercises={[]} // In a real app, pass recent exercises
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {weightRepsModal && (
          <WeightRepsModal 
            onClose={() => setWeightRepsModal(null)}
            onConfirm={(val) => {
              handleUpdateSet(weightRepsModal.setId, weightRepsModal.field, val);
              setWeightRepsModal(null);
            }}
            initialValue={weightRepsModal.currentValue}
            field={weightRepsModal.field}
            exerciseName={weightRepsModal.exerciseName}
            setNumber={weightRepsModal.setNumber}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
