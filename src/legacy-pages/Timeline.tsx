import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Trash2, Calendar as CalendarIcon, Clock, Dumbbell } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useAnimation } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { ExerciseImage } from '../components/shared/ExerciseImage';
import { deleteWorkout, getWorkouts } from '../lib/supabaseData';
import { parseDateAtStartOfDay } from '../lib/dates';

const TimelineItem = ({ workout, isExpanded, setExpandedId, handleDelete, calculateVolume }: any) => {
  const controls = useAnimation();
  const requestDelete = () => {
    return window.confirm(`Delete "${workout.title}"? This cannot be undone.`);
  };

  const bind = useDrag(({ down, movement: [mx], direction: [xDir], velocity: [vx] }) => {
    if (isExpanded) return; // Don't allow swipe when expanded

    const trigger = vx > 0.5 || mx < -100; // Fast swipe or drag past 100px

    if (!down && trigger && xDir < 0) {
      if (!requestDelete()) {
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
        return;
      }

      controls.start({ x: -window.innerWidth, opacity: 0, transition: { duration: 0.2 } }).then(() => {
        handleDelete(workout.id);
      });
    } else if (!down) {
      // Snap back
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
    } else if (mx < 0) {
      // Dragging left
      controls.set({ x: mx });
    }
  }, { axis: 'x', filterTaps: true });

  const volume = calculateVolume(workout.exercises);

  return (
    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active overflow-hidden rounded-2xl">
      {/* Delete Background */}
      <div className="absolute inset-y-0 right-0 w-full bg-red-500/20 flex items-center justify-end pr-8 rounded-2xl z-0">
        <Trash2 className="w-6 h-6 text-red-500" />
      </div>

      {/* Timeline dot */}
      <div className="hidden md:flex items-center justify-center w-10 h-10 rounded-full border-4 border-black bg-[#00D4FF] text-black shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
        <Dumbbell className="w-4 h-4" />
      </div>
      
      {/* Card */}
      <motion.div 
        {...bind()}
        animate={controls}
        className="w-full md:w-[calc(50%-2.5rem)] bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 shadow-sm transition-all hover:border-white/10 z-10 relative touch-pan-y"
      >
        <div 
          className="flex justify-between items-start cursor-pointer"
          onClick={() => setExpandedId(isExpanded ? null : workout.id)}
        >
          <div>
            <div className="flex items-center space-x-2 text-xs text-gray-400 mb-1">
              <CalendarIcon className="w-3 h-3" />
              <span>
                {(() => {
                  const parsedDate = parseDateAtStartOfDay(workout.date);
                  return parsedDate ? format(parsedDate, 'MMM d, yyyy') : '--';
                })()}
              </span>
            </div>
            <h3 className="text-lg font-bold text-white">{workout.title}</h3>
            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> {workout.duration_minutes} min</span>
              <span>{workout.exercises?.length || 0} exercises</span>
              {volume > 0 && <span>{volume} vol</span>}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Show delete button on desktop, hide on mobile where swipe is used */}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (requestDelete()) {
                  handleDelete(workout.id);
                }
              }}
              className="hidden md:block p-2 text-gray-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
            {workout.notes && (
              <p className="text-sm text-gray-400 mb-4 italic">"{workout.notes}"</p>
            )}
            
            <div className="space-y-3">
              {workout.exercises?.sort((a: any, b: any) => a.order_index - b.order_index).map((ex: any) => (
                <div key={ex.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-3">
                    {ex.exercise_db_id && (
                      <ExerciseImage 
                        exerciseId={ex.exercise_db_id} 
                        exerciseName={ex.name} 
                        size="sm" 
                      />
                    )}
                    <span className="text-gray-300 font-medium">{ex.name}</span>
                  </div>
                  <span className="text-gray-500">
                    {ex.sets} × {ex.reps} @ {ex.weight}{ex.unit}
                  </span>
                </div>
              ))}
            </div>

            {Array.isArray(workout.muscle_groups) && workout.muscle_groups.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {workout.muscle_groups.map((mg: string) => (
                  <span key={mg} className="px-2 py-1 bg-white/5 rounded-md text-[10px] text-gray-400 uppercase tracking-wider">
                    {mg}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export const Timeline: React.FC = () => {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkouts();
  }, [user]);

  const fetchWorkouts = async () => {
    if (!user) {
      setWorkouts([]);
      setLoading(false);
      return;
    }

    try {
      const data = await getWorkouts(user.id, { includeExercises: true });
      setWorkouts(data || []);
    } catch (error) {
      console.error('Error fetching workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (!user) throw new Error('Sign in to delete workouts');
      await deleteWorkout(user.id, id);
      toast.success('Workout deleted');
      setWorkouts((currentWorkouts) => currentWorkouts.filter((workout) => workout.id !== id));
    } catch (error: any) {
      toast.error('Failed to delete workout');
    }
  };

  const calculateVolume = (exercises: any[]) => {
    if (!exercises) return 0;
    return exercises.reduce((total, ex) => total + (ex.sets * ex.reps * ex.weight), 0);
  };

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-24 bg-white/5 rounded-2xl"></div>
      <div className="h-24 bg-white/5 rounded-2xl"></div>
      <div className="h-24 bg-white/5 rounded-2xl"></div>
    </div>;
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8 max-w-3xl mx-auto overflow-hidden">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Timeline</h1>
      </header>

      {workouts.length > 0 ? (
        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
          {workouts.map((workout) => (
            <TimelineItem 
              key={workout.id}
              workout={workout}
              isExpanded={expandedId === workout.id}
              setExpandedId={setExpandedId}
              handleDelete={handleDelete}
              calculateVolume={calculateVolume}
            />
          ))}
        </div>
      ) : (
        <div className="bg-[#1A1A1A] p-8 rounded-2xl border border-white/5 text-center">
          <p className="text-gray-400 text-sm">No workout history yet.</p>
        </div>
      )}
    </div>
  );
};
