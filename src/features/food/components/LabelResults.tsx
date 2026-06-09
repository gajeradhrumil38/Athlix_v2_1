/**
 * LabelResults — shown when the scanned image is a nutrition facts panel.
 *
 * Layout:
 *  1. Product name
 *  2. Three animated health rings (Sugar · Health Score · Sodium)
 *  3. Recommendation badge + reason
 *  4. Chemical ingredient concerns (highlighted)
 *  5. Full nutrition facts table
 *  6. Save / Scan Again buttons
 */

import React, { useMemo } from 'react';
import { CheckCircle2, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { LabelData, DetectedFood } from '../types';
import { scoreLabel } from '../services/healthScore.service';
import { HealthRings } from './HealthRings';

// ─── Daily Value reference ─────────────────────────────────────────────────────

const DV = { fat: 78, saturatedFat: 20, sodium: 2300, totalCarbs: 275, fiber: 28, protein: 50 } as const;
const dvPct = (val: number, ref: number) => Math.round((val / ref) * 100);

// ─── Nutrition Facts table ─────────────────────────────────────────────────────

const NutrientRow: React.FC<{ label: string; value: string; dv?: number; bold?: boolean; indent?: boolean }> = ({
  label, value, dv, bold, indent,
}) => (
  <div
    className="flex items-center justify-between py-1.5"
    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingLeft: indent ? 16 : 0 }}>
    <span style={{ color: bold ? '#fff' : 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: bold ? 700 : 500 }}>
      {label}
    </span>
    <div className="flex items-center gap-3">
      <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{value}</span>
      {dv !== undefined && (
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, minWidth: 32, textAlign: 'right' }}>
          {dv}%
        </span>
      )}
    </div>
  </div>
);

const NutritionTable: React.FC<{ label: LabelData }> = ({ label }) => (
  <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <p style={{ color: '#fff', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        Nutrition Facts
      </p>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>
        Serving: {label.servingSize}
        {label.servingsPerContainer ? `  ·  ${label.servingsPerContainer} servings` : ''}
      </p>
    </div>

    {/* Big calorie row */}
    <div className="px-4 py-3 flex items-baseline justify-between"
      style={{ borderBottom: '2px solid rgba(255,255,255,0.12)' }}>
      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700 }}>Calories</span>
      <span style={{ color: '#C8FF00', fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
        {label.calories}
      </span>
    </div>

    <div className="px-4 pb-3 pt-1">
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 600, textAlign: 'right', paddingBottom: 4 }}>
        % Daily Value*
      </p>
      <NutrientRow label="Total Fat"       value={`${label.totalFat}g`}      dv={dvPct(label.totalFat, DV.fat)}           bold />
      <NutrientRow label="Saturated Fat"   value={`${label.saturatedFat}g`}  dv={dvPct(label.saturatedFat, DV.saturatedFat)} indent />
      <NutrientRow label="Trans Fat"       value={`${label.transFat}g`}      indent />
      <NutrientRow label="Cholesterol"     value={`${label.cholesterol}mg`}  bold />
      <NutrientRow label="Sodium"          value={`${label.sodium}mg`}       dv={dvPct(label.sodium, DV.sodium)}           bold />
      <NutrientRow label="Total Carbohydrate" value={`${label.totalCarbs}g`} dv={dvPct(label.totalCarbs, DV.totalCarbs)}  bold />
      <NutrientRow label="Dietary Fiber"   value={`${label.dietaryFiber}g`}  dv={dvPct(label.dietaryFiber, DV.fiber)}     indent />
      <NutrientRow label="Total Sugars"    value={`${label.totalSugars}g`}   indent />
      {label.addedSugars > 0 && (
        <NutrientRow label="  Incl. Added Sugars" value={`${label.addedSugars}g`} indent />
      )}
      <NutrientRow label="Protein"         value={`${label.protein}g`}       dv={dvPct(label.protein, DV.protein)} bold />
      {(label.vitaminD || label.calcium || label.iron || label.potassium) && (
        <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
          {/* Full-width rows — grid would make border-bottom only span half the card */}
          {label.vitaminD  != null && <NutrientRow label="Vitamin D"  value={`${label.vitaminD}mcg`} />}
          {label.calcium   != null && <NutrientRow label="Calcium"    value={`${label.calcium}mg`}   />}
          {label.iron      != null && <NutrientRow label="Iron"       value={`${label.iron}mg`}      />}
          {label.potassium != null && <NutrientRow label="Potassium"  value={`${label.potassium}mg`} />}
        </div>
      )}
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 8, lineHeight: 1.4 }}>
        *Percent daily values based on a 2,000 calorie diet.
      </p>
    </div>
  </div>
);

// ─── Ingredient concerns list ──────────────────────────────────────────────────

const ConcernItem: React.FC<{ name: string; concern: 'high' | 'medium' | 'low'; effect: string }> = ({
  name, concern, effect,
}) => {
  const color = concern === 'high' ? '#f87171' : concern === 'medium' ? '#fbbf24' : 'rgba(255,255,255,0.5)';
  const bg    = concern === 'high' ? 'rgba(248,113,113,0.08)' : concern === 'medium' ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)';
  const label = concern === 'high' ? 'HIGH' : concern === 'medium' ? 'MEDIUM' : 'LOW';

  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: bg, border: `1px solid ${color}22` }}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <p style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{name}</p>
        <span style={{
          color, fontSize: 9, fontWeight: 800,
          letterSpacing: '0.12em', background: `${color}22`,
          padding: '1px 6px', borderRadius: 4,
        }}>{label}</span>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.4 }}>{effect}</p>
    </div>
  );
};

// ─── Main LabelResults ────────────────────────────────────────────────────────

interface Props {
  label: LabelData;
  imagePreviewUrl: string | null;
  onSave: (foods: DetectedFood[]) => Promise<void>;
  onScanAgain: () => void;
  saving: boolean;
}

export const LabelResults: React.FC<Props> = ({ label, imagePreviewUrl, onSave, onScanAgain, saving }) => {
  const score = useMemo(() => scoreLabel(label), [label]);

  const handleSave = () => {
    const food: DetectedFood = {
      id:           `label-${Date.now()}`,
      name:         label.productName || 'Packaged product',
      servingSize:  label.servingSize,
      servingGrams: label.servingGrams,
      servings:     1,
      calories:     label.calories,
      protein:      label.protein,
      carbs:        label.totalCarbs,
      fat:          label.totalFat,
      fiber:        label.dietaryFiber || undefined,
      sugar:        label.totalSugars  || undefined,
      source:       'label',
    };
    onSave([food]);
  };

  const hasHighConcern = score.concerns.some((c) => c.concern === 'high');

  return (
    <div className="space-y-5">

      {/* Product name + image strip */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
        {imagePreviewUrl && (
          <img src={imagePreviewUrl} alt="Scanned product"
            className="w-full object-cover" style={{ maxHeight: 180, objectFit: 'cover' }} />
        )}
        <div className="px-4 py-4">
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            Nutrition Label
          </p>
          <p style={{ color: '#fff', fontSize: 20, fontWeight: 800, marginTop: 2, lineHeight: 1.2 }}>
            {label.productName || 'Product'}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
            {label.servingSize}{label.servingsPerContainer ? ` · ${label.servingsPerContainer} servings per container` : ''}
          </p>
        </div>
      </div>

      {/* Health rings */}
      <div className="rounded-2xl px-5 py-6"
        style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
        <HealthRings score={score} />
      </div>

      {/* Ingredient concerns */}
      {score.concerns.length > 0 ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: hasHighConcern ? '#f87171' : '#fbbf24' }} />
            <p style={{ color: '#fff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {score.concerns.length} Ingredient {score.concerns.length === 1 ? 'Concern' : 'Concerns'}
            </p>
          </div>
          <div className="px-4 py-3 space-y-2">
            {score.concerns.map((c, i) => (
              <ConcernItem key={i} name={c.name} concern={c.concern} effect={c.effect} />
            ))}
          </div>
          {label.ingredients && (
            <div className="px-4 pb-4">
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Ingredients
              </p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.6 }}>
                {label.ingredients}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl px-4 py-4 flex items-center gap-3"
          style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)' }}>
          <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: '#4ade80' }} />
          <div>
            <p style={{ color: '#4ade80', fontSize: 13, fontWeight: 800 }}>No Concerning Additives</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>
              No high-concern chemicals detected in the ingredients list.
            </p>
          </div>
        </div>
      )}

      {/* Nutrition facts table */}
      <NutritionTable label={label} />

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-2xl text-[16px] font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          style={{ background: '#C8FF00' }}>
          <CheckCircle2 className="w-5 h-5" />
          {saving ? 'Saving…' : 'Save to History'}
        </button>
        <button
          onClick={onScanAgain}
          className="w-full py-4 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
          <RotateCcw className="w-4 h-4" /> Scan Again
        </button>
      </div>
    </div>
  );
};
