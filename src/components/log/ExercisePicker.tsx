import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Plus, History, LayoutGrid, ChevronLeft, Layers, Edit2, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  getExerciseLibraryByGroup,
  getRecentExerciseOptions,
  getTemplates,
  saveTemplate,
  searchExerciseLibrary,
} from '../../lib/supabaseData';

// ── Types ────────────────────────────────────────────────────────────────────

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  lastSession?: { weight: number; reps: number; date: string };
  // Populated when this exercise comes from a loaded template
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
}

interface Template {
  id: string;
  title: string;
  template_exercises: Array<{
    id?: string;
    name: string;
    muscle_group?: string | null;
    exercise_db_id?: string | null;
    default_sets?: number;
    default_reps?: number;
    default_weight?: number;
  }>;
}

interface EditorExercise {
  localId: string;
  id?: string; // server id when editing an existing template exercise
  name: string;
  muscle_group?: string;
  exercise_db_id?: string;
  default_sets: number;
  default_reps: number;
  default_weight: number;
}

interface EditorState {
  templateId: string | null; // null = creating new
  title: string;
  exercises: EditorExercise[];
  exSearch: string;
  exResults: Exercise[];
  saving: boolean;
}

interface ExercisePickerProps {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
  recentExercises: Exercise[];
  onLoadTemplate?: (exercises: Exercise[]) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = [
  { name: 'Chest',     previewExerciseId: 'ot_benchpress',     cssVar: '--chest'     },
  { name: 'Back',      previewExerciseId: 'ot_tbarrow',         cssVar: '--back'      },
  { name: 'Shoulders', previewExerciseId: 'ot_arnoldpress',     cssVar: '--shoulders' },
  { name: 'Biceps',    previewExerciseId: 'ot_bicepscurl',      cssVar: '--biceps'    },
  { name: 'Triceps',   previewExerciseId: 'ot_tricepskickback', cssVar: '--triceps'   },
  { name: 'Legs',      previewExerciseId: 'ot_legpressx',       cssVar: '--legs'      },
  { name: 'Core',      previewExerciseId: 'ot_crunches',        cssVar: '--core'      },
  { name: 'Cardio',    previewExerciseId: '',                   cssVar: '--cardio'    },
  { name: 'Yoga',      previewExerciseId: '',                   cssVar: '--purple'    },
];

const MUSCLE_CSS_VAR: Record<string, string> = Object.fromEntries(
  MUSCLE_GROUPS.map((g) => [g.name, g.cssVar]),
);

// ── Sub-components ───────────────────────────────────────────────────────────

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

const ExerciseRow: React.FC<{ exercise: Exercise; onSelect: (exercise: Exercise) => void }> = ({
  exercise,
  onSelect,
}) => {
  const cssVar = MUSCLE_CSS_VAR[exercise.muscleGroup];
  return (
    <button
      onClick={() => onSelect(exercise)}
      className="w-full rounded-xl flex items-center gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', minHeight: 60 }}
    >
      <InitialBadge
        label={exercise.name}
        colorVar={MUSCLE_CSS_VAR[exercise.muscleGroup] || '--text-secondary'}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {exercise.name}
        </div>
        <div className="mt-0.5 text-[11px] font-medium" style={{ color: cssVar ? `var(${cssVar})` : 'var(--text-secondary)' }}>
          {exercise.muscleGroup}
        </div>
      </div>
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
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
      >
        <Plus className="w-4 h-4" />
      </div>
    </button>
  );
};

// ── Main component ───────────────────────────────────────────────────────────

export const ExercisePicker: React.FC<ExercisePickerProps> = ({
  onSelect,
  onClose,
  recentExercises,
  onLoadTemplate,
}) => {
  const { user } = useAuth();

  // Browse states
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'recent' | 'muscle' | 'templates' | 'search'>('recent');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [libraryExercises, setLibraryExercises] = useState<Exercise[]>([]);
  const [recentLibraryExercises, setRecentLibraryExercises] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Template editor state
  const [editor, setEditor] = useState<EditorState | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    getRecentExerciseOptions(user.id).then((recent) => {
      setRecentLibraryExercises(
        recent.map((ex, i) => ({
          id: `${ex.name}-${i}`,
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          exercise_db_id: ex.exercise_db_id || undefined,
          lastSession: ex.lastSession
            ? { weight: ex.lastSession.weight, reps: ex.lastSession.reps, date: ex.lastSession.date }
            : undefined,
        })),
      );
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (search.trim()) {
      searchExerciseLibrary(user.id, search).then((results) => {
        setLibraryExercises(results.map((ex) => ({
          id: ex.id,
          name: ex.name,
          muscleGroup: ex.muscle_group,
          exercise_db_id: ex.exercise_db_id || undefined,
        })));
      });
      return;
    }
    if (selectedMuscle) {
      getExerciseLibraryByGroup(user.id, selectedMuscle).then((results) => {
        setLibraryExercises(results.map((ex) => ({
          id: ex.id,
          name: ex.name,
          muscleGroup: ex.muscle_group,
          exercise_db_id: ex.exercise_db_id || undefined,
        })));
      });
      return;
    }
    setLibraryExercises([]);
  }, [user, search, selectedMuscle]);

  useEffect(() => {
    if (activeTab !== 'templates' || !user || templates.length > 0) return;
    setTemplatesLoading(true);
    getTemplates(user.id)
      .then((data) => setTemplates((data as Template[]) || []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [activeTab, user, templates.length]);

  // Load exercise search results within the template editor
  useEffect(() => {
    if (!editor || !user || !editor.exSearch.trim()) {
      setEditor((prev) => prev ? { ...prev, exResults: [] } : null);
      return;
    }
    searchExerciseLibrary(user.id, editor.exSearch).then((results) => {
      setEditor((prev) =>
        prev
          ? {
              ...prev,
              exResults: results.map((ex) => ({
                id: ex.id,
                name: ex.name,
                muscleGroup: ex.muscle_group,
                exercise_db_id: ex.exercise_db_id || undefined,
              })),
            }
          : null,
      );
    });
  }, [editor?.exSearch, user]);

  // ── Browse handlers ────────────────────────────────────────────────────────

  const filteredExercises = useMemo(() => libraryExercises, [libraryExercises]);
  const isNestedView = Boolean(search.trim()) || Boolean(selectedMuscle);

  const handleSelect = (exercise: Exercise) => {
    onSelect(exercise);
    onClose();
  };

  const handleBack = () => {
    if (editor) { setEditor(null); return; }
    if (search.trim()) {
      setSearch('');
      setActiveTab(selectedMuscle ? 'muscle' : 'recent');
      return;
    }
    if (selectedMuscle) { setSelectedMuscle(null); return; }
    onClose();
  };

  // ── Template editor handlers ───────────────────────────────────────────────

  const openCreateEditor = () => {
    setEditor({ templateId: null, title: '', exercises: [], exSearch: '', exResults: [], saving: false });
  };

  const openEditEditor = (tmpl: Template) => {
    setEditor({
      templateId: tmpl.id,
      title: tmpl.title,
      exercises: tmpl.template_exercises.map((te) => ({
        localId: crypto.randomUUID(),
        id: (te as any).id,
        name: te.name,
        muscle_group: te.muscle_group || undefined,
        exercise_db_id: te.exercise_db_id || undefined,
        default_sets: te.default_sets ?? 3,
        default_reps: te.default_reps ?? 10,
        default_weight: te.default_weight ?? 0,
      })),
      exSearch: '',
      exResults: [],
      saving: false,
    });
  };

  const addExerciseToTemplate = (exercise: Exercise) => {
    setEditor((prev) => {
      if (!prev) return prev;
      if (prev.exercises.some((e) => e.name.toLowerCase() === exercise.name.toLowerCase())) return prev;
      return {
        ...prev,
        exercises: [
          ...prev.exercises,
          {
            localId: crypto.randomUUID(),
            name: exercise.name,
            muscle_group: exercise.muscleGroup,
            exercise_db_id: exercise.exercise_db_id,
            default_sets: 3,
            default_reps: 10,
            default_weight: 0,
          },
        ],
        exSearch: '',
        exResults: [],
      };
    });
  };

  const removeExerciseFromTemplate = (localId: string) => {
    setEditor((prev) => prev ? { ...prev, exercises: prev.exercises.filter((e) => e.localId !== localId) } : null);
  };

  const updateEditorExercise = (localId: string, field: 'default_sets' | 'default_reps' | 'default_weight', value: number) => {
    setEditor((prev) =>
      prev
        ? { ...prev, exercises: prev.exercises.map((e) => e.localId === localId ? { ...e, [field]: value } : e) }
        : null,
    );
  };

  const handleSaveTemplate = async () => {
    if (!editor || !user) return;
    if (!editor.title.trim()) { toast.error('Give your template a name'); return; }
    if (editor.exercises.length === 0) { toast.error('Add at least one exercise'); return; }

    setEditor((prev) => prev ? { ...prev, saving: true } : null);
    try {
      await saveTemplate(user.id, {
        templateId: editor.templateId,
        title: editor.title.trim(),
        exercises: editor.exercises.map((ex, i) => ({
          name: ex.name,
          muscle_group: ex.muscle_group || null,
          default_sets: ex.default_sets,
          default_reps: ex.default_reps,
          default_weight: ex.default_weight,
          exercise_db_id: ex.exercise_db_id || null,
          order_index: i,
        })),
      });
      toast.success(editor.templateId ? 'Template updated' : 'Template created');
      setEditor(null);
      // Force re-fetch templates list
      setTemplates([]);
      setTemplatesLoading(true);
      getTemplates(user.id)
        .then((data) => setTemplates((data as Template[]) || []))
        .catch(() => setTemplates([]))
        .finally(() => setTemplatesLoading(false));
      setActiveTab('templates');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save template');
      setEditor((prev) => prev ? { ...prev, saving: false } : null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={handleBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-medium transition-colors"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {editor ? 'Back' : isNestedView ? 'Back' : 'Close'}
          </button>

          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {editor ? (editor.templateId ? 'Edit Template' : 'New Template') : 'Add Exercise'}
          </h2>

          {editor ? (
            <button
              onClick={handleSaveTemplate}
              disabled={editor.saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold transition-all disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              <Save className="w-3.5 h-3.5" />
              {editor.saving ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Search + Tabs (hidden in editor mode) ── */}
        {!editor && (
          <div className="px-4 pt-3 pb-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search exercises"
                value={search}
                onChange={(e) => { setSearch(e.target.value); if (e.target.value) setActiveTab('search'); }}
                className="w-full h-11 rounded-xl pl-10 pr-4 text-[14px] transition-colors focus:outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex gap-1.5 rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }}>
              {[
                { id: 'recent',    label: 'Recent',    Icon: History    },
                { id: 'muscle',    label: 'Muscle',    Icon: LayoutGrid },
                { id: 'templates', label: 'Templates', Icon: Layers     },
              ].map(({ id, label, Icon }) => {
                const isActive = activeTab === id && !search;
                return (
                  <button
                    key={id}
                    onClick={() => { setActiveTab(id as 'recent' | 'muscle' | 'templates'); setSearch(''); setSelectedMuscle(null); }}
                    className="flex-1 h-8 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all"
                    style={isActive ? { background: 'var(--accent)', color: '#000' } : { background: 'transparent', color: 'var(--text-secondary)' }}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">

          {/* ── Template editor ── */}
          {editor && (
            <div className="flex flex-col gap-4">
              {/* Name input */}
              <input
                type="text"
                placeholder="Template name (e.g. Push Day)"
                value={editor.title}
                autoFocus
                onChange={(e) => setEditor((prev) => prev ? { ...prev, title: e.target.value } : null)}
                className="w-full h-12 rounded-xl px-4 text-[15px] font-semibold focus:outline-none"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />

              {/* Exercise list */}
              {editor.exercises.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                    Exercises · {editor.exercises.length}
                  </p>
                  {editor.exercises.map((ex) => (
                    <div
                      key={ex.localId}
                      className="rounded-xl p-3 flex flex-col gap-2.5"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                    >
                      {/* Name + remove */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <InitialBadge
                            label={ex.name}
                            colorVar={MUSCLE_CSS_VAR[ex.muscle_group || ''] || '--text-secondary'}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{ex.name}</p>
                            {ex.muscle_group && (
                              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{ex.muscle_group}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeExerciseFromTemplate(ex.localId)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg shrink-0 transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Sets / Reps / Weight row */}
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { field: 'default_sets' as const, label: 'Sets' },
                            { field: 'default_reps' as const, label: 'Reps' },
                            { field: 'default_weight' as const, label: 'Weight' },
                          ] as const
                        ).map(({ field, label }) => (
                          <div key={field} className="flex flex-col items-center gap-1">
                            <label className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
                              {label}
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={ex[field]}
                              min={0}
                              onChange={(e) => updateEditorExercise(ex.localId, field, parseFloat(e.target.value) || 0)}
                              className="w-full h-9 rounded-lg text-center text-[14px] font-bold focus:outline-none"
                              style={{
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-primary)',
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Exercise search for template */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                  Add Exercise
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search exercise to add…"
                    value={editor.exSearch}
                    onChange={(e) => setEditor((prev) => prev ? { ...prev, exSearch: e.target.value } : null)}
                    className="w-full h-11 rounded-xl pl-10 pr-4 text-[14px] focus:outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                {editor.exSearch.trim() && (
                  <div className="flex flex-col gap-2 mt-1">
                    {editor.exResults.length === 0 && (
                      <p className="py-6 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                        No results for "{editor.exSearch}"
                      </p>
                    )}
                    {editor.exResults.map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => addExerciseToTemplate(ex)}
                        className="w-full rounded-xl flex items-center gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                      >
                        <InitialBadge
                          label={ex.name}
                          colorVar={MUSCLE_CSS_VAR[ex.muscleGroup] || '--text-secondary'}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{ex.name}</p>
                          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{ex.muscleGroup}</p>
                        </div>
                        <div
                          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Browse views (hidden when editor open) ── */}
          {!editor && (
            <>
              {/* Recent tab */}
              {activeTab === 'recent' && !search && (
                <div className="flex flex-col gap-2">
                  {(recentExercises.length > 0 ? recentExercises : recentLibraryExercises).map((exercise) => (
                    <ExerciseRow key={exercise.id} exercise={exercise} onSelect={handleSelect} />
                  ))}
                  {recentExercises.length === 0 && recentLibraryExercises.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center" style={{ color: 'var(--text-muted)' }}>
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
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                    >
                      <InitialBadge label={muscle.name} colorVar={muscle.cssVar} size="md" />
                      <span className="relative z-10 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: `var(${muscle.cssVar})` }}>
                        {muscle.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Muscle drill-down */}
              {selectedMuscle && !search && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setSelectedMuscle(null)}
                    className="inline-flex items-center gap-1.5 mb-1 text-[12px] font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    All muscle groups
                  </button>
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

              {/* Templates tab */}
              {activeTab === 'templates' && !search && (
                <div className="flex flex-col gap-2">
                  {/* Create template button */}
                  <button
                    onClick={openCreateEditor}
                    className="w-full h-10 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all active:scale-[0.98]"
                    style={{
                      background: 'rgba(200,255,0,0.07)',
                      border: '1px dashed rgba(200,255,0,0.25)',
                      color: 'var(--accent)',
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Template
                  </button>

                  {templatesLoading && (
                    <div className="py-12 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                      Loading templates…
                    </div>
                  )}

                  {!templatesLoading && templates.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                      <Layers className="w-8 h-8 opacity-40" />
                      <p className="text-[13px] font-medium">No templates yet</p>
                      <p className="text-[11px] opacity-60">Tap "New Template" above to create one</p>
                    </div>
                  )}

                  {!templatesLoading && templates.map((tmpl) => {
                    const previewNames = tmpl.template_exercises.slice(0, 3).map((e) => e.name);
                    const extra = tmpl.template_exercises.length - previewNames.length;
                    return (
                      <div
                        key={tmpl.id}
                        className="rounded-xl px-3.5 py-3 flex items-center gap-3"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                      >
                        {/* Icon */}
                        <div
                          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.14)' }}
                        >
                          <Layers className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {tmpl.title}
                          </div>
                          <div className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {previewNames.join(' · ')}{extra > 0 ? ` +${extra}` : ''}
                          </div>
                        </div>

                        {/* Edit */}
                        <button
                          onClick={() => openEditEditor(tmpl)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg transition-colors shrink-0"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                          title="Edit template"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Load */}
                        {onLoadTemplate && (
                          <button
                            onClick={() => {
                              const exercises: Exercise[] = tmpl.template_exercises.map((te, i) => ({
                                id: `${te.name}-${i}`,
                                name: te.name,
                                muscleGroup: te.muscle_group || 'Other',
                                exercise_db_id: te.exercise_db_id || undefined,
                                defaultSets: te.default_sets ?? 3,
                                defaultReps: te.default_reps ?? 10,
                                defaultWeight: te.default_weight ?? 0,
                              }));
                              onLoadTemplate(exercises);
                              onClose();
                            }}
                            className="shrink-0 h-7 rounded-lg px-3 text-[11px] font-bold transition-opacity active:opacity-70"
                            style={{ background: 'rgba(200,255,0,0.12)', color: 'var(--accent)', border: '1px solid rgba(200,255,0,0.18)' }}
                          >
                            Load
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};
