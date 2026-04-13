import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import type { DialFieldKind, ExerciseInputType, WeightUnit, DistanceUnit } from '../../lib/exerciseTypes';
import { haptics } from '../../lib/haptics';

interface DialPickerProps {
  title: string;
  fieldKind: DialFieldKind;
  inputType: ExerciseInputType;
  initialValue: number;
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  onClose: () => void;
  onConfirm: (value: number) => void;
}

interface PickerColumn {
  id: string;
  values: number[];
  format: (value: number) => string;
  initialIndex: number;
}

const DIAL_ITEM_HEIGHT = 44;
const DIAL_VIEW_HEIGHT = 220;
const DIAL_PADDING = (DIAL_VIEW_HEIGHT - DIAL_ITEM_HEIGHT) / 2;
const DIAL_SNAP_DELAY = 90;

const clampIndex = (index: number, length: number) => Math.max(0, Math.min(length - 1, index));

const buildColumns = (
  fieldKind: DialFieldKind,
  inputType: ExerciseInputType,
  initialValue: number,
  weightUnit: WeightUnit,
): PickerColumn[] => {
  const wholePart = Math.floor(Math.max(0, initialValue));

  switch (fieldKind) {
    case 'weight': {
      const maxWeight = weightUnit === 'kg' ? 300 : 600;
      const wholeValues = Array.from({ length: maxWeight + 1 }, (_, index) => index);
      const decimalValues = [0, 5];
      const decimal = Math.abs(initialValue - wholePart) >= 0.25 ? 5 : 0;
      return [
        {
          id: 'whole',
          values: wholeValues,
          format: (value) => String(value),
          initialIndex: Math.min(maxWeight, wholePart),
        },
        {
          id: 'decimal',
          values: decimalValues,
          format: (value) => `.${value}`,
          initialIndex: decimalValues.findIndex((value) => value === decimal),
        },
      ];
    }

    case 'distance': {
      const wholeValues = Array.from({ length: 101 }, (_, index) => index);
      const decimalValues = Array.from({ length: 10 }, (_, index) => index);
      const decimal = Math.max(0, Math.min(9, Math.round((initialValue - wholePart) * 10)));
      return [
        {
          id: 'whole',
          values: wholeValues,
          format: (value) => String(value),
          initialIndex: Math.min(wholeValues.length - 1, wholePart),
        },
        {
          id: 'decimal',
          values: decimalValues,
          format: (value) => `.${value}`,
          initialIndex: decimal,
        },
      ];
    }

    case 'minutes': {
      const max = inputType === 'time_only' ? 120 : 180;
      const values = Array.from({ length: max + 1 }, (_, index) => index);
      return [
        {
          id: 'minutes',
          values,
          format: (value) => String(value),
          initialIndex: Math.max(0, Math.min(values.length - 1, Math.round(initialValue))),
        },
      ];
    }

    case 'seconds': {
      const values = Array.from({ length: 12 }, (_, index) => index * 5);
      const snapped = Math.max(0, Math.min(55, Math.round(initialValue / 5) * 5));
      return [
        {
          id: 'seconds',
          values,
          format: (value) => String(value).padStart(2, '0'),
          initialIndex: values.findIndex((value) => value === snapped),
        },
      ];
    }

    case 'reps': {
      const min = inputType === 'reps_only' ? 1 : 0;
      const max = inputType === 'reps_only' ? 50 : 80;
      const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
      const target = Math.max(min, Math.min(max, Math.round(initialValue)));
      return [
        {
          id: 'reps',
          values,
          format: (value) => String(value),
          initialIndex: values.findIndex((value) => value === target),
        },
      ];
    }

    case 'height': {
      const values = Array.from({ length: 251 }, (_, index) => index);
      return [
        {
          id: 'height',
          values,
          format: (value) => String(value),
          initialIndex: Math.max(0, Math.min(values.length - 1, Math.round(initialValue))),
        },
      ];
    }

    case 'calories': {
      const values = Array.from({ length: 301 }, (_, index) => index * 5);
      const snapped = Math.round(Math.max(0, initialValue) / 5) * 5;
      const initialIndex = Math.max(0, Math.min(values.length - 1, Math.round(snapped / 5)));
      return [
        {
          id: 'calories',
          values,
          format: (value) => String(value),
          initialIndex,
        },
      ];
    }

    default:
      return [
        {
          id: 'default',
          values: Array.from({ length: 101 }, (_, index) => index),
          format: (value) => String(value),
          initialIndex: Math.max(0, Math.min(100, Math.round(initialValue))),
        },
      ];
  }
};

const composeValue = (fieldKind: DialFieldKind, selected: number[]) => {
  if (fieldKind === 'weight') {
    const whole = selected[0] || 0;
    const decimal = selected[1] || 0;
    return Number((whole + (decimal === 5 ? 0.5 : 0)).toFixed(1));
  }

  if (fieldKind === 'distance') {
    const whole = selected[0] || 0;
    const decimal = selected[1] || 0;
    return Number((whole + decimal / 10).toFixed(1));
  }

  return Number(selected[0] || 0);
};

interface DialColumnProps {
  values: number[];
  format: (value: number) => string;
  initialIndex: number;
  onChange: (value: number) => void;
}

const DialColumn: React.FC<DialColumnProps> = ({ values, format, initialIndex, onChange }) => {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const hasMountedRef = useRef(false);
  const snapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSelectedIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const root = columnRef.current;
    if (!root) return;

    const target = itemRefs.current[initialIndex];
    if (target) {
      root.scrollTo({ top: target.offsetTop - DIAL_PADDING, behavior: 'auto' });
    }
    hasMountedRef.current = false;
    const enableHapticsTimer = window.setTimeout(() => {
      hasMountedRef.current = true;
    }, 120);

    return () => {
      window.clearTimeout(enableHapticsTimer);
    };
  }, [initialIndex]);

  useEffect(
    () => () => {
      if (snapTimerRef.current) {
        window.clearTimeout(snapTimerRef.current);
      }
    },
    [],
  );

  const syncSelectedIndex = (scrollTop: number) => {
    const nextIndex = clampIndex(Math.round(scrollTop / DIAL_ITEM_HEIGHT), values.length);
    setSelectedIndex((prev) => {
      if (prev !== nextIndex && hasMountedRef.current) {
        haptics.tick();
      }
      return nextIndex;
    });
    return nextIndex;
  };

  const snapToNearest = (behavior: ScrollBehavior = 'smooth') => {
    const root = columnRef.current;
    if (!root) return;
    const nextIndex = clampIndex(Math.round(root.scrollTop / DIAL_ITEM_HEIGHT), values.length);
    root.scrollTo({ top: nextIndex * DIAL_ITEM_HEIGHT, behavior });
  };

  const handleScroll = () => {
    const root = columnRef.current;
    if (!root) return;

    syncSelectedIndex(root.scrollTop);
    if (snapTimerRef.current) {
      window.clearTimeout(snapTimerRef.current);
    }
    snapTimerRef.current = window.setTimeout(() => {
      snapToNearest('smooth');
    }, DIAL_SNAP_DELAY);
  };

  useEffect(() => {
    const nextValue = values[selectedIndex];
    if (nextValue == null) return;
    onChange(nextValue);
  }, [onChange, selectedIndex, values]);

  return (
    <div className="relative flex-1 min-w-0">
      <div
        ref={columnRef}
        onScroll={handleScroll}
        onTouchEnd={() => snapToNearest('smooth')}
        onMouseUp={() => snapToNearest('smooth')}
        className="dial-column h-[220px] overflow-y-auto rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.01)_100%)]"
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          paddingTop: DIAL_PADDING,
          paddingBottom: DIAL_PADDING,
        }}
      >
        {values.map((value, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={`${value}-${index}`}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              data-index={index}
              onClick={() => {
                const node = itemRefs.current[index];
                if (!node || !columnRef.current) return;
                columnRef.current.scrollTo({ top: node.offsetTop - DIAL_PADDING, behavior: 'smooth' });
              }}
              className={`dial-item h-11 w-full flex items-center justify-center text-center tabular-nums font-mono transition-all duration-100 scroll-snap-align-center ${
                selected ? 'text-[#F3F7FB] text-[30px] font-semibold selected' : 'text-[#6F8298] text-[22px] font-medium'
              }`}
              style={{ scrollSnapAlign: 'center' }}
            >
              {format(value)}
            </button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute left-1 right-1 top-1/2 -translate-y-1/2 h-11 rounded-xl border border-white/15 bg-[rgba(142,160,178,0.09)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-2xl bg-gradient-to-b from-[#0D1421] via-[#0D1421]/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-2xl bg-gradient-to-t from-[#0D1421] via-[#0D1421]/80 to-transparent" />
    </div>
  );
};

export const DialPicker: React.FC<DialPickerProps> = ({
  title,
  fieldKind,
  inputType,
  initialValue,
  weightUnit = 'kg',
  distanceUnit = 'km',
  onClose,
  onConfirm,
}) => {
  const columns = useMemo(
    () => buildColumns(fieldKind, inputType, initialValue, weightUnit),
    [fieldKind, initialValue, inputType, weightUnit],
  );

  const [selectedValues, setSelectedValues] = useState<number[]>(
    columns.map((column) => column.values[Math.max(0, column.initialIndex)] ?? 0),
  );

  useEffect(() => {
    setSelectedValues(columns.map((column) => column.values[Math.max(0, column.initialIndex)] ?? 0));
  }, [columns]);

  const handleColumnChange = (columnIndex: number, value: number) => {
    setSelectedValues((prev) => {
      const next = [...prev];
      next[columnIndex] = value;
      return next;
    });
  };

  const submit = () => {
    onConfirm(composeValue(fieldKind, selectedValues));
  };

  return (
    <div className="fixed inset-0 z-[220]">
      <button
        type="button"
        aria-label="Dismiss picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[860px] rounded-t-[24px] border border-white/10 border-b-0 bg-[rgba(11,17,27,0.96)] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />

        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-white/5 px-3 text-[12px] font-medium text-[#D1DCE7] transition-colors hover:bg-white/10"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <h3 className="text-[16px] font-semibold text-white">
            {title}
            {fieldKind === 'distance' ? ` (${distanceUnit.toUpperCase()})` : ''}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[#9FB1C3] transition-colors hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`grid gap-3 ${columns.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} mb-4`}>
          {columns.map((column, index) => (
            <DialColumn
              key={column.id}
              values={column.values}
              format={column.format}
              initialIndex={column.initialIndex}
              onChange={(value) => handleColumnChange(index, value)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={submit}
          className="h-[52px] w-full rounded-xl bg-[#C9D6E4] text-[15px] font-semibold text-[#0E1A27] transition-colors hover:bg-[#D4DEE9]"
        >
          Done
        </button>
      </motion.div>
    </div>
  );
};
