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
  }, [initialIndex]);

  useEffect(() => {
    const root = columnRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        const index = Number((visible.target as HTMLElement).dataset.index || 0);
        if (Number.isNaN(index)) return;

        setSelectedIndex((prev) => {
          if (prev !== index && hasMountedRef.current) {
            haptics.tick();
          }
          return index;
        });
      },
      {
        root,
        threshold: [0.6, 0.75, 0.9],
      },
    );

    itemRefs.current.forEach((element) => {
      if (element) observer.observe(element);
    });

    hasMountedRef.current = true;

    return () => observer.disconnect();
  }, [values.length]);

  useEffect(() => {
    const nextValue = values[selectedIndex];
    if (nextValue == null) return;
    onChange(nextValue);
  }, [onChange, selectedIndex, values]);

  return (
    <div className="relative flex-1 min-w-0">
      <div
        ref={columnRef}
        className="dial-column h-[220px] overflow-y-scroll rounded-xl border border-white/10 bg-[#141D2B]"
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
              className={`dial-item h-11 w-full flex items-center justify-center text-center transition-all duration-100 scroll-snap-align-center ${
                selected ? 'text-white text-[28px] font-semibold selected' : 'text-white/35 text-[22px] font-medium'
              }`}
              style={{ scrollSnapAlign: 'center' }}
            >
              {format(value)}
            </button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute left-1 right-1 top-1/2 -translate-y-1/2 h-11 rounded-lg border-y border-white/20 bg-white/5" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-xl bg-gradient-to-b from-[#101724] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-xl bg-gradient-to-t from-[#101724] to-transparent" />
    </div>
  );
};

export const DialPicker: React.FC<DialPickerProps> = ({
  title,
  fieldKind,
  inputType,
  initialValue,
  weightUnit = 'kg',
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
        className="absolute inset-0 bg-black/55"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[860px] rounded-t-[20px] border border-white/10 border-b-0 bg-[#101724] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/30" />

        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-white/10 bg-[#1A2433] px-3 text-[12px] font-medium text-[#D1DCE7] inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <h3 className="text-[16px] font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-lg border border-white/10 bg-[#1A2433] text-[#9FB1C3] flex items-center justify-center"
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
          className="w-full h-[52px] rounded-xl bg-[#DDE6F0] text-[#111827] font-semibold text-[15px]"
        >
          Done
        </button>
      </motion.div>
    </div>
  );
};
