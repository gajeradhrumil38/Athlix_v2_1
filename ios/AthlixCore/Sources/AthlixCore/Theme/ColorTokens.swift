import SwiftUI

public enum ColorTokens {
    // Backgrounds
    public static let bgBase = Color(hex: "030508")
    public static let bgSurface = Color.white.opacity(0.05)
    public static let bgElevated = Color.black.opacity(0.35)
    public static let bgHover = Color.white.opacity(0.09)

    // Borders
    public static let border = Color.white.opacity(0.10)
    public static let borderSubtle = Color.white.opacity(0.05)

    // Text
    public static let textPrimary = Color(hex: "e8edf3")
    public static let textSecondary = Color(hex: "8692a4")
    public static let textMuted = Color(hex: "3a4a60")

    // Accent
    public static let accent = Color(hex: "C8FF00")
    public static let accentDim = Color(hex: "C8FF00").opacity(0.12)
    public static let accentGlow = Color(hex: "C8FF00").opacity(0.30)

    // Status
    public static let green = Color(hex: "4ade80")
    public static let yellow = Color(hex: "FFD54F")
    public static let red = Color(hex: "f87171")
    public static let prGold = Color(hex: "FAC775")
    public static let purple = Color(hex: "a78bfa")

    // Liquid glass materials
    public static let lgNavBg = Color(hex: "1C1C20").opacity(0.78)
    public static let lgSheetBg = Color(hex: "121218").opacity(0.90)
}

public extension Color {
    init(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")
        var rgb: UInt64 = 0
        Scanner(string: hexSanitized).scanHexInt64(&rgb)
        let r = Double((rgb & 0xFF0000) >> 16) / 255
        let g = Double((rgb & 0x00FF00) >> 8) / 255
        let b = Double(rgb & 0x0000FF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
