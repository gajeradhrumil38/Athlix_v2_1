/**
 * Health scoring engine — uses FDA Daily Reference Values and EWG/CSPI additive data.
 *
 * All scores are 0–100 where HIGHER = HEALTHIER (green).
 * Grade: A (80–100) B (60–79) C (40–59) D (20–39) E (0–19)
 */

import type { HealthScore, HealthGrade, Additive, LabelData, DetectedFood } from '../types';

// ─── FDA 2020 Daily Reference Values ─────────────────────────────────────────

const DV = {
  sodium:       2300, // mg
  addedSugars:  50,   // g
  saturatedFat: 20,   // g
  totalFat:     78,   // g
  protein:      50,   // g
  fiber:        28,   // g
  calories:     2000, // kcal
} as const;

// ─── Chemical additive database (EWG Food Scores + CSPI watchlist) ────────────

interface AdditivePattern {
  pattern: RegExp;
  name: string;
  concern: 'high' | 'medium' | 'low';
  effect: string;
}

const ADDITIVES: AdditivePattern[] = [
  // ── High concern ──────────────────────────────────────────────────────────
  {
    pattern: /red\s*(?:no\.?\s*)?40|allura\s*red|e-?129/i,
    name: 'Red 40 (Allura Red)',
    concern: 'high',
    effect: 'Linked to hyperactivity in children; IARC "possible carcinogen"',
  },
  {
    pattern: /yellow\s*(?:no\.?\s*)?5|tartrazine|e-?102/i,
    name: 'Yellow 5 (Tartrazine)',
    concern: 'high',
    effect: 'Hyperactivity, allergy risk, banned in some EU products',
  },
  {
    pattern: /yellow\s*(?:no\.?\s*)?6|sunset\s*yellow|e-?110/i,
    name: 'Yellow 6 (Sunset Yellow)',
    concern: 'high',
    effect: 'Hyperactivity, possible carcinogen at high doses',
  },
  {
    pattern: /sodium\s*nitrite|e-?250\b/i,
    name: 'Sodium Nitrite',
    concern: 'high',
    effect: 'Forms nitrosamines in processed meats — IARC Group 2A carcinogen',
  },
  {
    pattern: /\bbha\b|butylated\s*hydroxyanisole|e-?320\b/i,
    name: 'BHA (Butylated Hydroxyanisole)',
    concern: 'high',
    effect: 'IARC "possible carcinogen"; endocrine disruptor concerns',
  },
  {
    pattern: /\bbht\b|butylated\s*hydroxytoluene|e-?321\b/i,
    name: 'BHT (Butylated Hydroxytoluene)',
    concern: 'high',
    effect: 'Possible carcinogen; liver and kidney effects at high doses',
  },
  {
    pattern: /\btbhq\b|tert-?butylhydroquinone/i,
    name: 'TBHQ',
    concern: 'high',
    effect: 'Immune system effects; EFSA flagged safety concerns in 2020',
  },
  {
    pattern: /potassium\s*bromate|e-?924\b/i,
    name: 'Potassium Bromate',
    concern: 'high',
    effect: 'Known carcinogen; banned in EU, UK, Canada, India',
  },
  {
    pattern: /propyl\s*gallate|e-?310\b/i,
    name: 'Propyl Gallate',
    concern: 'high',
    effect: 'Possible endocrine disruptor; linked to tumours in animal studies',
  },
  // ── Medium concern ────────────────────────────────────────────────────────
  {
    pattern: /high[\s-]fructose\s*corn\s*syrup|\bhfcs\b/i,
    name: 'High Fructose Corn Syrup',
    concern: 'medium',
    effect: 'Strongly linked to obesity, insulin resistance, metabolic syndrome',
  },
  {
    pattern: /aspartame|e-?951\b/i,
    name: 'Aspartame',
    concern: 'medium',
    effect: 'IARC classified "possibly carcinogenic to humans" (2023)',
  },
  {
    pattern: /saccharin|e-?954\b/i,
    name: 'Saccharin',
    concern: 'medium',
    effect: 'Alters gut microbiome; possible bladder irritant',
  },
  {
    pattern: /acesulfame[\s-]*(?:k|potassium)|e-?950\b/i,
    name: 'Acesulfame K',
    concern: 'medium',
    effect: 'Alters gut bacteria; possible neurotoxin at high doses',
  },
  {
    pattern: /carrageenan|e-?407\b/i,
    name: 'Carrageenan',
    concern: 'medium',
    effect: 'May promote intestinal inflammation and gut permeability',
  },
  {
    pattern: /caramel\s*colo(?:u?r|ring).*(?:iv|class\s*4)|e-?150d\b/i,
    name: 'Caramel Color Class IV',
    concern: 'medium',
    effect: 'Contains 4-MEI — IARC "possible carcinogen"',
  },
  {
    pattern: /sodium\s*benzoate|e-?211\b/i,
    name: 'Sodium Benzoate',
    concern: 'medium',
    effect: 'Forms benzene (carcinogen) when combined with Vitamin C',
  },
  {
    pattern: /brominated\s*vegetable\s*oil|\bbvo\b/i,
    name: 'Brominated Vegetable Oil (BVO)',
    concern: 'medium',
    effect: 'Bioaccumulates; FDA revoked GRAS status in 2024',
  },
  {
    pattern: /sucralose|e-?955\b/i,
    name: 'Sucralose',
    concern: 'medium',
    effect: 'May negatively alter gut microbiome; debated metabolic effects',
  },
  // ── Low concern ───────────────────────────────────────────────────────────
  {
    pattern: /monosodium\s*glutamate|\bmsg\b|e-?621\b/i,
    name: 'MSG',
    concern: 'low',
    effect: 'Generally recognized as safe; some sensitivity reported',
  },
  {
    pattern: /artificial\s*(?:flavo(?:u?r|ring)|colo(?:u?r|ring))/i,
    name: 'Artificial Flavors/Colors',
    concern: 'low',
    effect: 'Catch-all term — specific chemicals not disclosed on label',
  },
  {
    pattern: /partially\s*hydrogenated/i,
    name: 'Partially Hydrogenated Oil',
    concern: 'high',
    effect: 'Contains artificial trans fat — FDA banned in 2018 (check label date)',
  },
];

// ─── Additive detection ───────────────────────────────────────────────────────

export function checkAdditives(ingredients: string): Additive[] {
  if (!ingredients?.trim()) return [];
  const found: Additive[] = [];
  for (const a of ADDITIVES) {
    if (a.pattern.test(ingredients)) {
      found.push({ name: a.name, concern: a.concern, effect: a.effect });
    }
  }
  return found;
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function gradeFromScore(s: number): HealthGrade {
  if (s >= 80) return 'A';
  if (s >= 60) return 'B';
  if (s >= 40) return 'C';
  if (s >= 20) return 'D';
  return 'E';
}

function recommendation(overall: number, reason: string): Pick<HealthScore, 'recommendation' | 'reason'> {
  if (overall >= 67) return { recommendation: 'eat',      reason };
  if (overall >= 34) return { recommendation: 'moderate', reason };
  return                    { recommendation: 'avoid',    reason };
}

// Sugar score — per-serving g vs FDA added sugar DV (50g)
function scoreSugar(totalSugars: number, addedSugars: number): number {
  const effective = addedSugars > 0 ? addedSugars : totalSugars;
  // 0 g = 100, 25g = 50, 50g+ = 0
  return clamp(Math.round(100 - (effective / DV.addedSugars) * 100), 0, 100);
}

// Sodium score — per-serving mg vs DV (2300mg). WHO recommends <2000mg/day.
function scoreSodium(sodium: number): number {
  // 0 mg = 100, 575mg (25% DV) = 75, 1150mg (50% DV) = 50, 2300mg = 0
  return clamp(Math.round(100 - (sodium / DV.sodium) * 100), 0, 100);
}

// Fat score — penalises saturated fat and trans fat
function scoreFat(saturatedFat: number, transFat: number): number {
  if (transFat > 0) return 0; // any trans fat = zero
  // 0g sat fat = 100, 5g = 75, 10g = 50, 20g+ = 0
  return clamp(Math.round(100 - (saturatedFat / DV.saturatedFat) * 100), 0, 100);
}

// Additive score — deduct per concern level
function scoreAdditives(concerns: Additive[]): number {
  const deduction = concerns.reduce((acc, c) => {
    if (c.concern === 'high')   return acc + 30;
    if (c.concern === 'medium') return acc + 15;
    return acc + 5;
  }, 0);
  return clamp(100 - deduction, 0, 100);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Score a scanned nutrition label (packaged product).
 * Returns a full HealthScore with chemical concern detection.
 */
export function scoreLabel(label: LabelData): HealthScore {
  const concerns     = checkAdditives(label.ingredients);
  const sugarScore   = scoreSugar(label.totalSugars, label.addedSugars);
  const sodiumScore  = scoreSodium(label.sodium);
  const fatScore     = scoreFat(label.saturatedFat, label.transFat);
  const additiveScore = scoreAdditives(concerns);

  const overall = Math.round(
    0.30 * additiveScore +
    0.25 * sugarScore    +
    0.25 * sodiumScore   +
    0.20 * fatScore,
  );

  // Build reason string from biggest risk
  let reason = '';
  const risks: string[] = [];
  if (sugarScore  < 50) risks.push(`high sugars (${label.totalSugars}g)`);
  if (sodiumScore < 50) risks.push(`high sodium (${label.sodium}mg)`);
  if (fatScore    < 50) risks.push(label.transFat > 0 ? 'contains trans fat' : `high saturated fat (${label.saturatedFat}g)`);
  if (concerns.some((c) => c.concern === 'high')) risks.push('contains high-concern additives');

  if (risks.length === 0) {
    reason = overall >= 80
      ? 'Clean ingredients, balanced macros — enjoy freely.'
      : 'Relatively clean profile. Reasonable as part of a varied diet.';
  } else {
    reason = `Watch out: ${risks.join(', ')}.`;
  }

  return {
    overall,
    grade: gradeFromScore(overall),
    sugarScore,
    sodiumScore,
    fatScore,
    additiveScore,
    concerns,
    ...recommendation(overall, reason),
  };
}

/**
 * Score a dish scan result (array of detected foods, no label data).
 * Uses macro ratios as a nutritional quality proxy.
 */
export function scoreDish(foods: DetectedFood[]): HealthScore {
  if (foods.length === 0) {
    return {
      overall: 50, grade: 'C', sugarScore: 50, sodiumScore: 80,
      fatScore: 60, additiveScore: 100, concerns: [],
      recommendation: 'moderate', reason: 'No food data to score.',
    };
  }

  const totalCal  = foods.reduce((a, f) => a + f.calories * f.servings, 0);
  const totalProt = foods.reduce((a, f) => a + f.protein  * f.servings, 0);
  const totalCarb = foods.reduce((a, f) => a + f.carbs    * f.servings, 0);
  const totalFat  = foods.reduce((a, f) => a + f.fat      * f.servings, 0);

  if (totalCal === 0) {
    return { overall: 50, grade: 'C', sugarScore: 50, sodiumScore: 80, fatScore: 60, additiveScore: 100, concerns: [], recommendation: 'moderate', reason: 'Unable to calculate score.' };
  }

  // Protein density score: >25% of calories from protein = excellent
  const protPct  = (totalProt * 4) / totalCal;
  const protScore = clamp(Math.round(protPct * 300), 0, 100); // 33%+ = 100

  // Fat score: <30% calories from fat = good, >50% = bad
  const fatPct   = (totalFat * 9) / totalCal;
  const fatScore = clamp(Math.round((1 - fatPct / 0.6) * 100), 0, 100);

  // Carb quality: dish-level only (we don't have sugar breakdown without label)
  // Assume 60 unless it's very carb heavy (>70% carb = lower)
  const carbPct  = (totalCarb * 4) / totalCal;
  const sugarScore = clamp(Math.round((1 - carbPct * 0.8) * 100), 0, 100);

  // Sodium: unknown for dish → neutral 75
  const sodiumScore = 75;

  // No label means no additives — if source is USDA/whole food assume clean
  const allWhole  = foods.every((f) => !f.source || f.source === 'usda');
  const additiveScore = allWhole ? 95 : 70;

  const overall = Math.round(
    0.35 * protScore   +
    0.25 * fatScore    +
    0.20 * sugarScore  +
    0.20 * additiveScore,
  );

  // Build reason
  const insights: string[] = [];
  if (protPct >= 0.25) insights.push('high protein');
  if (fatPct  <= 0.30) insights.push('low fat');
  if (allWhole)        insights.push('whole foods');
  if (protPct < 0.10)  insights.push('low protein');
  if (fatPct  > 0.45)  insights.push('high fat');
  if (carbPct > 0.65)  insights.push('high carbs');

  const reason = insights.length > 0
    ? insights.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.'
    : 'Balanced macros.';

  return {
    overall,
    grade: gradeFromScore(overall),
    sugarScore,
    sodiumScore,
    fatScore,
    additiveScore,
    concerns: [],
    ...recommendation(overall, reason),
  };
}
