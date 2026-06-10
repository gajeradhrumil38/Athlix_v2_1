/**
 * NutritionFactsTable — FDA-style facts panel for a scanned label.
 * Shared by LabelResults (fresh scan) and FoodDetailModal (history).
 */

import React from 'react';
import type { LabelData } from '../types';

const DV = { fat: 78, saturatedFat: 20, sodium: 2300, totalCarbs: 275, fiber: 28, protein: 50 } as const;
const dvPct = (val: number, ref: number) => Math.round((val / ref) * 100);

const NutrientRow: React.FC<{ label: string; value: string; dv?: number; bold?: boolean; indent?: boolean }> = ({
  label, value, dv, bold, indent,
}) => (
  <div className="flex items-center justify-between py-1.5"
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

export const NutritionFactsTable: React.FC<{ label: LabelData }> = ({ label }) => (
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

    <div className="px-4 py-3 flex items-baseline justify-between" style={{ borderBottom: '2px solid rgba(255,255,255,0.12)' }}>
      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700 }}>Calories</span>
      <span style={{ color: '#C8FF00', fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{label.calories}</span>
    </div>

    <div className="px-4 pb-3 pt-1">
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 600, textAlign: 'right', paddingBottom: 4 }}>
        % Daily Value*
      </p>
      <NutrientRow label="Total Fat"          value={`${label.totalFat}g`}      dv={dvPct(label.totalFat, DV.fat)} bold />
      <NutrientRow label="Saturated Fat"      value={`${label.saturatedFat}g`}  dv={dvPct(label.saturatedFat, DV.saturatedFat)} indent />
      <NutrientRow label="Trans Fat"          value={`${label.transFat}g`}      indent />
      <NutrientRow label="Cholesterol"        value={`${label.cholesterol}mg`}  bold />
      <NutrientRow label="Sodium"             value={`${label.sodium}mg`}       dv={dvPct(label.sodium, DV.sodium)} bold />
      <NutrientRow label="Total Carbohydrate" value={`${label.totalCarbs}g`}    dv={dvPct(label.totalCarbs, DV.totalCarbs)} bold />
      <NutrientRow label="Dietary Fiber"      value={`${label.dietaryFiber}g`}  dv={dvPct(label.dietaryFiber, DV.fiber)} indent />
      <NutrientRow label="Total Sugars"       value={`${label.totalSugars}g`}   indent />
      {label.addedSugars > 0 && <NutrientRow label="  Incl. Added Sugars" value={`${label.addedSugars}g`} indent />}
      <NutrientRow label="Protein"            value={`${label.protein}g`}       dv={dvPct(label.protein, DV.protein)} bold />
      {(label.vitaminD || label.calcium || label.iron || label.potassium) && (
        <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
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
