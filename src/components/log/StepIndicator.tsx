import React from 'react';
import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const steps = [1, 2, 3, 4];

  return (
    <div className="flex items-center justify-center w-full py-4">
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <div className="flex flex-col items-center">
            <div 
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                currentStep > step 
                  ? 'bg-[var(--accent)] text-black' 
                  : currentStep === step 
                    ? 'bg-[var(--accent)] text-black ring-4 ring-[var(--accent-dim)]' 
                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)]'
              }`}
            >
              {currentStep > step ? <Check className="w-3 h-3" /> : step}
            </div>
          </div>
          {index < steps.length - 1 && (
            <div className={`h-[2px] w-8 mx-1 transition-colors ${
              currentStep > step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
