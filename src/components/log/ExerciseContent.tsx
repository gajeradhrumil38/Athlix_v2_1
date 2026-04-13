import React, { useMemo, useRef } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
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

export const ExerciseContent: React.FC<ExerciseContentProps> = ({
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
}) => {
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

  const lastSessionVolume = exercise.lastSession?.totalVolume || 0;
  const vsLast = totalVolume - lastSessionVolume;
  const allSetsDone = exercise.sets.length > 0 && completedSets === exercise.sets.length;

  const statUnit = getUnitDisplay(exerciseType, { weightUnit, distanceUnit }).toLowerCase();

  return (
    <div
      className="flex-1 overflow-y-auto bg-[#0F1724] pb-[calc(env(safe-area-inset-bottom)+120px)]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0F1724]/85 px-3 pb-3 pt-3 backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#00D4FF]">Exercise</p>
            <h2 className="text-[20px] font-black text-white tracking-tight">{exercise.name}</h2>
          </div>
          <button
            onClick={onSwipeRight}
            className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-[12px] font-semibold text-[#C5D5E5] inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        <div className="mb-2 rounded-xl border border-white/10 bg-[#111B2B] px-3 py-2 text-[13px] text-[#AFC3D7]">
          <span className="font-semibold text-[#D8E6F4]">Started {startedAtLabel}</span>
          <span className="mx-2 text-white/30">→</span>
          <span>
            Elapsed: <span className="font-black tabular-nums text-[#00D4FF]">{elapsedLabel}</span>
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111B2B]/90 p-3">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#7E93A7]">Sets</div>
              <div className="text-[20px] font-black text-white tabular-nums">{completedSets}/{exercise.sets.length}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#7E93A7]">Vol</div>
              <div className="text-[20px] font-black text-white tabular-nums">{totalVolume.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#7E93A7]">Vs Last</div>
              <div className={`text-[20px] font-black tabular-nums ${vsLast >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {vsLast >= 0 ? '+' : ''}{vsLast.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#7E93A7]">Unit</div>
              {isWeightExerciseType(exerciseType) && (
                <div className="mt-1 inline-flex rounded-xl border border-white/10 bg-[#0D1522] p-1">
                  {(['kg', 'lbs'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onWeightUnitChange(unit)}
                      className={`h-7 min-w-[40px] rounded-lg px-2 text-[11px] font-bold uppercase ${
                        weightUnit === unit ? 'bg-[#00D4FF] text-black' : 'text-[#8EA7BE]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {isDistanceExerciseType(exerciseType) && (
                <div className="mt-1 inline-flex rounded-xl border border-white/10 bg-[#0D1522] p-1">
                  {(['km', 'mi'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onDistanceUnitChange(unit)}
                      className={`h-7 min-w-[40px] rounded-lg px-2 text-[11px] font-bold uppercase ${
                        distanceUnit === unit ? 'bg-[#00D4FF] text-black' : 'text-[#8EA7BE]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {!isWeightExerciseType(exerciseType) && !isDistanceExerciseType(exerciseType) && (
                <div className="text-[14px] font-black text-[#BFD0DF] uppercase">{statUnit || '--'}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pt-3 space-y-3">
        {showPrefillBanner && exercise.lastSession && (
          <div className="rounded-xl border border-[#00D4FF]/30 bg-[#00D4FF]/10 p-3 text-sm text-[#C8F5FF] flex items-center justify-between">
            <div>
              Pre-filled from last session · {exercise.lastSession.date}
            </div>
            <button
              onClick={onClearPrefill}
              className="text-[12px] font-bold uppercase tracking-wider text-[#8BE9FF]"
            >
              Clear
            </button>
          </div>
        )}

        {!exercise.lastSession && (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-100 inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            First time doing this exercise! Start building your benchmark.
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
          className="w-full h-14 rounded-xl border border-dashed border-[#00D4FF]/55 bg-[#00D4FF]/5 text-[#7DE5F6] text-[16px] font-semibold"
        >
          + Add Set
        </button>

        {allSetsDone && (
          <button
            onClick={onFinishExercise}
            className="w-full h-14 rounded-xl bg-emerald-500 text-[#062A14] text-[16px] font-black animate-pulse"
          >
            Finish Exercise
          </button>
        )}
      </div>
    </div>
  );
};
