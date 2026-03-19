import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Dumbbell, Calendar as CalendarIcon, LayoutGrid, List } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const MUSCLE_COLORS: Record<string, string> = {
  'Chest': '#FF3B30',
  'Back': '#007AFF',
  'Legs': '#34C759',
  'Shoulders': '#FF9500',
  'Arms': '#AF52DE',
  'Core': '#FFCC00',
  'Cardio': '#5AC8FA',
  'Full Body': '#8E8E93'
};

export const Calendar: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchWorkouts();
  }, [currentDate, viewMode, user]);

  const fetchWorkouts = async () => {
    setLoading(true);
    try {
      let start, end;
      if (viewMode === 'month') {
        start = startOfWeek(startOfMonth(currentDate));
        end = endOfWeek(endOfMonth(currentDate));
      } else if (viewMode === 'week') {
        start = startOfWeek(currentDate);
        end = endOfWeek(currentDate);
      } else {
        start = currentDate;
        end = currentDate;
      }

      const { data } = await supabase
        .from('workouts')
        .select('*, exercises(*)')
        .eq('user_id', user?.id)
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'));

      setWorkouts(data || []);
    } catch (error) {
      console.error('Error fetching workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const nextPeriod = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const prevPeriod = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const getDaysToRender = () => {
    if (viewMode === 'month') {
      return eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) });
    } else if (viewMode === 'week') {
      return eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
    } else {
      return [currentDate];
    }
  };

  const days = getDaysToRender();

  const getWorkoutsForDay = (day: Date) => {
    return workouts.filter(w => isSameDay(new Date(w.date), day) && (!activeFilter || w.muscle_groups?.includes(activeFilter)));
  };

  const renderMuscleDots = (workout: any) => {
    const muscles = workout.muscle_groups || [];
    return (
      <div className="flex flex-wrap gap-0.5 mt-1">
        {muscles.slice(0, 3).map((m: string) => (
          <div key={m} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: MUSCLE_COLORS[m] || '#fff' }} />
        ))}
        {muscles.length > 3 && <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />}
      </div>
    );
  };

  const handleTouchStart = (day: Date) => {
    longPressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      navigate(`/log?date=${format(day, 'yyyy-MM-dd')}`);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-8 max-w-4xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <h1 className="text-2xl font-bold text-white">Calendar</h1>
        
        {/* View Mode Toggles */}
        <div className="flex space-x-1 bg-[#1A1A1A] p-1 rounded-xl w-full md:w-auto">
          {[
            { id: 'day', icon: List, label: 'Day' },
            { id: 'week', icon: CalendarIcon, label: 'Week' },
            { id: 'month', icon: LayoutGrid, label: 'Month' }
          ].map(mode => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id as any)}
              className={`flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === mode.id 
                  ? 'bg-[#00D4FF] text-black' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <mode.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Legend & Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveFilter(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            activeFilter === null ? 'bg-white text-black border-white' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'
          }`}
        >
          All
        </button>
        {Object.entries(MUSCLE_COLORS).map(([muscle, color]) => (
          <button
            key={muscle}
            onClick={() => setActiveFilter(activeFilter === muscle ? null : muscle)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border flex items-center space-x-1.5 ${
              activeFilter === muscle ? 'bg-white/10 border-white/30 text-white' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'
            }`}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span>{muscle}</span>
          </button>
        ))}
      </div>

      <div className="bg-[#1A1A1A] rounded-2xl border border-white/5 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <button onClick={prevPeriod} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </button>
          <h2 className="text-lg font-semibold text-white">
            {viewMode === 'day' 
              ? format(currentDate, 'MMMM d, yyyy')
              : viewMode === 'week'
                ? `${format(startOfWeek(currentDate), 'MMM d')} - ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`
                : format(currentDate, 'MMMM yyyy')}
          </h2>
          <button onClick={nextPeriod} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {viewMode === 'month' && (
          <div className="grid grid-cols-7 gap-px bg-white/5">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="bg-[#1A1A1A] py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                {day}
              </div>
            ))}
            
            {days.map((day) => {
              const dayWorkouts = getWorkoutsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selectedDate);

              return (
                <div
                  key={day.toString()}
                  onClick={() => setSelectedDate(day)}
                  onPointerDown={() => handleTouchStart(day)}
                  onPointerUp={handleTouchEnd}
                  onPointerLeave={handleTouchEnd}
                  className={`min-h-[80px] sm:min-h-[100px] bg-[#1A1A1A] p-2 transition-colors cursor-pointer hover:bg-white/5 select-none ${
                    !isCurrentMonth ? 'text-gray-600' : 'text-gray-300'
                  } ${isSelected ? 'ring-2 ring-inset ring-[#00D4FF]/50' : ''}`}
                >
                  <div className="flex flex-col h-full">
                    <div className="flex justify-between items-start">
                      <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-[#00D4FF] text-black' : ''
                      }`}>
                        {format(day, 'd')}
                      </span>
                    </div>
                    
                    <div className="mt-auto space-y-1">
                      {dayWorkouts.slice(0, 2).map(w => (
                        <div key={w.id} className="text-[10px] leading-tight truncate bg-white/5 px-1.5 py-1 rounded text-white border-l-2" style={{ borderLeftColor: w.muscle_groups?.[0] ? MUSCLE_COLORS[w.muscle_groups[0]] : '#00D4FF' }}>
                          {w.title}
                        </div>
                      ))}
                      {dayWorkouts.length > 2 && (
                        <div className="text-[10px] text-gray-500 pl-1">
                          +{dayWorkouts.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'week' && (
          <div className="grid grid-cols-7 gap-px bg-white/5">
            {days.map((day) => {
              const dayWorkouts = getWorkoutsForDay(day);
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selectedDate);

              return (
                <div
                  key={day.toString()}
                  onClick={() => setSelectedDate(day)}
                  onPointerDown={() => handleTouchStart(day)}
                  onPointerUp={handleTouchEnd}
                  onPointerLeave={handleTouchEnd}
                  className={`min-h-[120px] bg-[#1A1A1A] p-2 transition-colors cursor-pointer hover:bg-white/5 select-none ${
                    isSelected ? 'ring-2 ring-inset ring-[#00D4FF]/50' : ''
                  }`}
                >
                  <div className="flex flex-col h-full items-center">
                    <span className="text-xs text-gray-500 uppercase mb-1">{format(day, 'EEE')}</span>
                    <span className={`text-sm font-medium w-8 h-8 flex items-center justify-center rounded-full mb-2 ${
                      isToday ? 'bg-[#00D4FF] text-black' : 'text-white'
                    }`}>
                      {format(day, 'd')}
                    </span>
                    
                    <div className="flex flex-col items-center space-y-2 w-full">
                      {dayWorkouts.map(w => (
                        <div key={w.id} className="w-full flex justify-center" title={w.title}>
                          {renderMuscleDots(w)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'day' && (
          <div className="bg-[#1A1A1A] p-6">
            {loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-24 bg-white/5 rounded-xl"></div>
                <div className="h-24 bg-white/5 rounded-xl"></div>
              </div>
            ) : getWorkoutsForDay(currentDate).length > 0 ? (
              <div className="space-y-4">
                {getWorkoutsForDay(currentDate).map(w => (
                  <div key={w.id} className="bg-black p-5 rounded-xl border border-white/5 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: w.muscle_groups?.[0] ? MUSCLE_COLORS[w.muscle_groups[0]] : '#00D4FF' }} />
                    <div className="flex justify-between items-start mb-4 pl-3">
                      <div>
                        <h4 className="font-bold text-white text-lg">{w.title}</h4>
                        <p className="text-sm text-gray-400 mt-1">{w.duration_minutes} min • {w.exercises?.length || 0} exercises</p>
                      </div>
                      <Link to="/timeline" className="text-xs text-[#00D4FF] hover:underline bg-[#00D4FF]/10 px-3 py-1.5 rounded-full">View Full</Link>
                    </div>
                    {w.muscle_groups && w.muscle_groups.length > 0 && (
                      <div className="flex flex-wrap gap-2 pl-3">
                        {w.muscle_groups.map((m: string) => (
                          <span key={m} className="text-[10px] px-2 py-1 rounded-md bg-white/5 text-gray-300 border border-white/10 flex items-center">
                            <div className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: MUSCLE_COLORS[m] }} />
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Dumbbell className="w-12 h-12 text-gray-600 mx-auto mb-4 opacity-50" />
                <p className="text-gray-400 mb-4">Rest day or no workouts logged.</p>
                <Link to={`/log?date=${format(currentDate, 'yyyy-MM-dd')}`} className="text-sm text-black bg-[#00D4FF] px-6 py-2.5 rounded-xl font-bold hover:bg-[#00D4FF]/90 transition-colors inline-block">
                  Log a Workout
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Day Details (Only show in Month/Week view) */}
      {(viewMode === 'month' || viewMode === 'week') && (
        <AnimatePresence mode="wait">
          <motion.div 
            key={selectedDate.toString()}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5"
          >
            <h3 className="text-white font-medium mb-4 flex items-center">
              <Dumbbell className="w-4 h-4 mr-2 text-[#00D4FF]" />
              Workouts on {format(selectedDate, 'MMMM d')}
            </h3>
            
            {loading ? (
              <div className="animate-pulse h-12 bg-white/5 rounded-xl"></div>
            ) : getWorkoutsForDay(selectedDate).length > 0 ? (
              <div className="space-y-3">
                {getWorkoutsForDay(selectedDate).map(w => (
                  <div key={w.id} className="bg-black p-4 rounded-xl border border-white/5 flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                      <div className="w-1 h-10 rounded-full" style={{ backgroundColor: w.muscle_groups?.[0] ? MUSCLE_COLORS[w.muscle_groups[0]] : '#00D4FF' }} />
                      <div>
                        <h4 className="font-medium text-white">{w.title}</h4>
                        <p className="text-xs text-gray-400 mt-1">{w.duration_minutes} min</p>
                      </div>
                    </div>
                    <Link to="/timeline" className="text-xs text-[#00D4FF] hover:underline">View Details</Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-3">No workouts logged for this day.</p>
                <Link to={`/log?date=${format(selectedDate, 'yyyy-MM-dd')}`} className="text-sm text-[#00D4FF] hover:underline font-medium">
                  Log a Workout
                </Link>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};
