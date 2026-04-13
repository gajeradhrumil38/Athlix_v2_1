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
  onTap: () => void;
}> = ({ field, onTap }) => {
  return (
    <button
      onClick={onTap}
      className="h-20 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-center transition-all active:scale-[0.99] active:border-white/20"
    >
      <div className="tabular-nums text-[34px] leading-[1] font-black text-[#EAF1F8]">{field.displayValue}</div>
      <div className="mt-1 text-[12px] font-semibold tracking-[0.12em] text-[#9FB1C4]">{field.label}</div>
      <div className="text-[11px] text-[#74879D]">Tap to edit</div>
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
      className={`relative rounded-2xl border p-3 transition-all ${
        set.done
          ? 'border-white/14 bg-[rgba(97,123,143,0.16)]'
          : 'border-white/10 bg-[rgba(19,28,42,0.72)]'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <div
            className={`h-11 w-11 rounded-full border flex items-center justify-center font-bold text-[18px] ${
              set.done
                ? 'border-[#7A91A8] bg-[#32465A] text-[#E7EEF6]'
                : 'border-[#42546D] text-[#DEE9F5]'
            }`}
          >
            {set.done ? <Check className="w-5 h-5" /> : index}
          </div>
          <div className="text-[12px] font-bold tracking-[0.14em] text-[#8DA2B9] uppercase">Set {index}</div>
        </div>

        <button
          onClick={onMarkDone}
          aria-label={set.done ? `Mark set ${index} incomplete` : `Mark set ${index} complete`}
          className={`h-[52px] w-[52px] rounded-full border flex items-center justify-center transition-all active:scale-95 ${
            set.done
              ? 'border-[#7AA1B8] bg-[#2E4F65] text-[#EAF2FA]'
              : 'border-white/20 bg-white/[0.04] text-white/50'
          }`}
        >
          <Check className="w-6 h-6" />
        </button>
      </div>

      <div className={`grid gap-3 ${secondary ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <ValueBox field={primary} onTap={() => onOpenDial(primary.field)} />
        {secondary && <ValueBox field={secondary} onTap={() => onOpenDial(secondary.field)} />}
      </div>
    </div>
  );
};
