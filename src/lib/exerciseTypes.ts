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

export const EXERCISE_TYPE_MAP: Record<string, ExerciseInputType> = {
  treadmill: 'distance_time',
  running: 'distance_time',
  'running outdoor': 'distance_time',
  cycling: 'distance_time',
  rowing: 'distance_time',
  'rowing machine': 'distance_time',
  elliptical: 'distance_time',
  'stair climber': 'time_only',
  'stairmaster': 'time_only',
  'assault bike': 'distance_time',
  'ski erg': 'distance_time',
  skierg: 'distance_time',
  'jump rope': 'time_only',
  'battle ropes': 'time_only',
  'battle rope': 'time_only',
  'farmers walk': 'distance_time',
  "farmer's walk": 'distance_time',
  'farmer carry': 'distance_time',
  'sled push': 'distance_time',

  'pull-ups': 'reps_only',
  pullups: 'reps_only',
  'push-ups': 'reps_only',
  pushups: 'reps_only',
  dips: 'reps_only',
  plank: 'time_only',
  'wall sit': 'time_only',
  stretching: 'time_only',
  sauna: 'time_only',

  'box jump': 'height_reps',
  'box jumps': 'height_reps',
  'jump squat': 'reps_only',

  swimming: 'distance_only',
  walking: 'distance_only',
  'walking lunge': 'weight_reps',
  'walking lunges': 'weight_reps',

  bike: 'distance_time',
  run: 'distance_time',
  rower: 'distance_time',

  default: 'weight_reps',
};

export const INPUT_LABELS: Record<
  ExerciseInputType,
  { primary: string; secondary: string | null }
> = {
  weight_reps: { primary: 'KG', secondary: 'REPS' },
  distance_time: { primary: 'KM', secondary: 'MIN' },
  time_only: { primary: 'MIN', secondary: 'SEC' },
  distance_only: { primary: 'KM', secondary: null },
  reps_only: { primary: 'REPS', secondary: null },
  height_reps: { primary: 'CM', secondary: 'REPS' },
  calories_time: { primary: 'CAL', secondary: 'MIN' },
};

const CARDIO_HINT_NAMES = ['run', 'jog', 'cycle', 'bike', 'row', 'swim', 'elliptical', 'stair', 'ski'];

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '')
    .trim();

export const resolveExerciseInputType = (exerciseName: string): ExerciseInputType => {
  const normalized = normalizeKey(exerciseName);

  if (EXERCISE_TYPE_MAP[normalized]) {
    return EXERCISE_TYPE_MAP[normalized];
  }

  const directHit = Object.keys(EXERCISE_TYPE_MAP).find((key) => normalized.includes(key));
  if (directHit && directHit !== 'default') {
    return EXERCISE_TYPE_MAP[directHit];
  }

  if (CARDIO_HINT_NAMES.some((token) => normalized.includes(token))) {
    return 'distance_time';
  }

  return EXERCISE_TYPE_MAP.default;
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
    case 'weight_reps':
      return { primary: 'weight', secondary: 'reps' };
    case 'distance_time':
      return { primary: 'distance', secondary: 'minutes' };
    case 'time_only':
      return { primary: 'minutes', secondary: 'seconds' };
    case 'distance_only':
      return { primary: 'distance', secondary: null };
    case 'reps_only':
      return { primary: 'reps', secondary: null };
    case 'height_reps':
      return { primary: 'height', secondary: 'reps' };
    case 'calories_time':
      return { primary: 'calories', secondary: 'minutes' };
    default:
      return { primary: 'weight', secondary: 'reps' };
  }
};

export const getDefaultSetValues = (type: ExerciseInputType) => {
  switch (type) {
    case 'distance_time':
      return { weight: 0, reps: 5 };
    case 'time_only':
      return { weight: 5, reps: 0 };
    case 'calories_time':
      return { weight: 0, reps: 5 };
    case 'reps_only':
      return { weight: 0, reps: 10 };
    case 'distance_only':
      return { weight: 0, reps: 0 };
    case 'height_reps':
      return { weight: 0, reps: 8 };
    case 'weight_reps':
    default:
      return { weight: 0, reps: 0 };
  }
};

export const getInputLabels = (
  type: ExerciseInputType,
  options?: { weightUnit?: WeightUnit; distanceUnit?: DistanceUnit },
) => {
  const weightUnit = (options?.weightUnit || 'kg').toUpperCase();
  const distanceUnit = (options?.distanceUnit || 'km').toUpperCase();
  const base = INPUT_LABELS[type];

  if (type === 'weight_reps') {
    return { primary: weightUnit, secondary: base.secondary };
  }

  if (type === 'distance_time' || type === 'distance_only') {
    return { primary: distanceUnit, secondary: base.secondary };
  }

  return base;
};

export const getUnitDisplay = (
  type: ExerciseInputType,
  options?: { weightUnit?: WeightUnit; distanceUnit?: DistanceUnit },
) => {
  if (type === 'weight_reps') return (options?.weightUnit || 'kg').toUpperCase();
  if (type === 'distance_time' || type === 'distance_only') return (options?.distanceUnit || 'km').toUpperCase();
  if (type === 'height_reps') return 'CM';
  if (type === 'calories_time') return 'CAL';
  if (type === 'reps_only') return 'REPS';
  if (type === 'time_only') return 'MIN';
  return '';
};

export const isSetReadyForCompletion = (
  type: ExerciseInputType,
  values: { weight: number | null; reps: number | null },
) => {
  const weight = Number(values.weight || 0);
  const reps = Number(values.reps || 0);

  switch (type) {
    case 'weight_reps':
      return reps > 0;
    case 'distance_time':
      return weight > 0 || reps > 0;
    case 'time_only':
      return weight > 0 || reps > 0;
    case 'distance_only':
      return weight > 0;
    case 'reps_only':
      return reps > 0;
    case 'height_reps':
      return reps > 0;
    case 'calories_time':
      return weight > 0 || reps > 0;
    default:
      return weight > 0 || reps > 0;
  }
};

export const formatSetValue = (kind: DialFieldKind, value: number | null) => {
  const numeric = Number(value || 0);
  if (kind === 'weight' || kind === 'distance') {
    return numeric.toFixed(1);
  }
  return String(Math.round(numeric));
};
