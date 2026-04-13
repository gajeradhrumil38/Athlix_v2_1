import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import type { DialFieldKind, DistanceUnit, ExerciseInputType, WeightUnit } from '../../lib/exerciseTypes';
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
  unitLabel?: string;
}

// Reference-aligned wheel constants (DurationPicker-style fixed geometry).
const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const VIEW_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const VIEW_PADDING = (VIEW_HEIGHT - ITEM_HEIGHT) / 2;
const COLUMN_SPACING = 5;
const SCROLL_SETTLE_MS = 120;

const clampIndex = (index: number, length: number) => Math.max(0, Math.min(length - 1, index));

const buildColumns = (
  fieldKind: DialFieldKind,
  inputType: ExerciseInputType,
  initialValue: number,
  weightUnit: WeightUnit,
  distanceUnit: DistanceUnit,
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
          unitLabel: weightUnit.toUpperCase(),
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
          unitLabel: distanceUnit.toUpperCase(),
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
          unitLabel: 'MIN',
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
          unitLabel: 'SEC',
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
          unitLabel: 'REPS',
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
          unitLabel: 'CM',
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
          unitLabel: 'CAL',
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

interface WheelColumnProps {
  values: number[];
  format: (value: number) => string;
  initialIndex: number;
  unitLabel?: string;
  onChange: (value: number) => void;
}

const WheelColumn: React.FC<WheelColumnProps> = ({ values, format, initialIndex, unitLabel, onChange }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const selectedIndexRef = useRef(initialIndex);

  const selectIndex = useCallback(
    (nextIndex: number, withHaptic: boolean) => {
      const clamped = clampIndex(nextIndex, values.length);
      if (clamped === selectedIndexRef.current) return;

      selectedIndexRef.current = clamped;
      setSelectedIndex(clamped);
      const value = values[clamped];
      if (value != null) onChange(value);
      if (withHaptic && mountedRef.current) {
        haptics.tick();
      }
    },
    [onChange, values],
  );

  const snapToNearest = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const node = scrollRef.current;
      if (!node) return;
      const nextIndex = clampIndex(Math.round(node.scrollTop / ITEM_HEIGHT), values.length);
      node.scrollTo({ top: nextIndex * ITEM_HEIGHT, behavior });
    },
    [values.length],
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const safeInitial = clampIndex(initialIndex, values.length);
    selectedIndexRef.current = safeInitial;
    setSelectedIndex(safeInitial);
    node.scrollTo({ top: safeInitial * ITEM_HEIGHT, behavior: 'auto' });
    onChange(values[safeInitial] ?? values[0] ?? 0);

    mountedRef.current = false;
    const mountedTimer = window.setTimeout(() => {
      mountedRef.current = true;
    }, 120);

    return () => {
      window.clearTimeout(mountedTimer);
    };
  }, [initialIndex, onChange, values]);

  useEffect(
    () => () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;

    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = window.requestAnimationFrame(() => {
      const nextIndex = Math.round(node.scrollTop / ITEM_HEIGHT);
      selectIndex(nextIndex, true);
    });

    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = window.setTimeout(() => {
      snapToNearest('smooth');
    }, SCROLL_SETTLE_MS);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchEnd={() => snapToNearest('smooth')}
        onMouseUp={() => snapToNearest('smooth')}
        className="no-scrollbar overflow-y-auto [scrollbar-width:none]"
        style={{
          height: `${VIEW_HEIGHT}px`,
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          paddingTop: VIEW_PADDING,
          paddingBottom: VIEW_PADDING,
          touchAction: 'pan-y',
        }}
      >
        {values.map((value, index) => (
          <button
            key={`${value}-${index}`}
            onClick={() => {
              const node = scrollRef.current;
              if (!node) return;
              node.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
            }}
            className={`flex w-full items-center justify-center text-center tabular-nums leading-none ${
              index === selectedIndex
                ? 'font-semibold text-[#F4F8FC]'
                : 'font-normal text-[#6D8095]'
            }`}
            style={{
              height: `${ITEM_HEIGHT}px`,
              scrollSnapAlign: 'center',
              fontSize: '42px',
            }}
          >
            {format(value)}
          </button>
        ))}
      </div>

      {unitLabel && (
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-[0.12em] text-[#8EA3BA]"
          style={{ right: '10px' }}
        >
          {unitLabel}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#0D1421] via-[#0D1421]/86 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0D1421] via-[#0D1421]/86 to-transparent" />
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
    () => buildColumns(fieldKind, inputType, initialValue, weightUnit, distanceUnit),
    [distanceUnit, fieldKind, initialValue, inputType, weightUnit],
  );

  const [selectedValues, setSelectedValues] = useState<number[]>(
    columns.map((column) => column.values[Math.max(0, column.initialIndex)] ?? 0),
  );

  useEffect(() => {
    setSelectedValues(columns.map((column) => column.values[Math.max(0, column.initialIndex)] ?? 0));
  }, [columns]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const submit = () => {
    onConfirm(composeValue(fieldKind, selectedValues));
  };

  return (
    <div className="fixed inset-0 z-[220]">
      <button
        type="button"
        aria-label="Dismiss picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/64 backdrop-blur-[1px]"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[860px] rounded-t-[24px] border border-white/10 border-b-0 bg-[rgba(11,17,27,0.96)] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />

        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-white/5 px-3 text-[12px] font-medium text-[#D1DCE7] transition-colors hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <h3 className="text-[16px] font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[#9FB1C3] transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`relative mb-4 grid overflow-hidden rounded-[20px] border border-white/10 bg-[rgba(16,24,36,0.86)] ${
            columns.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
          }`}
          style={{ gap: `${COLUMN_SPACING}px` }}
        >
          {columns.map((column, columnIndex) => (
            <div
              key={column.id}
              className={columnIndex > 0 ? 'border-l border-white/10' : ''}
            >
              <WheelColumn
                values={column.values}
                format={column.format}
                initialIndex={column.initialIndex}
                unitLabel={column.unitLabel}
                onChange={(value) => {
                  setSelectedValues((prev) => {
                    const next = [...prev];
                    next[columnIndex] = value;
                    return next;
                  });
                }}
              />
            </div>
          ))}
          <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 border-y border-white/20 bg-white/[0.06]" style={{ height: `${ITEM_HEIGHT}px`, borderRadius: '12px' }} />
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
