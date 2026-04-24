import React, { useMemo } from 'react';
import type { ExerciseEntry } from '../../legacy-pages/Log';
import { SetRow } from './SetRow';
import {
  DistanceUnit,
  WeightUnit,
  formatSetValue,
  getFieldKinds,
  getInputLabels,
  getUnitDisplay,
  isDistanceExerciseType,
  isWeightExerciseType,
  resolveExerciseInputType,
} from '../../lib/exerciseTypes';

interface ExerciseContentProps {
  exercise: ExerciseEntry;
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  bodyWeightForMath?: number | null;
  onWeightUnitChange: (unit: WeightUnit) => void;
  onDistanceUnitChange: (unit: DistanceUnit) => void;
  onUpdateSet: (setId: string, field: 'weight' | 'reps', value: number) => void;
  onMarkSetDone: (setId: string) => void;
  onAddSet: () => void;
  onClearPrefill: () => void;
  showPrefillBanner: boolean;
  onOpenDial: (setId: string, field: 'weight' | 'reps') => void;
}

const getFieldBinding = (type: ReturnType<typeof resolveExerciseInputType>) => {
  switch (type) {
    case 'reps_only':
      return { primary: 'reps' as const, secondary: null };
    case 'distance_only':
      return { primary: 'weight' as const, secondary: null };
    default:
      return { primary: 'weight' as const, secondary: 'reps' as const };
  }
};

export const ExerciseContent: React.FC<ExerciseContentProps> = (props) => {
  const {
    exercise,
    weightUnit = 'kg',
    distanceUnit = 'km',
    bodyWeightForMath = null,
    onWeightUnitChange,
    onDistanceUnitChange,
    onMarkSetDone,
    onAddSet,
    onClearPrefill,
    showPrefillBanner,
    onOpenDial,
  } = props;

  const exerciseType = useMemo(() => resolveExerciseInputType(exercise.name), [exercise.name]);
  const inputLabels = useMemo(
    () => getInputLabels(exerciseType, { weightUnit, distanceUnit }),
    [distanceUnit, exerciseType, weightUnit],
  );
  const fieldKinds = useMemo(() => getFieldKinds(exerciseType), [exerciseType]);
  const binding = useMemo(() => getFieldBinding(exerciseType), [exerciseType]);

  const completedSets = useMemo(() => exercise.sets.filter((set) => set.done).length, [exercise.sets]);

  const totalVolume = useMemo(
    () =>
      exercise.sets
        .filter((set) => set.done)
        .reduce((sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0), 0),
    [exercise.sets],
  );

  const statUnit = getUnitDisplay(exerciseType, { weightUnit, distanceUnit }).toLowerCase();
  const relativeLoad =
    bodyWeightForMath && bodyWeightForMath > 0 && isWeightExerciseType(exerciseType)
      ? totalVolume / bodyWeightForMath
      : null;

  return (
    <div className="h-full overflow-y-auto bg-transparent pb-24">
      <div className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-base)]/90 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]/92">
          <div className="grid grid-cols-3">
            {/* Sets */}
            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Sets</div>
              <div className="text-[20px] font-black text-[var(--text-primary)] tabular-nums leading-none">
                {completedSets}
                <span className="text-[14px] font-bold text-[var(--text-muted)]">/{exercise.sets.length}</span>
              </div>
            </div>

            {/* divider */}
            <div className="border-l border-r border-[var(--border)] flex flex-col gap-0.5 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Volume</div>
              <div className="text-[20px] font-black text-[var(--text-primary)] tabular-nums leading-none">
                {totalVolume > 0 ? totalVolume.toLocaleString() : <span className="text-[var(--text-muted)]">—</span>}
              </div>
              {relativeLoad !== null && (
                <div className="text-[10px] font-semibold tracking-wide text-[var(--text-secondary)] tabular-nums">
                  {relativeLoad.toFixed(2)}x BW
                </div>
              )}
            </div>

            {/* Unit toggle */}
            <div className="flex flex-col gap-1 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Unit</div>
              {isWeightExerciseType(exerciseType) && (
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-[3px]">
                  {(['kg', 'lbs'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onWeightUnitChange(unit)}
                      className={`h-6 min-w-[34px] rounded-md px-2 text-[10px] font-bold uppercase transition-all ${
                        weightUnit === unit
                          ? 'border border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {isDistanceExerciseType(exerciseType) && (
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-[3px]">
                  {(['km', 'mi'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onDistanceUnitChange(unit)}
                      className={`h-6 min-w-[34px] rounded-md px-2 text-[10px] font-bold uppercase transition-all ${
                        distanceUnit === unit
                          ? 'border border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {!isWeightExerciseType(exerciseType) && !isDistanceExerciseType(exerciseType) && (
                <div className="text-[13px] font-bold text-[var(--text-primary)] uppercase">{statUnit || '—'}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-3">
        {showPrefillBanner && exercise.lastSession && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/8 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span className="text-[12px] font-medium text-[var(--text-primary)]">
                Prefilled from {exercise.lastSession.date}
              </span>
            </div>
            <button
              onClick={onClearPrefill}
              className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)] transition-colors hover:opacity-85"
            >
              Clear
            </button>
          </div>
        )}

        {exercise.sets.map((set, index) => {
          const primaryField = binding.primary;
          const secondaryField = binding.secondary;

          return (
            <SetRow
              key={set.id}
              index={index + 1}
              set={set}
              onMarkDone={() => onMarkSetDone(set.id)}
              onOpenDial={(field) => onOpenDial(set.id, field)}
              primary={{
                field: primaryField,
                label: inputLabels.primary,
                value: set[primaryField],
                displayValue: formatSetValue(fieldKinds.primary, set[primaryField]),
              }}
              secondary={
                secondaryField && inputLabels.secondary
                  ? {
                      field: secondaryField,
                      label: inputLabels.secondary,
                      value: set[secondaryField],
                      displayValue: formatSetValue(fieldKinds.secondary || 'reps', set[secondaryField]),
                    }
                  : null
              }
            />
          );
        })}

        <button
          onClick={onAddSet}
          className="h-14 w-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)]/45 text-[14px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] transition-all hover:border-[var(--accent)]/35 hover:text-[var(--accent)] active:scale-[0.99]"
        >
          + Add Set
        </button>

      </div>
    </div>
  );
};
