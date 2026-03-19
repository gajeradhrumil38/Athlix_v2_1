import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StepIndicator } from '../components/log/StepIndicator';
import { MuscleGroupGrid } from '../components/log/MuscleGroupGrid';
import { ExercisePicker } from '../components/log/ExercisePicker';
import { ExerciseBlock, ExerciseEntry } from '../components/log/ExerciseBlock';
import { ClipboardList, ChevronDown, Save, X, Plus } from 'lucide-react';

export const Log: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [workoutTitle, setWorkoutTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);

  const [restTimerVisible, setRestTimerVisible] = useState(false);
  const [restDuration, setRestDuration] = useState(90);
  const [restRemaining, setRestRemaining] = useState(90);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    if (!restTimerVisible) return;
    if (restRemaining <= 0) {
      setRestTimerVisible(false);
      try { navigator.vibrate([200, 100, 200]); } catch(e) {}
      return;
    }
    const t = setTimeout(() => setRestRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restTimerVisible, restRemaining]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleUpdateSet = (exId: string, setId: string, field: 'weight' | 'reps', value: number | null) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      return {
        ...ex,
        sets: ex.sets.map(s => s.id === setId ? { ...s, [field]: value } : s)
      };
    }));
  };

  const handleAddSet = (exId: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      const lastSet = ex.sets[ex.sets.length - 1];
      return {
        ...ex,
        sets: [...ex.sets, { 
          id: Math.random().toString(36).substr(2, 9), 
          weight: lastSet ? lastSet.weight : null, 
          reps: lastSet ? lastSet.reps : null, 
          done: false 
        }]
      };
    }));
  };

  const handleSetDone = (exId: string, setId: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      return {
        ...ex,
        sets: ex.sets.map(s => {
          if (s.id === setId) {
            if (!s.done) {
              if (navigator.vibrate) navigator.vibrate(15);
              if (!timerStarted) {
                setTimerRunning(true);
                setTimerStarted(true);
              }
              setRestRemaining(restDuration);
              setRestTimerVisible(true);
            }
            return { ...s, done: !s.done };
          }
          return s;
        })
      };
    }));
  };

  const handleFinishWorkout = async () => {
    if (!user) return;
    setTimerRunning(false);
    
    try {
      const { data: workout, error: workoutError } = await supabase.from('workouts').insert({
        user_id: user.id,
        title: workoutTitle || 'Workout',
        date: format(new Date(), 'yyyy-MM-dd'),
        duration_minutes: Math.round(elapsedSeconds / 60),
        muscle_groups: selectedMuscles,
        notes: notes
      }).select().single();

      if (workoutError) throw workoutError;

      const exerciseInserts = [];
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        const doneSets = ex.sets.filter(s => s.done);
        for (let j = 0; j < doneSets.length; j++) {
          const set = doneSets[j];
          exerciseInserts.push({
            workout_id: workout.id,
            name: ex.name,
            sets: 1,
            reps: set.reps,
            weight: set.weight,
            unit: 'kg',
            order_index: i * 100 + j,
            exercise_db_id: ex.exercise_db_id
          });
        }
      }

      if (exerciseInserts.length > 0) {
        await supabase.from('exercises').insert(exerciseInserts);
      }

      for (const ex of exercises) {
        const doneSets = ex.sets.filter(s => s.done && s.weight);
        if (doneSets.length > 0) {
          const maxWeight = Math.max(...doneSets.map(s => s.weight || 0));
          if (maxWeight > 0) {
            await supabase.from('personal_records').upsert({
              user_id: user.id,
              exercise_name: ex.name,
              best_weight: maxWeight,
              achieved_date: format(new Date(), 'yyyy-MM-dd'),
              exercise_db_id: ex.exercise_db_id
            }, { onConflict: 'user_id,exercise_name', ignoreDuplicates: false });
          }
        }
      }

      navigate('/');
    } catch (error) {
      console.error('Error saving workout:', error);
      alert('Failed to save workout');
      setTimerRunning(true);
    }
  };

  const totalVolume = exercises.reduce((sum, ex) => {
    return sum + ex.sets.filter(s => s.done).reduce((sSum, s) => sSum + ((s.weight || 0) * (s.reps || 0)), 0);
  }, 0);

  return (
    <div className={`min-h-screen bg-black text-[var(--text-primary)] font-sans ${step < 3 ? 'pb-[100px]' : ''}`}>
      <div className={`max-w-[480px] mx-auto ${step < 3 ? 'px-4 pt-4' : ''}`}>
        
        {step < 4 && step !== 3 && <StepIndicator currentStep={step} />}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
              <button className="w-full p-4 border border-dashed border-[var(--border)] rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-colors">
                <ClipboardList className="w-4 h-4" /> Load from Template
              </button>

              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4">
                <label className="block text-[9px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-bold mb-2">Workout Title</label>
                <input 
                  type="text" 
                  value={workoutTitle}
                  onChange={(e) => setWorkoutTitle(e.target.value)}
                  placeholder="e.g. Push Day, Heavy Legs..."
                  className="w-full bg-transparent border-b border-[var(--border)] pb-2 text-[16px] font-bold text-white focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
                <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1">
                  {['Push Day', 'Pull Day', 'Leg Day', 'Full Body'].map(t => (
                    <button key={t} onClick={() => setWorkoutTitle(t)} className="whitespace-nowrap px-3 py-1 rounded-full bg-[var(--bg-elevated)] text-[10px] font-bold text-[var(--text-secondary)] hover:text-white transition-colors">
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4">
                  <label className="block text-[9px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-bold mb-1">Date</label>
                  <div className="text-[14px] font-bold text-white">{format(new Date(), 'MMM d, yyyy')}</div>
                </div>
                <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4">
                  <label className="block text-[9px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-bold mb-1">Duration</label>
                  <div className="text-[14px] font-bold text-[var(--accent)]">{formatTime(elapsedSeconds)}</div>
                </div>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex justify-between items-center cursor-pointer" onClick={() => setNotesExpanded(!notesExpanded)}>
                  <label className="text-[9px] uppercase tracking-[1.5px] text-[var(--text-muted)] font-bold cursor-pointer">Notes</label>
                  <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${notesExpanded ? 'rotate-180' : ''}`} />
                </div>
                {notesExpanded && (
                  <motion.textarea 
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="How are you feeling today?"
                    className="w-full mt-3 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-3 text-[12px] text-white focus:outline-none focus:border-[var(--accent)] min-h-[80px]"
                  />
                )}
              </div>

              <button 
                onClick={() => setStep(2)}
                disabled={!workoutTitle.trim()}
                className="w-full mt-6 py-3.5 bg-[var(--accent)] text-black rounded-xl font-bold text-[14px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                Continue → Select Muscles
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-[18px] font-bold text-white mb-1">Target Muscles</h2>
                <p className="text-[12px] text-[var(--text-secondary)] mb-4">Select the primary groups for this session.</p>
                <MuscleGroupGrid selected={selectedMuscles} onChange={setSelectedMuscles} />
              </div>

              <button 
                onClick={() => setStep(3)}
                disabled={selectedMuscles.length === 0}
                className="w-full py-3.5 bg-[var(--accent)] text-black rounded-xl font-bold text-[14px] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                Continue → Pick Exercises
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <ExercisePicker 
                selectedMuscles={selectedMuscles} 
                onSelect={(exs) => {
                  setExercises(exs);
                  setStep(4);
                }} 
              />
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-screen -mx-4" style={{ background:'var(--bg-base)' }}>
              
              {/* 1. Stats bar - flex-shrink-0 */}
              {!timerStarted ? (
                <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                  style={{ background:'var(--bg-surface)', borderBottom:'0.5px solid var(--border)' }}>
                  
                  <div>
                    <div className="text-[8px] font-bold tracking-[1.5px]"
                      style={{ color:'var(--text-muted)' }}>VOLUME</div>
                    <div className="text-[18px] font-extrabold"
                      style={{ color:'var(--accent)' }}>0 kg</div>
                  </div>

                  <button
                    onClick={() => { setTimerRunning(true); setTimerStarted(true) }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[12px]"
                    style={{
                      background: 'var(--accent)',
                      color: '#000',
                    }}
                  >
                    ▶ Start Session
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                  style={{ background:'var(--bg-surface)', borderBottom:'0.5px solid var(--border)' }}>
                  
                  <div>
                    <div className="text-[8px] font-bold tracking-[1.5px]"
                      style={{ color:'var(--text-muted)' }}>VOLUME</div>
                    <div className="text-[18px] font-extrabold"
                      style={{ color:'var(--accent)' }}>{totalVolume.toLocaleString()} kg</div>
                  </div>

                  <button
                    onClick={() => setTimerRunning(!timerRunning)}
                    className="flex flex-col items-end"
                  >
                    <div className="text-[8px] font-bold tracking-[1.5px]"
                      style={{ color: timerRunning ? 'var(--text-muted)' : '#EF9F27' }}>
                      TIME {timerRunning ? '⏸' : '▶'}
                    </div>
                    <div className="text-[18px] font-extrabold"
                      style={{ color: timerRunning ? 'var(--text-primary)' : '#EF9F27' }}>
                      {formatTime(elapsedSeconds)}
                    </div>
                  </button>
                </div>
              )}

              {/* 2. Scrollable exercise list - flex-1 overflow-y-auto */}
              <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4 space-y-3">
                {exercises.map((ex, i) => (
                  <ExerciseBlock 
                    key={ex.id} 
                    exercise={ex} 
                    index={i}
                    onUpdateSet={handleUpdateSet}
                    onAddSet={handleAddSet}
                    onSetDone={handleSetDone}
                  />
                ))}
                
                {/* Add exercise button — INSIDE the scroll area, at the bottom */}
                <button
                  onClick={() => setStep(3)}
                  className="w-full py-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-2"
                  style={{
                    background: 'transparent',
                    border: '0.5px dashed var(--border)',
                    color: 'var(--text-muted)'
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Another Exercise
                </button>
              </div>

              {/* 3. Rest timer — flex-shrink-0, only when visible */}
              {restTimerVisible && (
                <div
                  className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
                  style={{
                    background: 'var(--bg-surface)',
                    borderTop: '0.5px solid rgba(239,159,39,0.3)',
                  }}
                >
                  {/* Countdown ring */}
                  <div className="relative flex-shrink-0" style={{ width:44, height:44 }}>
                    <svg width="44" height="44" viewBox="0 0 44 44">
                      <circle cx="22" cy="22" r="18"
                        fill="none" stroke="var(--border)" strokeWidth="3.5"/>
                      <circle cx="22" cy="22" r="18"
                        fill="none" stroke="#EF9F27" strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeDasharray={`${(restRemaining / restDuration) * 113} 113`}
                        strokeDashoffset="28"
                        style={{ transition:'stroke-dasharray 1s linear' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[11px] font-extrabold"
                        style={{ color:'#EF9F27' }}>
                        {Math.floor(restRemaining/60)}:{(restRemaining%60).toString().padStart(2,'0')}
                      </span>
                    </div>
                  </div>

                  {/* Label + presets */}
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="text-[8px] font-bold tracking-[1.5px]"
                      style={{ color:'var(--text-muted)' }}>REST TIMER</div>
                    <div className="flex gap-2">
                      {[60, 90, 120].map(s => (
                        <button
                          key={s}
                          onClick={() => { setRestDuration(s); setRestRemaining(s) }}
                          className="px-3 py-1 rounded-lg text-[10px] font-bold"
                          style={{
                            background: restDuration === s
                              ? 'rgba(239,159,39,0.15)'
                              : 'var(--bg-elevated)',
                            color: restDuration === s ? '#EF9F27' : 'var(--text-muted)',
                            border: restDuration === s
                              ? '0.5px solid rgba(239,159,39,0.4)'
                              : '0.5px solid var(--border)'
                          }}
                        >
                          {s === 60 ? '1m' : s === 90 ? '1.5m' : '2m'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Skip rest button */}
                  <button
                    onClick={() => setRestTimerVisible(false)}
                    className="flex-shrink-0 px-3 py-2 rounded-lg text-[10px] font-bold"
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                      border: '0.5px solid var(--border)'
                    }}
                  >
                    Skip
                  </button>
                </div>
              )}

              {/* 4. Finish buttons — flex-shrink-0, always visible */}
              <div
                className="flex-shrink-0 flex gap-2 px-3 py-3 pb-safe"
                style={{
                  background: 'var(--bg-base)',
                  borderTop: '0.5px solid var(--border)'
                }}
              >
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 py-3 rounded-xl text-[12px] font-extrabold"
                  style={{
                    background: 'rgba(240,106,106,0.1)',
                    color: '#F06A6A',
                    border: '0.5px solid rgba(240,106,106,0.3)'
                  }}
                >
                  Discard
                </button>
                <button
                  onClick={handleFinishWorkout}
                  className="flex-[2] py-3 rounded-xl text-[13px] font-extrabold"
                  style={{ background:'var(--accent)', color:'#000' }}
                >
                  Finish Workout ✓
                </button>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
