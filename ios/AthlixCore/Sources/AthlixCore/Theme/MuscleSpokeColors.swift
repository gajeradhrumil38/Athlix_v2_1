import SwiftUI

/// Per-region spoke colors for the Muscle Radar chart, matching web's `MuscleRadar.tsx` `SPOKES`
/// hex values exactly (Shoulders and Triceps intentionally share the same hex -- not a typo).
public enum MuscleSpokeColors {
    public static let byRegion: [String: Color] = [
        "Chest": Color(hex: "F09595"),
        "Shoulders": Color(hex: "AFA9EC"),
        "Back": Color(hex: "5DCAA5"),
        "Biceps": Color(hex: "85B7EB"),
        "Legs": Color(hex: "EF9F27"),
        "Glutes": Color(hex: "F4B96A"),
        "Core": Color(hex: "ff7a59"),
        "Triceps": Color(hex: "AFA9EC"),
    ]
}
