import Foundation

public enum MuscleIntensity {
    public static func tier(load: Double, maxLoad: Double) -> Int {
        guard load > 0, maxLoad > 0 else { return 0 }
        let ratio = load / maxLoad
        if ratio >= 0.75 { return 4 }
        if ratio >= 0.45 { return 3 }
        if ratio >= 0.18 { return 2 }
        return 1
    }
}
