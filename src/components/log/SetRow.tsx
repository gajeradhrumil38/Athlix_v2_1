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
      className={`relative flex h-[82px] w-full flex-col items-center justify-center gap-[3px] overflow-hidden rounded-2xl border text-center transition-all active:scale-[0.97] ${
        isDone
          ? 'border-[var(--accent)]/22 bg-[var(--accent)]/8'
          : 'border-[var(--border)] bg-[var(--bg-elevated)]'
      }`}
    >
      {/* top shimmer line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="tabular-nums text-[36px] leading-none font-black text-[var(--text-primary)]">{field.displayValue}</div>
      <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--text-muted)]">{field.label}</div>
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
      className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
        set.done
          ? 'border-[var(--accent)]/22 bg-[var(--accent)]/6'
          : 'border-[var(--border)] bg-[var(--bg-surface)]'
      }`}
    >
      {/* left accent bar */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-200 ${
          set.done ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
        }`}
      />

      {/* header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 pl-5">
        <div className="flex items-center gap-2">
          <div
            className={`rounded-md px-2 py-[3px] text-[10px] font-bold tracking-[0.14em] uppercase transition-colors duration-200 ${
              set.done
                ? 'border border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
            }`}
          >
            Set {index}
          </div>
          {set.done && (
            <span className="text-[10px] font-semibold tracking-[0.08em] text-[var(--accent)]/90 uppercase">
              Done
            </span>
          )}
        </div>

        <button
          onClick={onMarkDone}
          aria-label={set.done ? `Mark set ${index} incomplete` : `Mark set ${index} complete`}
          className={`h-[46px] w-[46px] rounded-full border flex items-center justify-center transition-all duration-200 active:scale-95 ${
            set.done
              ? 'border-[var(--accent)]/40 bg-[var(--accent-dim)] text-[var(--accent)]'
              : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
          }`}
        >
          <Check className="w-5 h-5" />
        </button>
      </div>

      {/* value boxes */}
      <div className={`grid gap-2 px-3 pb-3 pl-4 ${secondary ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <ValueBox field={primary} isDone={set.done} onTap={() => onOpenDial(primary.field)} />
        {secondary && (
          <ValueBox field={secondary} isDone={set.done} onTap={() => onOpenDial(secondary.field)} />
        )}
      </div>
    </div>
  );
};
