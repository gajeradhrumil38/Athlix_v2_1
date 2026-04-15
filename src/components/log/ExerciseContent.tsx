import React, { useMemo, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
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
  elapsedLabel: string;
  startedAtLabel: string;
  onWeightUnitChange: (unit: WeightUnit) => void;
  onDistanceUnitChange: (unit: DistanceUnit) => void;
  onUpdateSet: (setId: string, field: 'weight' | 'reps', value: number) => void;
  onMarkSetDone: (setId: string) => void;
  onAddSet: () => void;
  onClearPrefill: () => void;
  showPrefillBanner: boolean;
  onOpenDial: (setId: string, field: 'weight' | 'reps') => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onFinishExercise: () => void;
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
    elapsedLabel,
    startedAtLabel,
    onWeightUnitChange,
    onDistanceUnitChange,
    onMarkSetDone,
    onAddSet,
    onClearPrefill,
    showPrefillBanner,
    onOpenDial,
    onSwipeLeft,
    onSwipeRight,
    onFinishExercise,
  } = props;

  const touchStart = useRef(0);
  const touchEnd = useRef(0);

  const exerciseType = useMemo(() => resolveExerciseInputType(exercise.name), [exercise.name]);
  const inputLabels = useMemo(
    () => getInputLabels(exerciseType, { weightUnit, distanceUnit }),
    [distanceUnit, exerciseType, weightUnit],
  );
  const fieldKinds = useMemo(() => getFieldKinds(exerciseType), [exerciseType]);
  const binding = useMemo(() => getFieldBinding(exerciseType), [exerciseType]);

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStart.current = event.targetTouches[0].clientX;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    touchEnd.current = event.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    const delta = touchStart.current - touchEnd.current;
    if (delta > 50) onSwipeLeft();
    if (delta < -50) onSwipeRight();
  };

  const completedSets = useMemo(() => exercise.sets.filter((set) => set.done).length, [exercise.sets]);

  const totalVolume = useMemo(
    () =>
      exercise.sets
        .filter((set) => set.done)
        .reduce((sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0), 0),
    [exercise.sets],
  );

  const allSetsDone = exercise.sets.length > 0 && completedSets === exercise.sets.length;
  const statUnit = getUnitDisplay(exerciseType, { weightUnit, distanceUnit }).toLowerCase();
  const relativeLoad =
    bodyWeightForMath && bodyWeightForMath > 0 && isWeightExerciseType(exerciseType)
      ? totalVolume / bodyWeightForMath
      : null;

  return (
    <div
      className="h-full overflow-y-auto bg-transparent pb-[calc(env(safe-area-inset-bottom)+208px)]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sticky top-0 z-20 border-b border-white/5 bg-[#0E141F]/72 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[30px] sm:text-[34px] leading-none font-black tracking-tight text-white">{exercise.name}</h2>
          <button
            onClick={onSwipeRight}
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[12px] font-medium text-[#D2DEEA]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-[#AEBECD]">
          <span>Started {startedAtLabel}</span>
          <span className="mx-2 text-white/30">·</span>
          <span className="tabular-nums">Elapsed {elapsedLabel}</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[rgba(12,20,32,0.72)]">
          <div className="grid grid-cols-3">
            {/* Sets */}
            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4E6579]">Sets</div>
              <div className="text-[20px] font-black text-white tabular-nums leading-none">{completedSets}<span className="text-[14px] font-bold text-[#3E5568]">/{exercise.sets.length}</span></div>
            </div>

            {/* divider */}
            <div className="border-l border-r border-white/[0.06] flex flex-col gap-0.5 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4E6579]">Volume</div>
              <div className="text-[20px] font-black text-white tabular-nums leading-none">
                {totalVolume > 0 ? totalVolume.toLocaleString() : <span className="text-[#2E4155]">—</span>}
              </div>
              {relativeLoad !== null && (
                <div className="text-[10px] font-semibold tracking-wide text-[#6E879E] tabular-nums">
                  {relativeLoad.toFixed(2)}x BW
                </div>
              )}
            </div>

            {/* Unit toggle */}
            <div className="flex flex-col gap-1 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4E6579]">Unit</div>
              {isWeightExerciseType(exerciseType) && (
                <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-[3px]">
                  {(['kg', 'lbs'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onWeightUnitChange(unit)}
                      className={`h-6 min-w-[34px] rounded-md px-2 text-[10px] font-bold uppercase transition-all ${
                        weightUnit === unit
                          ? 'bg-[#1E3D55] text-[#7BBFE0] shadow-sm'
                          : 'text-[#3E5568]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {isDistanceExerciseType(exerciseType) && (
                <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-[3px]">
                  {(['km', 'mi'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onDistanceUnitChange(unit)}
                      className={`h-6 min-w-[34px] rounded-md px-2 text-[10px] font-bold uppercase transition-all ${
                        distanceUnit === unit
                          ? 'bg-[#1E3D55] text-[#7BBFE0] shadow-sm'
                          : 'text-[#3E5568]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {!isWeightExerciseType(exerciseType) && !isDistanceExerciseType(exerciseType) && (
                <div className="text-[13px] font-bold text-[#C6D3DF] uppercase">{statUnit || '—'}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-3">
        {showPrefillBanner && exercise.lastSession && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#1E3448] bg-[rgba(16,30,46,0.6)] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[#3A7CA8]" />
              <span className="text-[12px] font-medium text-[#7BAAC8]">
                Prefilled from {exercise.lastSession.date}
              </span>
            </div>
            <button
              onClick={onClearPrefill}
              className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#3A6A8A] transition-colors hover:text-[#6AADD4]"
            >
              Clear
            </button>
          </div>
        )}

        {!exercise.lastSession && (
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-[12px] text-[#3E5568]">
            First time doing this exercise
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
          className="h-14 w-full rounded-xl border border-dashed border-[#1E3448] bg-white/[0.015] text-[14px] font-semibold tracking-[0.06em] text-[#2E5270] transition-all hover:border-[#2E5270] hover:text-[#4A87AD] active:scale-[0.99]"
        >
          + Add Set
        </button>

        {allSetsDone && (
          <button
            onClick={onFinishExercise}
            className="h-12 w-full rounded-xl bg-[#CAD7E4] text-[15px] font-semibold text-[#0F1A27]"
          >
            Finish Exercise
          </button>
        )}
      </div>
    </div>
  );
};
