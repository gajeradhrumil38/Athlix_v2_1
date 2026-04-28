import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
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

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const VIEW_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const VIEW_PADDING = (VIEW_HEIGHT - ITEM_HEIGHT) / 2;
// Increased from 120ms — iOS momentum scrolling can take 300-500ms to settle
const SCROLL_SETTLE_MS = 280;
// How long to wait after programmatic snap before re-enabling scroll reads
const SNAP_ANIMATION_MS = 350;

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
      const wholeValues = Array.from({ length: maxWeight + 1 }, (_, i) => i);
      const decimalValues = [0, 5];
      const decimal = Math.abs(initialValue - wholePart) >= 0.25 ? 5 : 0;
      return [
        {
          id: 'whole',
          values: wholeValues,
          format: (v) => String(v),
          initialIndex: Math.min(maxWeight, wholePart),
          unitLabel: weightUnit.toUpperCase(),
        },
        {
          id: 'decimal',
          values: decimalValues,
          format: (v) => `.${v}`,
          initialIndex: decimalValues.findIndex((v) => v === decimal),
        },
      ];
    }

    case 'distance': {
      const wholeValues = Array.from({ length: 101 }, (_, i) => i);
      const decimalValues = Array.from({ length: 10 }, (_, i) => i);
      const decimal = Math.max(0, Math.min(9, Math.round((initialValue - wholePart) * 10)));
      return [
        {
          id: 'whole',
          values: wholeValues,
          format: (v) => String(v),
          initialIndex: Math.min(wholeValues.length - 1, wholePart),
          unitLabel: distanceUnit.toUpperCase(),
        },
        {
          id: 'decimal',
          values: decimalValues,
          format: (v) => `.${v}`,
          initialIndex: decimal,
        },
      ];
    }

    case 'minutes': {
      const max = inputType === 'time_only' ? 120 : 180;
      const values = Array.from({ length: max + 1 }, (_, i) => i);
      return [
        {
          id: 'minutes',
          values,
          format: (v) => String(v),
          initialIndex: Math.max(0, Math.min(values.length - 1, Math.round(initialValue))),
          unitLabel: 'MIN',
        },
      ];
    }

    case 'seconds': {
      const values = Array.from({ length: 12 }, (_, i) => i * 5);
      const snapped = Math.max(0, Math.min(55, Math.round(initialValue / 5) * 5));
      return [
        {
          id: 'seconds',
          values,
          format: (v) => String(v).padStart(2, '0'),
          initialIndex: values.findIndex((v) => v === snapped),
          unitLabel: 'SEC',
        },
      ];
    }

    case 'reps': {
      const min = inputType === 'reps_only' ? 1 : 0;
      const max = inputType === 'reps_only' ? 50 : 80;
      const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      const target = Math.max(min, Math.min(max, Math.round(initialValue)));
      return [
        {
          id: 'reps',
          values,
          format: (v) => String(v),
          initialIndex: values.findIndex((v) => v === target),
          unitLabel: 'REPS',
        },
      ];
    }

    case 'height': {
      const values = Array.from({ length: 251 }, (_, i) => i);
      return [
        {
          id: 'height',
          values,
          format: (v) => String(v),
          initialIndex: Math.max(0, Math.min(values.length - 1, Math.round(initialValue))),
          unitLabel: 'CM',
        },
      ];
    }

    case 'calories': {
      const values = Array.from({ length: 301 }, (_, i) => i * 5);
      const snapped = Math.round(Math.max(0, initialValue) / 5) * 5;
      const initialIndex = Math.max(0, Math.min(values.length - 1, Math.round(snapped / 5)));
      return [
        {
          id: 'calories',
          values,
          format: (v) => String(v),
          initialIndex,
          unitLabel: 'CAL',
        },
      ];
    }

    default:
      return [
        {
          id: 'default',
          values: Array.from({ length: 101 }, (_, i) => i),
          format: (v) => String(v),
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
  const snapAnimTimerRef = useRef<number | null>(null);
  const isProgrammaticRef = useRef(false); // true while our own snap scroll is animating
  const mountedRef = useRef(false);

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const selectedIndexRef = useRef(initialIndex);

  const selectIndex = useCallback(
    (nextIndex: number, withHaptic: boolean) => {
      const clamped = clampIndex(nextIndex, values.length);
      if (clamped === selectedIndexRef.current) return;
      selectedIndexRef.current = clamped;
      setSelectedIndex(clamped);
      const value = values[clamped];
      if (value != null) onChangeRef.current(value);
      if (withHaptic && mountedRef.current) haptics.tick();
    },
    [values],
  );

  const snapToNearest = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const node = scrollRef.current;
      if (!node) return;
      const nextIndex = clampIndex(Math.round(node.scrollTop / ITEM_HEIGHT), values.length);
      // Update state immediately so the highlight tracks the landing position
      selectIndex(nextIndex, false);
      isProgrammaticRef.current = true;
      node.scrollTo({ top: nextIndex * ITEM_HEIGHT, behavior });

      // Re-enable scroll event handling after animation completes
      if (snapAnimTimerRef.current) window.clearTimeout(snapAnimTimerRef.current);
      snapAnimTimerRef.current = window.setTimeout(() => {
        isProgrammaticRef.current = false;
        // Final authoritative read after animation settles
        if (scrollRef.current) {
          const finalIndex = clampIndex(
            Math.round(scrollRef.current.scrollTop / ITEM_HEIGHT),
            values.length,
          );
          selectIndex(finalIndex, false);
        }
      }, SNAP_ANIMATION_MS);
    },
    [values.length, selectIndex],
  );

  // Initialise scroll position when column mounts or initialIndex changes
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const safeInitial = clampIndex(initialIndex, values.length);
    selectedIndexRef.current = safeInitial;
    setSelectedIndex(safeInitial);
    isProgrammaticRef.current = true;
    node.scrollTo({ top: safeInitial * ITEM_HEIGHT, behavior: 'auto' });

    mountedRef.current = false;
    const t1 = window.setTimeout(() => {
      isProgrammaticRef.current = false;
      mountedRef.current = true;
    }, 120);

    return () => window.clearTimeout(t1);
  }, [initialIndex, values]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    if (snapAnimTimerRef.current) window.clearTimeout(snapAnimTimerRef.current);
  }, []);

  const handleTouchStart = useCallback(() => {
    // User grabbed the wheel — cancel any in-flight programmatic snap
    isProgrammaticRef.current = false;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    if (snapAnimTimerRef.current) window.clearTimeout(snapAnimTimerRef.current);
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
  }, []);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;

    // Hard-clamp: prevents rubber-band bounce from reading out-of-range position
    const maxScroll = (values.length - 1) * ITEM_HEIGHT;
    if (node.scrollTop < 0) { node.scrollTop = 0; return; }
    if (node.scrollTop > maxScroll) { node.scrollTop = maxScroll; return; }

    // Ignore scroll events we triggered ourselves during a snap animation
    if (isProgrammaticRef.current) return;

    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      if (!scrollRef.current || isProgrammaticRef.current) return;
      const nextIndex = Math.round(scrollRef.current.scrollTop / ITEM_HEIGHT);
      selectIndex(nextIndex, true);
    });

    // Reset settle timer — only snap after scroll fully stops
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      if (!isProgrammaticRef.current) snapToNearest('smooth');
    }, SCROLL_SETTLE_MS);
  }, [values.length, selectIndex, snapToNearest]);

  return (
    <div className="relative min-w-0 flex-1" style={{ height: `${VIEW_HEIGHT}px` }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        className="no-scrollbar overflow-y-auto [scrollbar-width:none]"
        style={{
          height: `${VIEW_HEIGHT}px`,
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          paddingTop: VIEW_PADDING,
          paddingBottom: VIEW_PADDING,
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
        }}
      >
        {values.map((value, index) => (
          <div
            key={`${value}-${index}`}
            className={`font-victory relative flex w-full items-center justify-center text-center tabular-nums leading-none select-none ${
              index === selectedIndex
                ? 'font-bold text-[var(--accent)]'
                : 'font-normal text-[var(--text-muted)]'
            }`}
            style={{
              height: `${ITEM_HEIGHT}px`,
              scrollSnapAlign: 'center',
              fontSize: index === selectedIndex ? '32px' : '24px',
              opacity: index === selectedIndex ? 1 : Math.max(0.25, 1 - Math.abs(index - selectedIndex) * 0.25),
              transition: 'font-size 0.12s ease, color 0.12s ease, opacity 0.12s ease',
            }}
          >
            {format(value)}
          </div>
        ))}
      </div>

      {unitLabel && (
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px] font-bold tracking-[0.18em] text-[var(--text-muted)]"
          style={{ right: '12px' }}
        >
          {unitLabel}
        </div>
      )}

      {/* Fade overlays matching the container background */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[72px] bg-gradient-to-b from-[var(--bg-elevated)] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72px] bg-gradient-to-t from-[var(--bg-elevated)] to-transparent" />
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
    columns.map((col) => col.values[Math.max(0, col.initialIndex)] ?? 0),
  );

  useEffect(() => {
    setSelectedValues(columns.map((col) => col.values[Math.max(0, col.initialIndex)] ?? 0));
  }, [columns]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const submit = () => onConfirm(composeValue(fieldKind, selectedValues));

  const liveValue = composeValue(fieldKind, selectedValues);
  const liveUnit = columns[0]?.unitLabel ?? '';

  const liveDisplay = (() => {
    if (fieldKind === 'weight') {
      const whole = selectedValues[0] ?? 0;
      const dec = selectedValues[1] ?? 0;
      return dec === 5 ? `${whole}.5` : `${whole}`;
    }
    if (fieldKind === 'distance') {
      const whole = selectedValues[0] ?? 0;
      const dec = selectedValues[1] ?? 0;
      return `${whole}.${dec}`;
    }
    if (fieldKind === 'seconds') return String(liveValue).padStart(2, '0');
    return String(liveValue);
  })();

  return (
    <div className="fixed inset-0 z-[220]">
      <button
        type="button"
        aria-label="Dismiss picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[860px] rounded-t-[28px] border-t border-x border-[var(--border)] pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3 px-5"
        style={{ background: 'var(--bg-surface)' }}
      >
        {/* Drag pill */}
        <div className="mx-auto mb-5 h-[3px] w-9 rounded-full bg-white/15" />

        {/* Header: label + live value + dismiss */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              {title}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="font-victory tabular-nums leading-none text-[var(--text-primary)]" style={{ fontSize: '48px', fontWeight: 700 }}>
                {liveDisplay}
              </span>
              {liveUnit && (
                <span className="font-victory text-[18px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                  {liveUnit}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors active:bg-white/8"
            style={{ background: 'var(--bg-elevated)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Wheel container */}
        <div
          className={`relative mb-5 flex overflow-hidden rounded-[18px] border border-[var(--border)]`}
          style={{ height: `${VIEW_HEIGHT}px`, background: 'var(--bg-elevated)' }}
        >
          {columns.map((column, columnIndex) => (
            <div
              key={column.id}
              className={`flex flex-col ${columnIndex > 0 ? 'border-l border-[var(--border)]' : ''}`}
              style={{ flex: column.id === 'decimal' ? '0 0 30%' : '1 1 0%' }}
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

          {/* Selection highlight rail */}
          <div
            className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2"
            style={{
              height: `${ITEM_HEIGHT}px`,
              borderRadius: '10px',
              background: 'rgba(200,255,0,0.06)',
              border: '1px solid rgba(200,255,0,0.18)',
              boxShadow: '0 0 12px rgba(200,255,0,0.08)',
            }}
          />
        </div>

        {/* Confirm button */}
        <button
          type="button"
          onClick={submit}
          className="h-[54px] w-full rounded-2xl text-[15px] font-bold tracking-[0.04em] transition-all active:scale-[0.98] bg-[var(--accent)] text-black"
        >
          Set {liveDisplay} {liveUnit}
        </button>
      </motion.div>
    </div>
  );
};
