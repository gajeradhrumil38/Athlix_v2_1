import Foundation

public struct ExerciseMuscleTarget: Sendable, Equatable {
    public let slug: String
    public let weight: Double

    public init(slug: String, weight: Double) {
        self.slug = slug
        self.weight = weight
    }
}

public struct ExerciseMuscleProfile: Sendable, Equatable {
    public let primary: [String]
    public let secondary: [String]
    public let targets: [ExerciseMuscleTarget]
}

public enum MuscleTargetType: Sendable {
    case primary
    case secondary
}

/// Ported verbatim from src/lib/exerciseMuscles.ts.
public enum ExerciseMuscleMapper {
    public static let primaryLoadWeight = 1.0
    public static let secondaryLoadWeight = 0.4

    public static let slugLabels: [String: String] = [
        "abs": "Abs", "adductors": "Adductors", "ankles": "Ankles",
        "biceps": "Biceps", "calves": "Calves", "chest": "Chest",
        "deltoids": "Shoulders", "forearm": "Forearms", "gluteal": "Glutes",
        "hamstring": "Hamstrings", "lower-back": "Lower Back",
        "obliques": "Obliques", "quadriceps": "Quads", "tibialis": "Tibialis",
        "trapezius": "Traps", "triceps": "Triceps", "upper-back": "Upper Back",
    ]

    public static let slugRegionMap: [String: String] = [
        "abs": "Core", "adductors": "Legs", "ankles": "Legs",
        "biceps": "Biceps", "calves": "Legs", "chest": "Chest",
        "deltoids": "Shoulders", "forearm": "Forearms", "gluteal": "Glutes",
        "hamstring": "Legs", "lower-back": "Back", "obliques": "Core",
        "quadriceps": "Legs", "tibialis": "Legs", "trapezius": "Back",
        "triceps": "Triceps", "upper-back": "Back",
    ]

    public static let fallbackTargetsByGroup: [String: [ExerciseMuscleTarget]] = [
        "Chest": [t("chest", 1), t("deltoids", 0.28), t("triceps", 0.22)],
        "Back": [t("upper-back", 0.8), t("trapezius", 0.45), t("lower-back", 0.35), t("biceps", 0.2)],
        "Shoulders": [t("deltoids", 1), t("trapezius", 0.18)],
        "Biceps": [t("biceps", 1)],
        "Triceps": [t("triceps", 1)],
        "Arms": [t("biceps", 0.55), t("triceps", 0.55), t("forearm", 0.2)],
        "Legs": [t("quadriceps", 0.8), t("gluteal", 0.55), t("hamstring", 0.45), t("adductors", 0.22), t("calves", 0.15)],
        "Glutes": [t("gluteal", 1), t("hamstring", 0.45), t("adductors", 0.18)],
        "Core": [t("abs", 0.82), t("obliques", 0.42)],
        "Forearms": [t("forearm", 1)],
        "Cardio": [t("quadriceps", 0.45), t("calves", 0.42), t("hamstring", 0.22), t("gluteal", 0.18)],
        "Yoga": [t("lower-back", 0.45), t("hamstring", 0.45), t("abs", 0.38), t("deltoids", 0.3), t("adductors", 0.28), t("gluteal", 0.22)],
        "Mobility": [t("lower-back", 0.5), t("hamstring", 0.45), t("adductors", 0.4), t("gluteal", 0.3), t("tibialis", 0.2), t("calves", 0.18)],
    ]

    struct PatternProfile {
        let patterns: [String]
        let targets: [ExerciseMuscleTarget]
        let primaryRegions: [String]?
        let secondaryRegions: [String]?
    }

    private static func t(_ slug: String, _ weight: Double) -> ExerciseMuscleTarget {
        ExerciseMuscleTarget(slug: slug, weight: weight)
    }

    // Ported verbatim from EXERCISE_MUSCLE_PATTERNS in src/lib/exerciseMuscles.ts,
    // preserving exact order (pattern-matching is order-sensitive: the first
    // matching rule wins).
    static let patterns: [PatternProfile] = [
        PatternProfile(
            patterns: ["incline (bench )?press", "incline dumbbell press"],
            targets: [t("chest", 0.88), t("deltoids", 0.55), t("triceps", 0.45)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["close[- ]grip bench", "close grip bench"],
            targets: [t("triceps", 0.95), t("chest", 0.35), t("deltoids", 0.22)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["bench press", "chest press", "machine chest press", "smith (bench )?press", "decline (bench )?press", "dumbbell (bench|chest) press", "floor press"],
            targets: [t("chest", 1), t("triceps", 0.55), t("deltoids", 0.42)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["reverse pec deck", "rear delt fly", "rear delt raise"],
            targets: [t("deltoids", 0.8), t("upper-back", 0.52), t("trapezius", 0.3)],
            primaryRegions: ["Shoulders"], secondaryRegions: ["Back"]
        ),
        PatternProfile(
            patterns: ["cable fly", "flye", "\\bfly\\b", "pec deck", "crossover"],
            targets: [t("chest", 1), t("deltoids", 0.16)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["landmine press"],
            targets: [t("chest", 0.68), t("deltoids", 0.62), t("triceps", 0.42), t("abs", 0.16)],
            primaryRegions: ["Chest", "Shoulders"], secondaryRegions: ["Triceps", "Core"]
        ),
        PatternProfile(
            patterns: ["push-?ups?"],
            targets: [t("chest", 0.82), t("triceps", 0.45), t("deltoids", 0.35), t("abs", 0.18)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["chest dips"],
            targets: [t("chest", 0.72), t("triceps", 0.68), t("deltoids", 0.22)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["\\bdips\\b"],
            targets: [t("triceps", 0.85), t("chest", 0.42), t("deltoids", 0.2)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["straight arm pulldown", "straight-arm pulldown"],
            targets: [t("upper-back", 0.9), t("triceps", 0.14), t("abs", 0.1)],
            primaryRegions: ["Back"], secondaryRegions: ["Triceps", "Core"]
        ),
        PatternProfile(
            patterns: ["pull-?ups?", "chin-?ups?", "lat pull", "pulldown"],
            targets: [t("upper-back", 0.92), t("biceps", 0.42), t("trapezius", 0.2)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["chest.?supported row", "seal row", "seated cable row", "machine row"],
            targets: [t("upper-back", 0.9), t("trapezius", 0.38), t("biceps", 0.34)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["upright row"],
            targets: [t("deltoids", 0.75), t("trapezius", 0.6), t("biceps", 0.12)],
            primaryRegions: ["Shoulders", "Back"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["bent over row", "barbell row", "t-?bar row", "pendlay row", "single arm row", "\\brow\\b"],
            targets: [t("upper-back", 0.88), t("trapezius", 0.4), t("biceps", 0.32), t("lower-back", 0.22)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["face pull", "reverse fly", "rear delt"],
            targets: [t("deltoids", 0.72), t("upper-back", 0.55), t("trapezius", 0.3)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["shrug"],
            targets: [t("trapezius", 1)],
            primaryRegions: ["Back"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["romanian deadlift", "\\brdl\\b", "straight leg deadlift", "stiff leg deadlift", "good morning"],
            targets: [t("hamstring", 0.95), t("gluteal", 0.72), t("lower-back", 0.35)],
            primaryRegions: ["Legs", "Back"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["rack pull"],
            targets: [t("trapezius", 0.82), t("lower-back", 0.56), t("gluteal", 0.45), t("hamstring", 0.36)],
            primaryRegions: ["Back", "Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["back extension"],
            targets: [t("lower-back", 0.95), t("gluteal", 0.42), t("hamstring", 0.26)],
            primaryRegions: ["Back"], secondaryRegions: ["Legs"]
        ),
        PatternProfile(
            patterns: ["deadlift", "trap bar deadlift"],
            targets: [t("gluteal", 0.75), t("hamstring", 0.65), t("lower-back", 0.5), t("quadriceps", 0.32), t("trapezius", 0.25)],
            primaryRegions: ["Legs", "Back"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["overhead press", "shoulder press", "dumbbell shoulder press", "seated dumbbell press", "arnold press", "military press"],
            targets: [t("deltoids", 1), t("triceps", 0.55), t("trapezius", 0.18)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["lateral raise", "side raise"],
            targets: [t("deltoids", 1)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["front raise"],
            targets: [t("deltoids", 0.95)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["leg curl", "hamstring curl", "nordic curl"],
            targets: [t("hamstring", 1)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["barbell curl", "dumbbell curl", "hammer curl", "preacher curl", "incline dumbbell curl", "incline curl", "cable curl", "ez bar curl", "spider curl", "machine bicep curl", "reverse curl"],
            targets: [t("biceps", 1)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["pushdown", "skull crusher", "tricep extension", "triceps extension", "french press", "overhead tricep"],
            targets: [t("triceps", 1)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["leg press", "sled press"],
            targets: [t("quadriceps", 1), t("gluteal", 0.45), t("adductors", 0.22)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["leg extension"],
            targets: [t("quadriceps", 1)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["hack squat"],
            targets: [t("quadriceps", 0.95), t("gluteal", 0.5), t("adductors", 0.25)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["split squat", "bulgarian", "\\blunge\\b", "step-?up"],
            targets: [t("quadriceps", 0.8), t("gluteal", 0.62), t("adductors", 0.22), t("hamstring", 0.18)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["\\bsquat\\b"],
            targets: [t("quadriceps", 0.88), t("gluteal", 0.65), t("adductors", 0.3), t("hamstring", 0.18)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["hip thrust", "glute bridge", "hip raise"],
            targets: [t("gluteal", 1), t("hamstring", 0.35), t("adductors", 0.15)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["calf raise"],
            targets: [t("calves", 1)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["adductor"],
            targets: [t("adductors", 1)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["abductor"],
            targets: [t("gluteal", 1)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["plank", "hollow hold", "dead bug"],
            targets: [t("abs", 0.78), t("obliques", 0.45), t("lower-back", 0.18)],
            primaryRegions: ["Core"], secondaryRegions: ["Back"]
        ),
        PatternProfile(
            patterns: ["crunch", "sit-?ups?", "leg raise", "knee raise", "ab wheel", "\\babs?\\b"],
            targets: [t("abs", 1), t("obliques", 0.25)],
            primaryRegions: ["Core"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["russian twist", "wood ?chop", "side bend"],
            targets: [t("obliques", 1), t("abs", 0.28)],
            primaryRegions: ["Core"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["ski erg", "skierg"],
            targets: [t("upper-back", 0.68), t("triceps", 0.48), t("abs", 0.4), t("obliques", 0.25), t("quadriceps", 0.16)],
            primaryRegions: ["Cardio", "Back", "Core"], secondaryRegions: ["Triceps", "Legs"]
        ),
        PatternProfile(
            patterns: ["rowing machine", "\\berg\\b"],
            targets: [t("upper-back", 0.48), t("quadriceps", 0.42), t("hamstring", 0.3), t("biceps", 0.18)],
            primaryRegions: ["Cardio", "Back"], secondaryRegions: ["Legs", "Biceps"]
        ),
        PatternProfile(
            patterns: ["assault bike", "echo bike", "air bike"],
            targets: [t("quadriceps", 0.62), t("deltoids", 0.42), t("triceps", 0.26), t("gluteal", 0.26), t("hamstring", 0.2), t("abs", 0.14)],
            primaryRegions: ["Cardio", "Legs"], secondaryRegions: ["Shoulders", "Triceps", "Core"]
        ),
        PatternProfile(
            patterns: ["cycling", "\\bbike\\b", "spin bike"],
            targets: [t("quadriceps", 0.62), t("gluteal", 0.24), t("calves", 0.18), t("hamstring", 0.15)],
            primaryRegions: ["Cardio", "Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["battle rope", "battle ropes"],
            targets: [t("deltoids", 0.82), t("trapezius", 0.42), t("triceps", 0.36), t("abs", 0.3), t("obliques", 0.2)],
            primaryRegions: ["Cardio", "Shoulders"], secondaryRegions: ["Triceps", "Core", "Back"]
        ),
        PatternProfile(
            patterns: ["farmers walk", "farmer'?s walk", "farmer carry", "loaded carry"],
            targets: [t("trapezius", 0.86), t("upper-back", 0.4), t("abs", 0.35), t("obliques", 0.28), t("quadriceps", 0.24), t("calves", 0.2)],
            primaryRegions: ["Back", "Cardio"], secondaryRegions: ["Core", "Legs"]
        ),
        PatternProfile(
            patterns: ["swimming", "\\bswim\\b"],
            targets: [t("upper-back", 0.62), t("deltoids", 0.58), t("triceps", 0.34), t("abs", 0.22), t("quadriceps", 0.2), t("calves", 0.12)],
            primaryRegions: ["Cardio", "Back", "Shoulders"], secondaryRegions: ["Triceps", "Core", "Legs"]
        ),
        PatternProfile(
            patterns: ["stair ?master", "stair ?climber", "stepmill", "step mill", "stair ?stepper"],
            targets: [t("gluteal", 0.88), t("quadriceps", 0.82), t("hamstring", 0.55), t("calves", 0.48), t("adductors", 0.22), t("abs", 0.16)],
            primaryRegions: ["Cardio", "Legs"], secondaryRegions: ["Core"]
        ),
        PatternProfile(
            patterns: ["downward.?dog", "adho mukha"],
            targets: [t("deltoids", 0.62), t("hamstring", 0.58), t("calves", 0.42), t("upper-back", 0.35), t("abs", 0.2)],
            primaryRegions: ["Yoga", "Shoulders"], secondaryRegions: ["Legs", "Back"]
        ),
        PatternProfile(
            patterns: ["warrior\\s*(pose|i{1,3}|one|two|three)?", "virabhadrasana"],
            targets: [t("quadriceps", 0.72), t("gluteal", 0.55), t("adductors", 0.42), t("abs", 0.28), t("deltoids", 0.22)],
            primaryRegions: ["Yoga", "Legs"], secondaryRegions: ["Core", "Shoulders"]
        ),
        PatternProfile(
            patterns: ["pigeon\\s*pose", "eka pada", "lizard\\s*pose", "hip\\s*open"],
            targets: [t("adductors", 0.88), t("gluteal", 0.65), t("lower-back", 0.3)],
            primaryRegions: ["Yoga", "Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["bridge\\s*pose", "wheel\\s*pose", "urdhva dhanurasana", "setu bandha"],
            targets: [t("gluteal", 0.78), t("hamstring", 0.5), t("lower-back", 0.45), t("chest", 0.25)],
            primaryRegions: ["Yoga", "Legs"], secondaryRegions: ["Back"]
        ),
        PatternProfile(
            patterns: ["cobra\\s*pose", "upward.?dog", "bhujangasana", "urdhva mukha"],
            targets: [t("lower-back", 0.78), t("chest", 0.42), t("deltoids", 0.35), t("abs", 0.15)],
            primaryRegions: ["Yoga", "Back"], secondaryRegions: ["Chest", "Shoulders"]
        ),
        PatternProfile(
            patterns: ["boat\\s*pose", "navasana"],
            targets: [t("abs", 0.92), t("adductors", 0.35), t("quadriceps", 0.28)],
            primaryRegions: ["Yoga", "Core"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["child'?s?\\s*pose", "balasana"],
            targets: [t("lower-back", 0.72), t("gluteal", 0.35), t("adductors", 0.3)],
            primaryRegions: ["Yoga", "Back"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["camel\\s*pose", "ustrasana"],
            targets: [t("chest", 0.55), t("lower-back", 0.62), t("deltoids", 0.38)],
            primaryRegions: ["Yoga", "Chest"], secondaryRegions: ["Back", "Shoulders"]
        ),
        PatternProfile(
            patterns: ["sun\\s*salutation", "surya namaskar"],
            targets: [t("deltoids", 0.42), t("hamstring", 0.42), t("abs", 0.38), t("lower-back", 0.35), t("quadriceps", 0.32), t("chest", 0.28)],
            primaryRegions: ["Yoga"], secondaryRegions: ["Core", "Legs", "Shoulders"]
        ),
        PatternProfile(
            patterns: ["\\byoga\\b", "\\bvinyasa\\b", "\\basana\\b", "\\bmeditation\\b", "\\bstretching?\\b", "\\bflexibility\\b", "\\bmobility\\b"],
            targets: [t("lower-back", 0.45), t("hamstring", 0.45), t("abs", 0.38), t("deltoids", 0.3), t("adductors", 0.28), t("gluteal", 0.22)],
            primaryRegions: ["Yoga", "Core"], secondaryRegions: ["Back", "Legs"]
        ),
        PatternProfile(
            patterns: ["wrist curl", "wrist extension", "reverse wrist", "finger curl", "plate pinch", "wrist roller", "grip training", "grip strength"],
            targets: [t("forearm", 1)],
            primaryRegions: ["Forearms"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["farmers (carry|walk)", "farmer'?s (carry|walk)", "loaded carry"],
            targets: [t("trapezius", 0.86), t("upper-back", 0.4), t("forearm", 0.55), t("abs", 0.35), t("obliques", 0.28), t("quadriceps", 0.24), t("calves", 0.2)],
            primaryRegions: ["Back", "Forearms"], secondaryRegions: ["Core", "Legs"]
        ),
        PatternProfile(
            patterns: ["tibialis raise", "tibialis"],
            targets: [t("tibialis", 1), t("ankles", 0.3)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["ankle circle", "ankle dorsiflexion", "ankle mobility", "calf raise"],
            targets: [t("calves", 0.8), t("tibialis", 0.45), t("ankles", 0.35)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["glute kickback", "donkey kick", "fire hydrant", "clamshell", "side lying (leg|hip) raise", "hip abduction", "seated hip abduction", "single leg kickback", "standing rear kick"],
            targets: [t("gluteal", 1), t("adductors", 0.22)],
            primaryRegions: ["Glutes"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["hip adduction", "inner thigh", "adductor machine"],
            targets: [t("adductors", 1), t("gluteal", 0.22)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["reverse hyper"],
            targets: [t("gluteal", 1), t("hamstring", 0.45), t("lower-back", 0.28)],
            primaryRegions: ["Glutes"], secondaryRegions: ["Legs"]
        ),
        PatternProfile(
            patterns: ["glute ham raise", "\\bghd\\b", "nordic hamstring"],
            targets: [t("hamstring", 1), t("gluteal", 0.55), t("lower-back", 0.35)],
            primaryRegions: ["Legs"], secondaryRegions: ["Glutes", "Back"]
        ),
        PatternProfile(
            patterns: ["torso rotation", "torso twist"],
            targets: [t("obliques", 1), t("abs", 0.35)],
            primaryRegions: ["Core"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["belt squat", "pendulum squat", "sissy squat"],
            targets: [t("quadriceps", 0.95), t("gluteal", 0.45), t("adductors", 0.2)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["arm cycling", "arm cycle", "arm ergometer", "arm bike"],
            targets: [t("deltoids", 0.72), t("biceps", 0.5), t("triceps", 0.45), t("chest", 0.28)],
            primaryRegions: ["Cardio", "Shoulders"], secondaryRegions: ["Arms"]
        ),
        PatternProfile(
            patterns: ["pec deck", "chest fly", "cable crossover", "cable chest fly"],
            targets: [t("chest", 1), t("deltoids", 0.28)],
            primaryRegions: ["Chest"], secondaryRegions: ["Shoulders"]
        ),
        PatternProfile(
            patterns: ["t-bar row", "t bar row"],
            targets: [t("upper-back", 0.88), t("biceps", 0.35), t("lower-back", 0.32)],
            primaryRegions: ["Back"], secondaryRegions: ["Biceps"]
        ),
        PatternProfile(
            patterns: ["forearm pronation", "forearm supination", "forearm curl"],
            targets: [t("forearm", 1)],
            primaryRegions: ["Forearms"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["\\bmobility\\b", "foam roll", "lacrosse ball", "90\\/90", "couch stretch", "pigeon", "hip flexor stretch", "thoracic", "world.?s greatest"],
            targets: [t("lower-back", 0.5), t("hamstring", 0.45), t("adductors", 0.4), t("gluteal", 0.3), t("tibialis", 0.15), t("calves", 0.15)],
            primaryRegions: ["Mobility"], secondaryRegions: ["Legs", "Back"]
        ),
        PatternProfile(
            patterns: ["treadmill", "elliptical", "\\brun(ning)?\\b", "\\bwalk(ing)?\\b", "\\bjog(ging)?\\b", "sprint"],
            targets: [t("quadriceps", 0.45), t("calves", 0.45), t("hamstring", 0.25), t("gluteal", 0.18)],
            primaryRegions: ["Cardio", "Legs"], secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["bear walk", "bear crawl", "sled push"],
            targets: [t("quadriceps", 0.35), t("deltoids", 0.35), t("abs", 0.3), t("chest", 0.25)],
            primaryRegions: ["Cardio"], secondaryRegions: ["Legs", "Shoulders", "Core"]
        ),
    ]

    public static func normalizeTargets(_ targets: [ExerciseMuscleTarget]) -> [ExerciseMuscleTarget] {
        var bySlug: [String: Double] = [:]
        for target in targets where target.weight > 0 {
            bySlug[target.slug, default: 0] += target.weight
        }
        return bySlug
            .map { ExerciseMuscleTarget(slug: $0.key, weight: ($0.value * 1000).rounded() / 1000) }
            .sorted { $0.weight > $1.weight }
    }

    private static func deriveRegions(from targets: [ExerciseMuscleTarget]) -> (primary: [String], secondary: [String]) {
        var regionWeights: [String: Double] = [:]
        for target in targets {
            guard let region = slugRegionMap[target.slug] else { continue }
            regionWeights[region, default: 0] += target.weight
        }
        let sorted = regionWeights.sorted { $0.value > $1.value }
        guard let topWeight = sorted.first?.value else {
            return (["Core"], [])
        }
        let primary = sorted.enumerated()
            .filter { index, entry in entry.value >= topWeight * 0.65 || index == 0 }
            .map { $0.element.key }
        let secondary = sorted
            .filter { entry in !primary.contains(entry.key) && entry.value >= topWeight * 0.24 }
            .map { $0.key }
        return (uniqueOrdered(primary), uniqueOrdered(secondary))
    }

    private static func uniqueOrdered(_ items: [String]) -> [String] {
        var seen = Set<String>()
        return items.filter { seen.insert($0).inserted }
    }

    private static func buildProfile(
        targets: [ExerciseMuscleTarget],
        primaryRegions: [String]? = nil,
        secondaryRegions: [String]? = nil
    ) -> ExerciseMuscleProfile {
        let normalized = normalizeTargets(targets)
        let derived = deriveRegions(from: normalized)
        let primary = uniqueOrdered(primaryRegions ?? derived.primary)
        let secondary = uniqueOrdered((secondaryRegions ?? derived.secondary).filter { !primary.contains($0) })
        return ExerciseMuscleProfile(primary: primary, secondary: secondary, targets: normalized)
    }

    public static func profile(
        forExerciseName exerciseName: String,
        fallbackMuscleGroup: String? = nil,
        muscleSlugs: [(slug: String, type: MuscleTargetType)]? = nil
    ) -> ExerciseMuscleProfile {
        if let muscleSlugs, !muscleSlugs.isEmpty {
            let valid = muscleSlugs.filter { slugRegionMap[$0.slug] != nil }
            let targets = valid.map {
                ExerciseMuscleTarget(slug: $0.slug, weight: $0.type == .primary ? primaryLoadWeight : secondaryLoadWeight)
            }
            let primaryRegions = uniqueOrdered(valid.filter { $0.type == .primary }.compactMap { slugRegionMap[$0.slug] })
            let secondaryRegions = uniqueOrdered(valid.filter { $0.type == .secondary }.compactMap { slugRegionMap[$0.slug] })
            return buildProfile(targets: targets, primaryRegions: primaryRegions, secondaryRegions: secondaryRegions)
        }

        for pattern in patterns {
            let matches = pattern.patterns.contains { regex in
                (try? NSRegularExpression(pattern: regex, options: .caseInsensitive))
                    .map { $0.firstMatch(in: exerciseName, range: NSRange(exerciseName.startIndex..., in: exerciseName)) != nil }
                    ?? false
            }
            if matches {
                return buildProfile(targets: pattern.targets, primaryRegions: pattern.primaryRegions, secondaryRegions: pattern.secondaryRegions)
            }
        }

        if let fallbackMuscleGroup, let fallbackTargets = fallbackTargetsByGroup[fallbackMuscleGroup] {
            return buildProfile(targets: fallbackTargets, primaryRegions: [fallbackMuscleGroup])
        }

        return buildProfile(targets: fallbackTargetsByGroup["Core"] ?? [], primaryRegions: ["Core"])
    }
}
