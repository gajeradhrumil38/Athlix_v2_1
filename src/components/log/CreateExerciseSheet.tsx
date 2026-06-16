import React, { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import Body, { ExtendedBodyPart } from 'react-muscle-highlighter';
import { X, ChevronLeft, ChevronDown, Check, Dumbbell } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { addCustomExercise, searchExerciseLibrary } from '../../lib/supabaseData';
import { MUSCLE_SLUG_LABELS, MUSCLE_SLUG_REGION_MAP, type MuscleSlug } from '../../lib/exerciseMuscles';

// ── Constants ────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = [
  { name: 'Chest',     cssVar: '--chest'     },
  { name: 'Back',      cssVar: '--back'      },
  { name: 'Shoulders', cssVar: '--shoulders' },
  { name: 'Biceps',    cssVar: '--biceps'    },
  { name: 'Triceps',   cssVar: '--triceps'   },
  { name: 'Legs',      cssVar: '--legs'      },
  { name: 'Core',      cssVar: '--core'      },
  { name: 'Cardio',    cssVar: '--cardio'    },
  { name: 'Yoga',      cssVar: '--purple'    },
];

// Maps MuscleRegion strings (from MUSCLE_SLUG_REGION_MAP) to MUSCLE_GROUPS names
const REGION_TO_GROUP: Record<string, string> = {
  Chest: 'Chest',
  Back: 'Back',
  Shoulders: 'Shoulders',
  Biceps: 'Biceps',
  Triceps: 'Triceps',
  Arms: 'Biceps',
  Legs: 'Legs',
  Glutes: 'Legs',
  Core: 'Core',
  Forearms: 'Biceps',
  Cardio: 'Cardio',
  Yoga: 'Yoga',
  Mobility: 'Core',
};

const PRIMARY_COLOR = 'rgba(200,255,0,0.9)';
const SECONDARY_COLOR = 'rgba(120,160,255,0.65)';

type SlugType = 'primary' | 'secondary';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreatedExercise {
  id: string;
  name: string;
  muscleGroup: string;
}

interface CreateExerciseSheetProps {
  onClose: () => void;
  onCreated: (exercise: CreatedExercise) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const CreateExerciseSheet: React.FC<CreateExerciseSheetProps> = ({ onClose, onCreated }) => {
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [muscleGroup, setMuscleGroup] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [slugMap, setSlugMap] = useState<Map<string, SlugType>>(new Map());
  const [view, setView] = useState<'front' | 'back'>('front');
  const [saving, setSaving] = useState(false);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────

  const filteredGroups = useMemo(
    () => MUSCLE_GROUPS.filter((g) => g.name.toLowerCase().includes(groupSearch.toLowerCase())),
    [groupSearch],
  );

  const bodyData = useMemo((): ExtendedBodyPart[] => {
    const parts: ExtendedBodyPart[] = [];
    slugMap.forEach((type, slug) => {
      parts.push({
        slug: slug as any,
        intensity: type === 'primary' ? 4 : 2,
        color: type === 'primary' ? PRIMARY_COLOR : SECONDARY_COLOR,
      });
    });
    return parts;
  }, [slugMap]);

  const { primarySlugs, secondarySlugs } = useMemo(() => {
    const primarySlugs: string[] = [];
    const secondarySlugs: string[] = [];
    slugMap.forEach((type, slug) => {
      if (type === 'primary') primarySlugs.push(slug);
      else secondarySlugs.push(slug);
    });
    return { primarySlugs, secondarySlugs };
  }, [slugMap]);

  const canSave = name.trim().length > 0 && !nameError && !saving;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNameChange = (val: string) => {
    setName(val);
    setNameError(null);
    if (dupTimer.current) clearTimeout(dupTimer.current);
    if (!val.trim() || !user) return;
    dupTimer.current = setTimeout(async () => {
      const results = await searchExerciseLibrary(user.id, val.trim());
      const dup = results.find((r) => r.name.toLowerCase() === val.trim().toLowerCase());
      if (dup) setNameError('An exercise with this name already exists');
    }, 400);
  };

  const handleSlugPress = (part: ExtendedBodyPart) => {
    const slug = (part.slug as string) || '';
    if (!slug) return;
    setSlugMap((prev) => {
      const next = new Map(prev);
      const current = next.get(slug);
      if (!current) {
        next.set(slug, 'primary');
        // Auto-suggest muscle group from the first primary slug when none is chosen
        if (!muscleGroup) {
          const region = MUSCLE_SLUG_REGION_MAP[slug as MuscleSlug] as string | undefined;
          const groupName = region ? REGION_TO_GROUP[region] : undefined;
          if (groupName) setMuscleGroup(groupName);
        }
      } else if (current === 'primary') {
        next.set(slug, 'secondary');
      } else {
        next.delete(slug);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!user || !canSave) return;
    const trimmedName = name.trim();

    // Resolve group: dropdown selection > auto-derive from first primary slug > fallback 'Core'
    const group =
      muscleGroup ||
      (() => {
        const firstPrimary = primarySlugs[0];
        if (!firstPrimary) return 'Core';
        const region = MUSCLE_SLUG_REGION_MAP[firstPrimary as MuscleSlug] as string | undefined;
        return (region && REGION_TO_GROUP[region]) || 'Core';
      })();

    const slugsPayload = [
      ...primarySlugs.map((s) => ({ slug: s, type: 'primary' as const })),
      ...secondarySlugs.map((s) => ({ slug: s, type: 'secondary' as const })),
    ];

    setSaving(true);
    try {
      const result = await addCustomExercise(user.id, trimmedName, group, slugsPayload);
      toast.success('Exercise created!');
      onCreated({ id: result.id, name: trimmedName, muscleGroup: group });
    } catch {
      toast.error('Failed to save exercise');
      setSaving(false);
    }
  };

  const selectedGroupCssVar =
    MUSCLE_GROUPS.find((g) => g.name === muscleGroup)?.cssVar ?? '--text-muted';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="absolute inset-0 mx-auto w-full max-w-[860px] flex flex-col border-x"
        style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pb-3 shrink-0"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-medium transition-colors"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Create Exercise
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-5 pb-[120px]">

          {/* Exercise name */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
              Exercise Name
            </label>
            <input
              type="text"
              placeholder="e.g. Cable Fly, Landmine Row…"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full h-12 rounded-xl px-4 text-[15px] focus:outline-none transition-colors"
              style={{
                background: 'var(--bg-surface)',
                border: nameError ? '1.5px solid #f87171' : '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            {nameError && (
              <p className="text-[11px]" style={{ color: '#f87171' }}>{nameError}</p>
            )}
          </div>

          {/* Primary muscle group dropdown */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
              Primary Muscle Group
            </label>
            <button
              onClick={() => setShowDropdown((v) => !v)}
              className="w-full h-12 rounded-xl px-4 flex items-center justify-between text-[14px] font-medium transition-colors"
              style={{
                background: 'var(--bg-surface)',
                border: `1px solid ${muscleGroup ? `color-mix(in srgb, var(${selectedGroupCssVar}) 35%, transparent)` : 'var(--border)'}`,
                color: muscleGroup ? `var(${selectedGroupCssVar})` : 'var(--text-muted)',
              }}
            >
              <div className="flex items-center gap-2.5">
                {muscleGroup && (
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: `var(${selectedGroupCssVar})` }}
                  />
                )}
                <span>{muscleGroup || 'Select muscle group…'}</span>
              </div>
              <ChevronDown
                className="w-4 h-4 transition-transform"
                style={{
                  color: 'var(--text-muted)',
                  transform: showDropdown ? 'rotate(180deg)' : 'none',
                }}
              />
            </button>

            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              >
                <div className="px-3 pt-2.5 pb-1.5">
                  <input
                    type="text"
                    placeholder="Search groups…"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    autoFocus
                    className="w-full h-9 rounded-lg px-3 text-[13px] focus:outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                {filteredGroups.length === 0 && (
                  <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>No matches</p>
                )}
                {filteredGroups.map((g, i) => (
                  <button
                    key={g.name}
                    onClick={() => { setMuscleGroup(g.name); setShowDropdown(false); setGroupSearch(''); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-left transition-colors active:opacity-70"
                    style={{
                      color: muscleGroup === g.name ? `var(${g.cssVar})` : 'var(--text-primary)',
                      borderTop: i === 0 ? '1px solid var(--border)' : '1px solid var(--border-subtle)',
                      background: muscleGroup === g.name ? `color-mix(in srgb, var(${g.cssVar}) 8%, transparent)` : 'transparent',
                    }}
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: `var(${g.cssVar})` }} />
                    {g.name}
                    {muscleGroup === g.name && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {/* Muscle map */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
                Target Muscles
              </label>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                1× primary · 2× secondary · 3× remove
              </span>
            </div>

            {/* Legend */}
            <div className="flex gap-4">
              {[
                { label: 'Primary',   color: PRIMARY_COLOR   },
                { label: 'Secondary', color: SECONDARY_COLOR },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Front / Back toggle */}
            <div className="flex gap-1 rounded-xl p-1 w-fit" style={{ background: 'var(--bg-elevated)' }}>
              {(['front', 'back'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-5 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-all"
                  style={
                    view === v
                      ? { background: 'var(--accent)', color: '#000' }
                      : { background: 'transparent', color: 'var(--text-secondary)' }
                  }
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Interactive body SVG */}
            <div
              className="rounded-2xl overflow-hidden flex justify-center items-center py-4"
              style={{
                background: 'linear-gradient(160deg, rgba(14,24,36,0.95) 0%, rgba(10,18,28,0.98) 65%, rgba(8,12,18,1) 100%)',
                border: '1px solid var(--border)',
                minHeight: 300,
              }}
            >
              <Body
                data={bodyData}
                side={view}
                gender="male"
                scale={0.9}
                defaultFill="#1A2538"
                border="#1E2F42"
                defaultStroke="#1E2F42"
                defaultStrokeWidth={1}
                onBodyPartPress={handleSlugPress}
              />
            </div>

            {/* Selected muscle chips */}
            {slugMap.size > 0 && (
              <div className="space-y-2">
                {primarySlugs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider shrink-0"
                      style={{ color: 'rgba(200,255,0,0.7)' }}
                    >
                      Primary:
                    </span>
                    {primarySlugs.map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          background: 'rgba(200,255,0,0.1)',
                          color: 'rgba(200,255,0,0.9)',
                          border: '1px solid rgba(200,255,0,0.25)',
                        }}
                      >
                        {MUSCLE_SLUG_LABELS[s as MuscleSlug] ?? s}
                      </span>
                    ))}
                  </div>
                )}
                {secondarySlugs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider shrink-0"
                      style={{ color: 'rgba(120,160,255,0.7)' }}
                    >
                      Secondary:
                    </span>
                    {secondarySlugs.map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          background: 'rgba(120,160,255,0.1)',
                          color: 'rgba(120,160,255,0.9)',
                          border: '1px solid rgba(120,160,255,0.25)',
                        }}
                      >
                        {MUSCLE_SLUG_LABELS[s as MuscleSlug] ?? s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sticky save footer */}
        <div
          className="shrink-0 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}
        >
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-4 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-opacity active:scale-[0.99] disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            <Dumbbell className="w-4 h-4" />
            {saving ? 'Saving…' : 'Create & Add to Workout'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
