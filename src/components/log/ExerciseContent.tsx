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

  return (
    <div
      className="flex-1 overflow-y-auto bg-transparent pb-[calc(env(safe-area-inset-bottom)+208px)]"
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

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#8294A9]">Sets</div>
              <div className="text-[22px] font-bold text-white tabular-nums">{completedSets}/{exercise.sets.length}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#8294A9]">Volume</div>
              <div className="text-[22px] font-bold text-white tabular-nums">{totalVolume.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#8294A9]">Unit</div>
              {isWeightExerciseType(exerciseType) && (
                <div className="mt-1 inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
                  {(['kg', 'lbs'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onWeightUnitChange(unit)}
                      className={`h-7 min-w-[40px] rounded-md px-2 text-[11px] font-semibold uppercase ${
                        weightUnit === unit ? 'bg-white/20 text-white' : 'text-[#8EA2B8]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {isDistanceExerciseType(exerciseType) && (
                <div className="mt-1 inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
                  {(['km', 'mi'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onDistanceUnitChange(unit)}
                      className={`h-7 min-w-[40px] rounded-md px-2 text-[11px] font-semibold uppercase ${
                        distanceUnit === unit ? 'bg-white/20 text-white' : 'text-[#8EA2B8]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {!isWeightExerciseType(exerciseType) && !isDistanceExerciseType(exerciseType) && (
                <div className="text-[14px] font-semibold text-[#C6D3DF] uppercase">{statUnit || '--'}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-3">
        {showPrefillBanner && exercise.lastSession && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-[#C4D1DE]">
            <span>Prefilled from last session ({exercise.lastSession.date})</span>
            <button onClick={onClearPrefill} className="text-[12px] font-semibold text-[#BFD0DF]">
              Clear
            </button>
          </div>
        )}

        {!exercise.lastSession && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-[#AEBECD]">
            First time doing this exercise.
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
          className="h-14 w-full rounded-xl border border-dashed border-white/20 bg-white/[0.02] text-[16px] font-medium text-[#C9D7E5]"
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
