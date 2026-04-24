import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Plus, History, LayoutGrid, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getExerciseLibraryByGroup, getRecentExerciseOptions, searchExerciseLibrary } from '../../lib/supabaseData';

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
  { name: 'Chest',     previewExerciseId: 'ot_benchpress',      cssVar: '--chest'     },
  { name: 'Back',      previewExerciseId: 'ot_tbarrow',          cssVar: '--back'      },
  { name: 'Shoulders', previewExerciseId: 'ot_arnoldpress',      cssVar: '--shoulders' },
  { name: 'Biceps',    previewExerciseId: 'ot_bicepscurl',       cssVar: '--biceps'    },
  { name: 'Triceps',   previewExerciseId: 'ot_tricepskickback',  cssVar: '--triceps'   },
  { name: 'Legs',      previewExerciseId: 'ot_legpressx',        cssVar: '--legs'      },
  { name: 'Core',      previewExerciseId: 'ot_crunches',         cssVar: '--core'      },
  { name: 'Cardio',    previewExerciseId: '',                    cssVar: '--cardio'    },
  { name: 'Yoga',      previewExerciseId: '',                    cssVar: '--purple'    },
];

const MUSCLE_CSS_VAR: Record<string, string> = Object.fromEntries(
  MUSCLE_GROUPS.map((g) => [g.name, g.cssVar]),
);

const InitialBadge: React.FC<{ label: string; colorVar?: string; size?: 'sm' | 'md' }> = ({
  label,
  colorVar = '--text-secondary',
  size = 'sm',
}) => {
  const isSmall = size === 'sm';
  return (
    <div
      className={`${isSmall ? 'h-10 w-10 rounded-[12px] text-[15px]' : 'h-11 w-11 rounded-[13px] text-[16px]'} flex items-center justify-center border font-bold uppercase shrink-0`}
      style={{
        background: `color-mix(in srgb, var(${colorVar}) 12%, var(--bg-elevated))`,
        borderColor: `color-mix(in srgb, var(${colorVar}) 26%, transparent)`,
        color: `var(${colorVar})`,
      }}
    >
      {label.charAt(0)}
    </div>
  );
};

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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="absolute inset-0 mx-auto w-full max-w-[860px] flex flex-col border-x"
        style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 pb-3"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            onClick={handleBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-medium transition-colors"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {isNestedView ? 'Back' : 'Close'}
          </button>

          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Add Exercise
          </h2>

          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Search + Tabs ────────────────────────────────────── */}
        <div className="px-4 pt-3 pb-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {/* Search field */}
          <div className="relative mb-3">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search exercises"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value) setActiveTab('search');
              }}
              className="w-full h-11 rounded-xl pl-10 pr-4 text-[14px] transition-colors focus:outline-none"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Tabs */}
          <div
            className="flex gap-1.5 rounded-xl p-1"
            style={{ background: 'var(--bg-elevated)' }}
          >
            {[
              { id: 'recent', label: 'Recent',  Icon: History    },
              { id: 'muscle', label: 'Muscle',  Icon: LayoutGrid },
            ].map(({ id, label, Icon }) => {
              const isActive = activeTab === id && !search;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id as 'recent' | 'muscle');
                    setSearch('');
                    setSelectedMuscle(null);
                  }}
                  className="flex-1 h-8 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all"
                  style={
                    isActive
                      ? { background: 'var(--accent)', color: '#000' }
                      : { background: 'transparent', color: 'var(--text-secondary)' }
                  }
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">

          {/* Recent tab */}
          {activeTab === 'recent' && !search && (
            <div className="flex flex-col gap-2">
              {(recentExercises.length > 0 ? recentExercises : recentLibraryExercises).map((exercise) => (
                <ExerciseRow key={exercise.id} exercise={exercise} onSelect={handleSelect} />
              ))}
              {recentExercises.length === 0 && recentLibraryExercises.length === 0 && (
                <div
                  className="flex flex-col items-center justify-center gap-2 py-16 text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <History className="w-8 h-8 opacity-40" />
                  <p className="text-[13px] font-medium">No recent exercises</p>
                  <p className="text-[11px] opacity-60">Exercises you log will appear here</p>
                </div>
              )}
            </div>
          )}

          {/* Muscle grid */}
          {activeTab === 'muscle' && !search && !selectedMuscle && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {MUSCLE_GROUPS.map((muscle) => (
                <button
                  key={muscle.name}
                  onClick={() => setSelectedMuscle(muscle.name)}
                  className="relative h-[88px] rounded-2xl flex flex-col items-center justify-center gap-2 overflow-hidden active:scale-[0.97] transition-transform"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <InitialBadge label={muscle.name} colorVar={muscle.cssVar} size="md" />
                  <span
                    className="relative z-10 text-[11px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: `var(${muscle.cssVar})` }}
                  >
                    {muscle.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Muscle drill-down list */}
          {selectedMuscle && !search && (
            <div className="flex flex-col gap-2">
              {/* Breadcrumb */}
              <button
                onClick={() => setSelectedMuscle(null)}
                className="inline-flex items-center gap-1.5 mb-1 text-[12px] font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                All muscle groups
              </button>

              {/* Group label pill */}
              <div
                className="self-start mb-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{
                  background: `color-mix(in srgb, var(${MUSCLE_CSS_VAR[selectedMuscle] ?? '--text-muted'}) 12%, transparent)`,
                  color: `var(${MUSCLE_CSS_VAR[selectedMuscle] ?? '--text-muted'})`,
                  border: `1px solid color-mix(in srgb, var(${MUSCLE_CSS_VAR[selectedMuscle] ?? '--text-muted'}) 25%, transparent)`,
                }}
              >
                {selectedMuscle}
              </div>

              {filteredExercises.map((exercise) => (
                <ExerciseRow key={exercise.id} exercise={exercise} onSelect={handleSelect} />
              ))}
              {filteredExercises.length === 0 && (
                <div className="py-12 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  No exercises found
                </div>
              )}
            </div>
          )}

          {/* Search results */}
          {search && (
            <div className="flex flex-col gap-2">
              {filteredExercises.map((exercise) => (
                <ExerciseRow key={exercise.id} exercise={exercise} onSelect={handleSelect} />
              ))}
              {filteredExercises.length === 0 && (
                <div className="py-12 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  No results for "{search}"
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const ExerciseRow: React.FC<{ exercise: Exercise; onSelect: (exercise: Exercise) => void }> = ({
  exercise,
  onSelect,
}) => {
  const cssVar = MUSCLE_CSS_VAR[exercise.muscleGroup];

  return (
    <button
      onClick={() => onSelect(exercise)}
      className="w-full rounded-xl flex items-center gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        minHeight: 60,
      }}
    >
      {/* Exercise image / avatar */}
      <InitialBadge
        label={exercise.name}
        colorVar={MUSCLE_CSS_VAR[exercise.muscleGroup] || '--text-secondary'}
        size="sm"
      />

      {/* Name + group */}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {exercise.name}
        </div>
        <div
          className="mt-0.5 text-[11px] font-medium"
          style={{ color: cssVar ? `var(${cssVar})` : 'var(--text-secondary)' }}
        >
          {exercise.muscleGroup}
        </div>
      </div>

      {/* Last session (desktop) */}
      {exercise.lastSession && (
        <div className="hidden sm:flex flex-col items-end shrink-0 pr-1">
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {exercise.lastSession.weight}kg × {exercise.lastSession.reps}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {exercise.lastSession.date}
          </span>
        </div>
      )}

      {/* Add button */}
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
      >
        <Plus className="w-4 h-4" />
      </div>
    </button>
  );
};
