export type ExerciseInputType =
  | 'weight_reps'
  | 'distance_time'
  | 'time_only'
  | 'distance_only'
  | 'reps_only'
  | 'height_reps'
  | 'calories_time';

export type DistanceUnit = 'km' | 'mi';
export type WeightUnit = 'kg' | 'lbs';

export type DialFieldKind =
  | 'weight'
  | 'reps'
  | 'distance'
  | 'minutes'
  | 'seconds'
  | 'height'
  | 'calories';

// ─────────────────────────────────────────────────────────────────────────────
// Exact-name lookup (fastest path — must be lowercase, spaces normalised)
// ─────────────────────────────────────────────────────────────────────────────
const EXACT_TYPE_MAP: Record<string, ExerciseInputType> = {
  // ── Cardio machines — distance + time ──
  treadmill:            'distance_time',
  elliptical:           'distance_time',
  'elliptical trainer': 'distance_time',
  cycling:              'distance_time',
  'spin bike':          'distance_time',
  'stationary bike':    'distance_time',
  'stationary cycle':   'distance_time',
  'assault bike':       'distance_time',
  'echo bike':          'distance_time',
  'air bike':           'distance_time',
  'ski erg':            'distance_time',
  skierg:               'distance_time',
  'rowing machine':     'distance_time',
  rower:                'distance_time',
  'sled push':          'distance_time',
  'sled pull':          'distance_time',
  'farmers walk':       'distance_time',
  "farmer's walk":      'distance_time',
  'farmer walk':        'distance_time',
  'farmer carry':       'distance_time',
  'loaded carry':       'distance_time',
  running:              'distance_time',
  'running outdoor':    'distance_time',
  jogging:              'distance_time',
  sprinting:            'distance_time',
  bike:                 'distance_time',
  run:                  'distance_time',

  // ── Cardio — distance only ──
  swimming:  'distance_only',
  swim:      'distance_only',
  walking:   'distance_only',
  walk:      'distance_only',

  // ── Timed static / recovery ──
  'stair climber':  'time_only',
  stairmaster:      'time_only',
  stepmill:         'time_only',
  'step mill':      'time_only',
  'jump rope':      'time_only',
  'battle rope':    'time_only',
  'battle ropes':   'time_only',
  plank:            'time_only',
  'wall sit':       'time_only',
  stretching:       'time_only',
  sauna:            'time_only',
  yoga:             'time_only',
  meditation:       'time_only',
  'hollow hold':    'time_only',
  'dead bug':       'time_only',

  // ── Bodyweight reps only ──
  'pull-ups':   'reps_only',
  pullups:      'reps_only',
  'pull ups':   'reps_only',
  'chin-ups':   'reps_only',
  chinups:      'reps_only',
  'chin ups':   'reps_only',
  'push-ups':   'reps_only',
  pushups:      'reps_only',
  'push ups':   'reps_only',
  dips:         'reps_only',
  'jump squat': 'reps_only',

  // ── Height + reps ──
  'box jump':  'height_reps',
  'box jumps': 'height_reps',

  // ── Weight + reps (explicit to prevent false pattern matches) ──
  'walking lunge':    'weight_reps',
  'walking lunges':   'weight_reps',
  'reverse lunge':    'weight_reps',
  'dumbbell walking lunge': 'weight_reps',
};

// ─────────────────────────────────────────────────────────────────────────────
// Pattern-based lookup — ordered from most-specific to least-specific.
// Uses word-boundary anchors (\b) to avoid substring false-positives
// (e.g. "crunch" must NOT match "run", "bicycle crunch" must NOT match "cycle").
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_PATTERNS: { patterns: RegExp[]; type: ExerciseInputType }[] = [
  // ── Distance + Time ───────────────────────────────────────────────────────
  {
    patterns: [
      /\btreadmill\b/i,
      /\brilliant?ical\b/i,
      /\bski[\s-]?erg\b/i,
      /\bassault[\s-]bike\b/i,
      /\becho[\s-]bike\b/i,
      /\bair[\s-]bike\b/i,
      /\bspin[\s-]bike\b/i,
      /\bstationary[\s-](bike|cycle)\b/i,
      /sled[\s-]push/i,
      /sled[\s-]pull/i,
      /farmers?[\s-]walk/i,
      /farmer[\s-]carry/i,
      /loaded[\s-]carry/i,
      /\browing[\s-]machine\b/i,
      /\b(erg|rower)\b/i,
      // Running / jogging — word-bounded so "crunch" (c-RUN-ch) is NOT caught
      /\brun(s|ning|ner)?\b/i,
      /\bjog(s|ging)?\b/i,
      /\bsprint(s|ing|er)?\b/i,
      // Cycling — word-bounded so "bicycle crunch" is NOT caught
      /\bcycl(e|es|ing|ist)\b/i,
      /\bbike\b/i,
    ],
    type: 'distance_time',
  },

  // ── Distance Only ─────────────────────────────────────────────────────────
  {
    patterns: [
      /\bswim(s|ming|mer)?\b/i,
      // "walking" only when it IS the full activity, not "walking lunge" etc.
      // The EXACT_TYPE_MAP handles "walking lunge" → weight_reps before we reach here,
      // but add a guard pattern: match "walking" only when NOT followed by "lunge".
      /\bwalking\b(?!\s+lunge)/i,
      /\bwalk\b(?!\s+out|ing\s+lunge)/i,
    ],
    type: 'distance_only',
  },

  // ── Time Only ─────────────────────────────────────────────────────────────
  {
    patterns: [
      /stair[\s-]?(master|climber|stepper)/i,
      /\bstepmill\b/i,
      /battle[\s-]ropes?/i,
      /\bjump[\s-]rope\b/i,
      /\bplank\b/i,
      /\bwall[\s-]sit\b/i,
      /\bsauna\b/i,
      /\bstretching?\b/i,
      // Yoga — word-bounded: doesn't catch "yogi" in some contrived name
      /\byoga\b/i,
      /\bvinyasa\b/i,
      /\basana\b/i,
      /\bmeditation\b/i,
      /\bhollow[\s-]hold\b/i,
      /\bdead[\s-]bug\b/i,
      /\bisometric\b/i,
    ],
    type: 'time_only',
  },

  // ── Bodyweight / Reps Only ────────────────────────────────────────────────
  {
    patterns: [
      /\bpull[\s-]?ups?\b/i,
      /\bchin[\s-]?ups?\b/i,
      /\bpush[\s-]?ups?\b/i,
      /\bdips?\b/i,
      /\bjump[\s-]squat\b/i,
      /\bdip\b/i,
    ],
    type: 'reps_only',
  },

  // ── Height + Reps ─────────────────────────────────────────────────────────
  {
    patterns: [/\bbox[\s-]jumps?\b/i, /\bdepth[\s-]jumps?\b/i],
    type: 'height_reps',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Public resolver — exact → pattern → default
// ─────────────────────────────────────────────────────────────────────────────
const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const resolveExerciseInputType = (exerciseName: string): ExerciseInputType => {
  const normalized = normalizeKey(exerciseName);

  // 1. Exact match (fastest, most reliable)
  const exact = EXACT_TYPE_MAP[normalized];
  if (exact) return exact;

  // 2. Pattern match (word-boundary safe — no substring false-positives)
  for (const { patterns, type } of TYPE_PATTERNS) {
    if (patterns.some((p) => p.test(normalized))) return type;
  }

  // 3. Default: almost every gym exercise is weight × reps
  return 'weight_reps';
};

// ─────────────────────────────────────────────────────────────────────────────
// Label / unit helpers
// ─────────────────────────────────────────────────────────────────────────────
export const INPUT_LABELS: Record<
  ExerciseInputType,
  { primary: string; secondary: string | null }
> = {
  weight_reps:    { primary: 'KG',   secondary: 'REPS' },
  distance_time:  { primary: 'KM',   secondary: 'MIN'  },
  time_only:      { primary: 'MIN',  secondary: 'SEC'  },
  distance_only:  { primary: 'KM',   secondary: null   },
  reps_only:      { primary: 'REPS', secondary: null   },
  height_reps:    { primary: 'CM',   secondary: 'REPS' },
  calories_time:  { primary: 'CAL',  secondary: 'MIN'  },
};

export const hasSecondaryField = (type: ExerciseInputType) => INPUT_LABELS[type].secondary !== null;

export const isDistanceExerciseType = (type: ExerciseInputType) =>
  type === 'distance_time' || type === 'distance_only';

export const isWeightExerciseType = (type: ExerciseInputType) =>
  type === 'weight_reps' || type === 'height_reps';

export const getFieldKinds = (type: ExerciseInputType): {
  primary: DialFieldKind;
  secondary: DialFieldKind | null;
} => {
  switch (type) {
    case 'weight_reps':   return { primary: 'weight',   secondary: 'reps'    };
    case 'distance_time': return { primary: 'distance', secondary: 'minutes' };
    case 'time_only':     return { primary: 'minutes',  secondary: 'seconds' };
    case 'distance_only': return { primary: 'distance', secondary: null      };
    case 'reps_only':     return { primary: 'reps',     secondary: null      };
    case 'height_reps':   return { primary: 'height',   secondary: 'reps'   };
    case 'calories_time': return { primary: 'calories', secondary: 'minutes' };
    default:              return { primary: 'weight',   secondary: 'reps'    };
  }
};

export const getDefaultSetValues = (type: ExerciseInputType) => {
  switch (type) {
    case 'distance_time': return { weight: 0, reps: 5   };
    case 'time_only':     return { weight: 5, reps: 0   };
    case 'calories_time': return { weight: 0, reps: 5   };
    case 'reps_only':     return { weight: 0, reps: 10  };
    case 'distance_only': return { weight: 0, reps: 0   };
    case 'height_reps':   return { weight: 0, reps: 8   };
    case 'weight_reps':
    default:              return { weight: 0, reps: 0   };
  }
};

export const getInputLabels = (
  type: ExerciseInputType,
  options?: { weightUnit?: WeightUnit; distanceUnit?: DistanceUnit },
) => {
  const weightUnit   = (options?.weightUnit   || 'kg').toUpperCase();
  const distanceUnit = (options?.distanceUnit || 'km').toUpperCase();
  const base = INPUT_LABELS[type];

  if (type === 'weight_reps') return { primary: weightUnit, secondary: base.secondary };
  if (type === 'distance_time' || type === 'distance_only') return { primary: distanceUnit, secondary: base.secondary };
  return base;
};

export const getUnitDisplay = (
  type: ExerciseInputType,
  options?: { weightUnit?: WeightUnit; distanceUnit?: DistanceUnit },
) => {
  if (type === 'weight_reps')                              return (options?.weightUnit   || 'kg').toUpperCase();
  if (type === 'distance_time' || type === 'distance_only') return (options?.distanceUnit || 'km').toUpperCase();
  if (type === 'height_reps')   return 'CM';
  if (type === 'calories_time') return 'CAL';
  if (type === 'reps_only')     return 'REPS';
  if (type === 'time_only')     return 'MIN';
  return '';
};

export const isSetReadyForCompletion = (
  type: ExerciseInputType,
  values: { weight: number | null; reps: number | null },
) => {
  const weight = Number(values.weight || 0);
  const reps   = Number(values.reps   || 0);

  switch (type) {
    case 'weight_reps':   return reps > 0;
    case 'distance_time': return weight > 0 || reps > 0;
    case 'time_only':     return weight > 0 || reps > 0;
    case 'distance_only': return weight > 0;
    case 'reps_only':     return reps > 0;
    case 'height_reps':   return reps > 0;
    case 'calories_time': return weight > 0 || reps > 0;
    default:              return weight > 0 || reps > 0;
  }
};

export const formatSetValue = (kind: DialFieldKind, value: number | null) => {
  const numeric = Number(value || 0);
  if (kind === 'weight' || kind === 'distance') return numeric.toFixed(1);
  return String(Math.round(numeric));
};
