import React from 'react';
import { Check } from 'lucide-react';
import type { Set } from '../../legacy-pages/Log';

interface SetRowField {
  field: 'weight' | 'reps';
  label: string;
  value: number | null;
  displayValue: string;
}

interface SetRowProps {
  index: number;
  set: Set;
  primary: SetRowField;
  secondary?: SetRowField | null;
  onOpenDial: (field: 'weight' | 'reps') => void;
  onMarkDone: () => void;
}

const ValueBox: React.FC<{
  field: SetRowField;
  isDone: boolean;
  onTap: () => void;
}> = ({ field, isDone, onTap }) => {
  return (
    <button
      onClick={onTap}
      className="relative flex h-[82px] w-full flex-col items-center justify-center gap-[3px] overflow-hidden rounded-lg border text-center transition-all active:scale-[0.97]"
      style={{
        background: 'var(--bg-base)',
        borderColor: isDone ? 'rgba(200,255,0,0.12)' : 'var(--border)',
      }}
    >
      {/* faint top shimmer */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      <div className="font-victory tabular-nums text-[36px] leading-none font-black text-[var(--text-primary)]">
        {field.displayValue}
      </div>
      <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--text-secondary)]">
        {field.label}
      </div>
    </button>
  );
};

export const SetRow: React.FC<SetRowProps> = ({
  index,
  set,
  primary,
  secondary,
  onOpenDial,
  onMarkDone,
}) => {
  return (
    <div
      className="relative overflow-hidden rounded-lg border transition-all duration-200"
      style={{
        background: 'var(--bg-base)',
        borderColor: set.done ? 'rgba(200,255,0,0.12)' : 'var(--border)',
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-300"
        style={{
          background: set.done ? 'var(--accent)' : 'var(--border)',
          boxShadow: set.done ? '2px 0 10px rgba(200,255,0,0.30)' : 'none',
        }}
      />

      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 pl-5">
        <div className="flex items-center gap-2">
          <div
            className="rounded-md px-2 py-[3px] text-[10px] font-bold tracking-[0.14em] uppercase transition-colors duration-200"
            style={
              set.done
                ? { border: '1px solid rgba(200,255,0,0.28)', color: 'var(--accent)', background: 'transparent' }
                : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
            }
          >
            Set {index}
          </div>
          {set.done && (
            <span className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: 'rgba(200,255,0,0.70)' }}>
              Done
            </span>
          )}
        </div>

        {/* Check button — square (8px radius) matching design */}
        <button
          onClick={onMarkDone}
          aria-label={set.done ? `Mark set ${index} incomplete` : `Mark set ${index} complete`}
          className="h-10 w-10 rounded-lg border flex items-center justify-center transition-all duration-200 active:scale-95"
          style={
            set.done
              ? {
                  background: 'rgba(200,255,0,0.10)',
                  borderColor: 'rgba(200,255,0,0.50)',
                  color: 'var(--accent)',
                  boxShadow: '0 0 14px rgba(200,255,0,0.25)',
                }
              : {
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-muted)',
                }
          }
        >
          <Check className="w-4 h-4" />
        </button>
      </div>

      {/* Value boxes */}
      <div className={`grid gap-2 px-3 pb-3 pl-4 ${secondary ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <ValueBox field={primary} isDone={set.done} onTap={() => onOpenDial(primary.field)} />
        {secondary && (
          <ValueBox field={secondary} isDone={set.done} onTap={() => onOpenDial(secondary.field)} />
        )}
      </div>
    </div>
  );
};
