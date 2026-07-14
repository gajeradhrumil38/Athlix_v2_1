# Swift Foundation (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the native iOS foundation for Athlix — a testable `AthlixCore` Swift package (models, units, theme tokens, Supabase-backed auth) plus a thin SwiftUI app target with email/password + Sign in with Apple auth and a 4-tab + center-FAB navigation shell — so later milestones (Dashboard, Workout Logger, etc.) build on proven, working infrastructure.

**Architecture:** Two-part structure: (1) `ios/AthlixCore`, a Swift Package containing all logic that can be unit-tested from the command line via `swift test` — models, `WeightUnit` conversion, color design tokens, and an `AuthManager` built against a `SupabaseAuthClient` protocol (so tests run against a mock, no network needed); (2) `ios/Athlix.xcodeproj`, a thin SwiftUI app target that depends on `AthlixCore` as a local package and provides the parts that require Xcode/Simulator to verify — the app entry point, Sign In/Sign Up screens, Sign in with Apple button, and the `MainTabView` navigation shell. This mirrors the design spec's "single Xcode target, folder-based" decision while still enabling real TDD for the logic layer.

**Tech Stack:** Swift 6, SwiftUI, Swift Package Manager, `supabase-swift` SDK, XCTest, `AuthenticationServices` (Sign in with Apple).

---

## Prerequisites (one-time, manual — do before Task 1)

- [ ] **Step 1: Verify Xcode and command-line tools are installed**

Run: `xcodebuild -version`
Expected: prints an Xcode version (e.g. `Xcode 16.x`). If missing, install Xcode from the App Store first.

- [ ] **Step 2: Confirm the repo root and create the `ios/` directory**

Run: `mkdir -p /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios`

---

### Task 1: Scaffold the `AthlixCore` Swift Package

**Files:**
- Create: `ios/AthlixCore/Package.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Placeholder.swift`
- Create: `ios/AthlixCore/Tests/AthlixCoreTests/PlaceholderTests.swift`

- [ ] **Step 1: Create the package manifest**

```swift
// ios/AthlixCore/Package.swift
// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "AthlixCore",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "AthlixCore", targets: ["AthlixCore"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.20.0"),
    ],
    targets: [
        .target(
            name: "AthlixCore",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift"),
            ]
        ),
        .testTarget(
            name: "AthlixCoreTests",
            dependencies: ["AthlixCore"]
        ),
    ]
)
```

- [ ] **Step 2: Add a placeholder source file so the package builds**

```swift
// ios/AthlixCore/Sources/AthlixCore/Placeholder.swift
public enum AthlixCore {
    public static let version = "0.1.0"
}
```

- [ ] **Step 3: Add a placeholder test**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/PlaceholderTests.swift
import XCTest
@testable import AthlixCore

final class PlaceholderTests: XCTestCase {
    func testVersionIsSet() {
        XCTAssertEqual(AthlixCore.version, "0.1.0")
    }
}
```

- [ ] **Step 4: Run tests to verify the package resolves and builds**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test`
Expected: PASS — `Test Suite 'All tests' passed`, 1 test run.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore
git commit -m "Scaffold AthlixCore Swift package with supabase-swift dependency"
```

---

### Task 2: `WeightUnit` — direct port of `units.ts`

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Units/WeightUnit.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/WeightUnitTests.swift`

- [ ] **Step 1: Write the failing tests**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/WeightUnitTests.swift
import XCTest
@testable import AthlixCore

final class WeightUnitTests: XCTestCase {
    func testConvertKgToLbs() {
        let result = WeightUnit.convert(20, from: .kg, to: .lbs)
        XCTAssertEqual(result, 44.09, accuracy: 0.01)
    }

    func testConvertLbsToKg() {
        let result = WeightUnit.convert(100, from: .lbs, to: .kg)
        XCTAssertEqual(result, 45.36, accuracy: 0.01)
    }

    func testConvertSameUnitIsNoOp() {
        XCTAssertEqual(WeightUnit.convert(60, from: .kg, to: .kg), 60)
    }

    func testFormatWeightRoundsToOneDecimal() {
        XCTAssertEqual(WeightUnit.format(44.09, unit: .lbs), "44.1 lbs")
        XCTAssertEqual(WeightUnit.format(20, unit: .kg), "20.0 kg")
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter WeightUnitTests`
Expected: FAIL — `cannot find type 'WeightUnit' in scope`

- [ ] **Step 3: Implement `WeightUnit`**

```swift
// ios/AthlixCore/Sources/AthlixCore/Units/WeightUnit.swift
import Foundation

public enum WeightUnit: String, Codable, CaseIterable, Sendable {
    case kg
    case lbs

    private static let kgToLbs = 2.2046226218

    public static func convert(_ value: Double, from: WeightUnit, to: WeightUnit) -> Double {
        guard from != to else { return value }
        switch (from, to) {
        case (.kg, .lbs):
            return value * kgToLbs
        case (.lbs, .kg):
            return value / kgToLbs
        default:
            return value
        }
    }

    public static func format(_ value: Double, unit: WeightUnit) -> String {
        String(format: "%.1f %@", value, unit.rawValue)
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter WeightUnitTests`
Expected: PASS — 4 tests run, all green.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Units ios/AthlixCore/Tests/AthlixCoreTests/WeightUnitTests.swift
git commit -m "Port WeightUnit conversion/formatting from units.ts"
```

---

### Task 3: `Profile` model — Codable port of the `profiles` table

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Models/Profile.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/ProfileTests.swift`

- [ ] **Step 1: Write the failing test — decode a Supabase-shaped JSON fixture**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/ProfileTests.swift
import XCTest
@testable import AthlixCore

final class ProfileTests: XCTestCase {
    func testDecodesFromSupabaseJSON() throws {
        let json = """
        {
            "id": "b3f1c2d4-1111-2222-3333-444455556666",
            "full_name": "Dhrumil Gajera",
            "unit_preference": "kg",
            "theme_preference": "dark",
            "body_weight": 78.5,
            "height_cm": 178.0
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        let profile = try decoder.decode(Profile.self, from: json)

        XCTAssertEqual(profile.id, "b3f1c2d4-1111-2222-3333-444455556666")
        XCTAssertEqual(profile.fullName, "Dhrumil Gajera")
        XCTAssertEqual(profile.unitPreference, .kg)
        XCTAssertEqual(profile.themePreference, "dark")
        XCTAssertEqual(profile.bodyWeight, 78.5)
        XCTAssertEqual(profile.heightCm, 178.0)
    }

    func testDecodesWithMissingOptionalFields() throws {
        let json = """
        {
            "id": "b3f1c2d4-1111-2222-3333-444455556666",
            "full_name": null,
            "unit_preference": "lbs",
            "theme_preference": "darker",
            "body_weight": null,
            "height_cm": null
        }
        """.data(using: .utf8)!

        let profile = try JSONDecoder().decode(Profile.self, from: json)

        XCTAssertNil(profile.fullName)
        XCTAssertEqual(profile.unitPreference, .lbs)
        XCTAssertNil(profile.bodyWeight)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter ProfileTests`
Expected: FAIL — `cannot find type 'Profile' in scope`

- [ ] **Step 3: Implement `Profile`**

```swift
// ios/AthlixCore/Sources/AthlixCore/Models/Profile.swift
import Foundation

public struct Profile: Codable, Equatable, Sendable {
    public let id: String
    public let fullName: String?
    public let unitPreference: WeightUnit
    public let themePreference: String
    public let bodyWeight: Double?
    public let heightCm: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case unitPreference = "unit_preference"
        case themePreference = "theme_preference"
        case bodyWeight = "body_weight"
        case heightCm = "height_cm"
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter ProfileTests`
Expected: PASS — 2 tests run, all green.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Models ios/AthlixCore/Tests/AthlixCoreTests/ProfileTests.swift
git commit -m "Add Profile model mirroring the profiles table"
```

---

### Task 4: `SupabaseAuthClient` protocol + live implementation

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Auth/AuthUser.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Auth/SupabaseAuthClient.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Auth/LiveSupabaseAuthClient.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Config/SupabaseConfig.swift`

This task has no unit test of its own — `LiveSupabaseAuthClient` is a thin wrapper around the third-party SDK with no branching logic to verify in isolation. It exists so `AuthManager` (Task 5, which does have tests) can depend on the `SupabaseAuthClient` protocol instead of the concrete SDK type.

- [ ] **Step 1: Define the `AuthUser` value type**

```swift
// ios/AthlixCore/Sources/AthlixCore/Auth/AuthUser.swift
import Foundation

public struct AuthUser: Equatable, Sendable {
    public let id: String
    public let email: String?

    public init(id: String, email: String?) {
        self.id = id
        self.email = email
    }
}
```

- [ ] **Step 2: Define the `SupabaseAuthClient` protocol**

```swift
// ios/AthlixCore/Sources/AthlixCore/Auth/SupabaseAuthClient.swift
import Foundation

public enum AuthClientError: Error, Equatable {
    case invalidCredentials
    case network
    case unknown(String)
}

public protocol SupabaseAuthClient: Sendable {
    func currentUser() async -> AuthUser?
    func signIn(email: String, password: String) async throws -> AuthUser
    func signUp(email: String, password: String) async throws -> AuthUser
    func signInWithApple(idToken: String, nonce: String) async throws -> AuthUser
    func signOut() async throws
}
```

- [ ] **Step 3: Add the Supabase project config (URL + anon key, matching `src/lib/supabase.ts`)**

```swift
// ios/AthlixCore/Sources/AthlixCore/Config/SupabaseConfig.swift
import Foundation

public enum SupabaseConfig {
    public static let url = URL(string: "https://mrntwydykqsdawpklumf.supabase.co")!
    public static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybnR3eWR5a3FzZGF3cGtsdW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU2NDUsImV4cCI6MjA4OTM0MTY0NX0.lSyzEFdyrwFNEmIlsxLs3bxn1ZZxdBZQUD1m4VZYaRc"
}
```

- [ ] **Step 4: Implement `LiveSupabaseAuthClient` wrapping `supabase-swift`**

```swift
// ios/AthlixCore/Sources/AthlixCore/Auth/LiveSupabaseAuthClient.swift
import Foundation
import Supabase

public final class LiveSupabaseAuthClient: SupabaseAuthClient, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    public func currentUser() async -> AuthUser? {
        guard let session = try? await client.auth.session else { return nil }
        return AuthUser(id: session.user.id.uuidString, email: session.user.email)
    }

    public func signIn(email: String, password: String) async throws -> AuthUser {
        do {
            let session = try await client.auth.signIn(email: email, password: password)
            return AuthUser(id: session.user.id.uuidString, email: session.user.email)
        } catch {
            throw AuthClientError.invalidCredentials
        }
    }

    public func signUp(email: String, password: String) async throws -> AuthUser {
        do {
            let response = try await client.auth.signUp(email: email, password: password)
            return AuthUser(id: response.user.id.uuidString, email: response.user.email)
        } catch {
            throw AuthClientError.unknown("\(error)")
        }
    }

    public func signInWithApple(idToken: String, nonce: String) async throws -> AuthUser {
        do {
            let session = try await client.auth.signInWithIdToken(
                credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: nonce)
            )
            return AuthUser(id: session.user.id.uuidString, email: session.user.email)
        } catch {
            throw AuthClientError.unknown("\(error)")
        }
    }

    public func signOut() async throws {
        try await client.auth.signOut()
    }
}
```

- [ ] **Step 5: Verify the package still builds**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift build`
Expected: `Build complete!`

- [ ] **Step 6: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Auth ios/AthlixCore/Sources/AthlixCore/Config
git commit -m "Add SupabaseAuthClient protocol and live implementation"
```

---

### Task 5: `AuthManager` — observable session state, tested against a mock client

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Auth/AuthManager.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/AuthManagerTests.swift`

- [ ] **Step 1: Write the failing tests**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/AuthManagerTests.swift
import XCTest
@testable import AthlixCore

actor MockSupabaseAuthClient: SupabaseAuthClient {
    var stubbedUser: AuthUser?
    var signInError: AuthClientError?

    init(stubbedUser: AuthUser? = nil, signInError: AuthClientError? = nil) {
        self.stubbedUser = stubbedUser
        self.signInError = signInError
    }

    func currentUser() async -> AuthUser? { stubbedUser }

    func signIn(email: String, password: String) async throws -> AuthUser {
        if let signInError { throw signInError }
        let user = AuthUser(id: "user-1", email: email)
        stubbedUser = user
        return user
    }

    func signUp(email: String, password: String) async throws -> AuthUser {
        let user = AuthUser(id: "user-2", email: email)
        stubbedUser = user
        return user
    }

    func signInWithApple(idToken: String, nonce: String) async throws -> AuthUser {
        let user = AuthUser(id: "apple-user", email: nil)
        stubbedUser = user
        return user
    }

    func signOut() async throws {
        stubbedUser = nil
    }
}

@MainActor
final class AuthManagerTests: XCTestCase {
    func testSignInSuccessUpdatesUser() async {
        let manager = AuthManager(client: MockSupabaseAuthClient())
        await manager.signIn(email: "a@example.com", password: "hunter2")

        XCTAssertEqual(manager.user?.email, "a@example.com")
        XCTAssertNil(manager.errorMessage)
    }

    func testSignInFailureSetsErrorAndKeepsUserNil() async {
        let manager = AuthManager(client: MockSupabaseAuthClient(signInError: .invalidCredentials))
        await manager.signIn(email: "a@example.com", password: "wrong")

        XCTAssertNil(manager.user)
        XCTAssertNotNil(manager.errorMessage)
    }

    func testSignOutClearsUser() async {
        let mock = MockSupabaseAuthClient(stubbedUser: AuthUser(id: "user-1", email: "a@example.com"))
        let manager = AuthManager(client: mock)
        await manager.restoreSession()
        XCTAssertNotNil(manager.user)

        await manager.signOut()
        XCTAssertNil(manager.user)
    }

    func testRestoreSessionLoadsExistingUser() async {
        let mock = MockSupabaseAuthClient(stubbedUser: AuthUser(id: "user-1", email: "a@example.com"))
        let manager = AuthManager(client: mock)

        await manager.restoreSession()

        XCTAssertEqual(manager.user?.id, "user-1")
    }

    func testSignInWithAppleUpdatesUser() async {
        let manager = AuthManager(client: MockSupabaseAuthClient())
        await manager.signInWithApple(idToken: "token", nonce: "nonce")

        XCTAssertEqual(manager.user?.id, "apple-user")
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter AuthManagerTests`
Expected: FAIL — `cannot find type 'AuthManager' in scope`

- [ ] **Step 3: Implement `AuthManager`**

```swift
// ios/AthlixCore/Sources/AthlixCore/Auth/AuthManager.swift
import Foundation
import Observation

@Observable
@MainActor
public final class AuthManager {
    public private(set) var user: AuthUser?
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?

    private let client: SupabaseAuthClient

    public init(client: SupabaseAuthClient) {
        self.client = client
    }

    public func restoreSession() async {
        isLoading = true
        user = await client.currentUser()
        isLoading = false
    }

    public func signIn(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            user = try await client.signIn(email: email, password: password)
        } catch {
            user = nil
            errorMessage = "Could not sign in. Check your email and password."
        }
        isLoading = false
    }

    public func signUp(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            user = try await client.signUp(email: email, password: password)
        } catch {
            errorMessage = "Could not create account. Try a different email."
        }
        isLoading = false
    }

    public func signInWithApple(idToken: String, nonce: String) async {
        isLoading = true
        errorMessage = nil
        do {
            user = try await client.signInWithApple(idToken: idToken, nonce: nonce)
        } catch {
            errorMessage = "Sign in with Apple failed. Please try again."
        }
        isLoading = false
    }

    public func signOut() async {
        try? await client.signOut()
        user = nil
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter AuthManagerTests`
Expected: PASS — 5 tests run, all green.

- [ ] **Step 5: Run the full package test suite**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test`
Expected: PASS — all tests across `PlaceholderTests`, `WeightUnitTests`, `ProfileTests`, `AuthManagerTests` green (12 tests total).

- [ ] **Step 6: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Auth/AuthManager.swift ios/AthlixCore/Tests/AthlixCoreTests/AuthManagerTests.swift
git commit -m "Add AuthManager with mock-tested sign in/up/out and Apple sign in"
```

---

### Task 6: Color design tokens — direct port of `colors.ts`

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Theme/ColorTokens.swift`

No test for this task: it is static data (hex values), not logic — there is nothing to assert beyond "the constant equals the constant," which the compiler already guarantees. This mirrors CLAUDE.md's guidance not to add validation/tests for things that can't meaningfully fail.

- [ ] **Step 1: Implement the token set, matching `src/theme/colors.ts` exactly**

```swift
// ios/AthlixCore/Sources/AthlixCore/Theme/ColorTokens.swift
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

extension Color {
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
```

- [ ] **Step 2: Verify the package builds**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift build`
Expected: `Build complete!`

- [ ] **Step 3: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Theme
git commit -m "Port color design tokens from src/theme/colors.ts"
```

---

### Task 7: Create the Xcode app target (via XcodeGen — no GUI needed)

`xcodegen` (installed via `brew install xcodegen`) generates a fully-formed `.xcodeproj` from a declarative `project.yml`, so this task is scriptable end-to-end instead of requiring the Xcode GUI wizard.

**Files:**
- Create: `ios/project.yml`
- Create: `ios/Athlix.xcodeproj` (generated — do not hand-edit)
- Create: `ios/Athlix/AthlixApp.swift`
- Create: `ios/Athlix/Info.plist`
- Create: `ios/Athlix/Athlix.entitlements`

- [ ] **Step 1: Write the XcodeGen project spec**

```yaml
# ios/project.yml
name: Athlix
options:
  bundleIdPrefix: com.athlix
  deploymentTarget:
    iOS: "17.0"
packages:
  AthlixCore:
    path: AthlixCore
targets:
  Athlix:
    type: application
    platform: iOS
    sources:
      - path: Athlix
    dependencies:
      - package: AthlixCore
        product: AthlixCore
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.athlix.app
        INFOPLIST_FILE: Athlix/Info.plist
        CODE_SIGN_ENTITLEMENTS: Athlix/Athlix.entitlements
        SWIFT_VERSION: "6.0"
        TARGETED_DEVICE_FAMILY: "1"
```

- [ ] **Step 2: Write `Info.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDisplayName</key>
    <string>Athlix</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>UILaunchScreen</key>
    <dict/>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
    </array>
</dict>
</plist>
```

- [ ] **Step 3: Write the Sign in with Apple entitlement**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.applesignin</key>
    <array>
        <string>Default</string>
    </array>
</dict>
</plist>
```

- [ ] **Step 4: Generate the Xcode project**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodegen generate`
Expected: `Generated project at Athlix.xcodeproj`

- [ ] **Step 5: Replace the generated app entry point**

```swift
// ios/Athlix/AthlixApp.swift
import SwiftUI
import AthlixCore

@main
struct AthlixApp: App {
    @State private var authManager = AuthManager(client: LiveSupabaseAuthClient())

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authManager)
                .task {
                    await authManager.restoreSession()
                }
        }
    }
}
```

- [ ] **Step 6: Verify the app target builds**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 7: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/project.yml ios/Athlix.xcodeproj ios/Athlix/AthlixApp.swift ios/Athlix/Info.plist ios/Athlix/Athlix.entitlements
git commit -m "Create Xcode app target wired to AthlixCore, Sign in with Apple enabled"
```

---

### Task 8: `RootView` — switches between Auth and the tab shell

**Files:**
- Create: `ios/Athlix/RootView.swift`

No unit test: this view's only logic is "if user is nil show X else show Y," which is fully exercised by manual verification in Step 3 below — SwiftUI view bodies aren't unit-testable without a UI test harness, which is out of scope per the design doc's "manual on-device verification per milestone" decision.

- [ ] **Step 1: Implement `RootView`**

```swift
// ios/Athlix/RootView.swift
import SwiftUI
import AthlixCore

struct RootView: View {
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        if authManager.user != nil {
            MainTabView()
        } else {
            SignInView()
        }
    }
}
```

- [ ] **Step 2: Build the app target**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **` (this will fail until `MainTabView` and `SignInView` exist — implement Tasks 9 and 10 first, then return to verify this build).

- [ ] **Step 3: Manual verification (after Tasks 9-10 are done)**

Run the app in the iOS Simulator (`Cmd+R` in Xcode with an iPhone 15 simulator selected). Confirm: with no session, `SignInView` shows; after a successful sign-in, the view switches to `MainTabView`.

- [ ] **Step 4: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/RootView.swift
git commit -m "Add RootView switching between auth and main tab shell"
```

---

### Task 9: `MainTabView` — 4-tab + center FAB navigation shell

**Files:**
- Create: `ios/Athlix/Navigation/MainTabView.swift`
- Create: `ios/Athlix/Features/Dashboard/PlaceholderDashboardView.swift`
- Create: `ios/Athlix/Features/Progress/PlaceholderProgressView.swift`
- Create: `ios/Athlix/Features/Running/PlaceholderRunView.swift`
- Create: `ios/Athlix/Features/Calendar/PlaceholderCalendarView.swift`
- Create: `ios/Athlix/Features/Workout/PlaceholderLogView.swift`

This ports `mobileNavItems` from `src/components/layout/Layout.tsx:21-26` (Home, Progress, Run, Calendar) plus the center `+` FAB that opens the Workout Logger — the 5-slot mobile nav pattern. Full feature screens (Dashboard widgets, Workout Logger, etc.) are built in later milestones; this task wires the navigation shell with placeholder screens so the tab structure is provable now.

- [ ] **Step 1: Create placeholder views for each tab**

```swift
// ios/Athlix/Features/Dashboard/PlaceholderDashboardView.swift
import SwiftUI

struct PlaceholderDashboardView: View {
    var body: some View {
        Text("Home").foregroundStyle(.white)
    }
}
```

```swift
// ios/Athlix/Features/Progress/PlaceholderProgressView.swift
import SwiftUI

struct PlaceholderProgressView: View {
    var body: some View {
        Text("Progress").foregroundStyle(.white)
    }
}
```

```swift
// ios/Athlix/Features/Running/PlaceholderRunView.swift
import SwiftUI

struct PlaceholderRunView: View {
    var body: some View {
        Text("Run").foregroundStyle(.white)
    }
}
```

```swift
// ios/Athlix/Features/Calendar/PlaceholderCalendarView.swift
import SwiftUI

struct PlaceholderCalendarView: View {
    var body: some View {
        Text("Calendar").foregroundStyle(.white)
    }
}
```

```swift
// ios/Athlix/Features/Workout/PlaceholderLogView.swift
import SwiftUI

struct PlaceholderLogView: View {
    var body: some View {
        Text("Log Workout").foregroundStyle(.white)
    }
}
```

- [ ] **Step 2: Implement `MainTabView`**

```swift
// ios/Athlix/Navigation/MainTabView.swift
import SwiftUI
import AthlixCore

struct MainTabView: View {
    @State private var selection = 0
    @State private var showingLog = false

    var body: some View {
        TabView(selection: $selection) {
            PlaceholderDashboardView()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(0)

            PlaceholderProgressView()
                .tabItem { Label("Progress", systemImage: "chart.bar.fill") }
                .tag(1)

            Color.clear
                .tabItem { Label("Log", systemImage: "plus.circle.fill") }
                .tag(2)

            PlaceholderRunView()
                .tabItem { Label("Run", systemImage: "figure.run") }
                .tag(3)

            PlaceholderCalendarView()
                .tabItem { Label("Calendar", systemImage: "calendar") }
                .tag(4)
        }
        .tint(ColorTokens.accent)
        .onChange(of: selection) { _, newValue in
            if newValue == 2 {
                showingLog = true
                selection = 0
            }
        }
        .fullScreenCover(isPresented: $showingLog) {
            PlaceholderLogView()
        }
    }
}
```

- [ ] **Step 3: Build the app target**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Manual verification**

Run in Simulator. Confirm: 4 visible tabs (Home, Progress, Run, Calendar) plus a 5th "Log" tab item; tapping "Log" presents `PlaceholderLogView` as a full-screen cover and does not change the selected tab underneath it.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Navigation ios/Athlix/Features
git commit -m "Add MainTabView navigation shell with placeholder feature screens"
```

---

### Task 10: `SignInView` / `SignUpView` — email/password auth UI

**Files:**
- Create: `ios/Athlix/Features/Auth/SignInView.swift`
- Create: `ios/Athlix/Features/Auth/SignUpView.swift`

No unit test: these are SwiftUI forms whose only logic is delegating typed input to `AuthManager` (already tested in Task 5). Verified manually per Step 3.

- [ ] **Step 1: Implement `SignInView`**

```swift
// ios/Athlix/Features/Auth/SignInView.swift
import SwiftUI
import AthlixCore

struct SignInView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var email = ""
    @State private var password = ""
    @State private var showingSignUp = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("ATHLIX")
                    .font(.system(size: 28, weight: .black))
                    .foregroundStyle(ColorTokens.accent)

                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textFieldStyle(.roundedBorder)

                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)

                if let error = authManager.errorMessage {
                    Text(error).foregroundStyle(ColorTokens.red).font(.footnote)
                }

                Button {
                    Task { await authManager.signIn(email: email, password: password) }
                } label: {
                    if authManager.isLoading {
                        ProgressView()
                    } else {
                        Text("Sign In").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(ColorTokens.accent)
                .disabled(email.isEmpty || password.isEmpty || authManager.isLoading)

                SignInWithAppleButtonView()

                Button("Don't have an account? Sign up") {
                    showingSignUp = true
                }
                .font(.footnote)
            }
            .padding(24)
            .background(ColorTokens.bgBase)
            .sheet(isPresented: $showingSignUp) {
                SignUpView()
            }
        }
    }
}
```

- [ ] **Step 2: Implement `SignUpView`**

```swift
// ios/Athlix/Features/Auth/SignUpView.swift
import SwiftUI
import AthlixCore

struct SignUpView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 16) {
            Text("Create your account")
                .font(.title2.bold())
                .foregroundStyle(ColorTokens.textPrimary)

            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .textFieldStyle(.roundedBorder)

            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)

            if let error = authManager.errorMessage {
                Text(error).foregroundStyle(ColorTokens.red).font(.footnote)
            }

            Button {
                Task {
                    await authManager.signUp(email: email, password: password)
                    if authManager.user != nil { dismiss() }
                }
            } label: {
                if authManager.isLoading {
                    ProgressView()
                } else {
                    Text("Sign Up").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(ColorTokens.accent)
            .disabled(email.isEmpty || password.isEmpty || authManager.isLoading)
        }
        .padding(24)
        .background(ColorTokens.bgBase)
    }
}
```

- [ ] **Step 3: Build the app target**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **` (will fail until Task 11's `SignInWithAppleButtonView` exists — implement Task 11 first, then return here).

- [ ] **Step 4: Manual verification**

Run in Simulator. Confirm: entering a valid test account's email/password and tapping "Sign In" transitions to `MainTabView`; entering wrong credentials shows the red error text; tapping "Don't have an account? Sign up" presents `SignUpView` as a sheet.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Features/Auth/SignInView.swift ios/Athlix/Features/Auth/SignUpView.swift
git commit -m "Add SignInView and SignUpView for email/password auth"
```

---

### Task 11: Sign in with Apple button + nonce handling

**Files:**
- Create: `ios/Athlix/Features/Auth/SignInWithAppleButtonView.swift`
- Create: `ios/Athlix/Features/Auth/NonceGenerator.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/NonceGeneratorTests.swift` (nonce generation is pure logic — moved into `AthlixCore` so it's unit-testable)

- [ ] **Step 1: Write the failing test for nonce generation**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/NonceGeneratorTests.swift
import XCTest
@testable import AthlixCore

final class NonceGeneratorTests: XCTestCase {
    func testGeneratesRequestedLength() {
        let nonce = NonceGenerator.randomNonce(length: 32)
        XCTAssertEqual(nonce.count, 32)
    }

    func testGeneratesDifferentValuesEachCall() {
        let first = NonceGenerator.randomNonce(length: 32)
        let second = NonceGenerator.randomNonce(length: 32)
        XCTAssertNotEqual(first, second)
    }

    func testSha256ProducesSixtyFourCharHexString() {
        let hash = NonceGenerator.sha256("test-nonce")
        XCTAssertEqual(hash.count, 64)
        XCTAssertEqual(hash, hash.lowercased())
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter NonceGeneratorTests`
Expected: FAIL — `cannot find type 'NonceGenerator' in scope`

- [ ] **Step 3: Implement `NonceGenerator` in `AthlixCore`**

```swift
// ios/AthlixCore/Sources/AthlixCore/Auth/NonceGenerator.swift
import Foundation
import CryptoKit

public enum NonceGenerator {
    public static func randomNonce(length: Int = 32) -> String {
        precondition(length > 0)
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length

        while remainingLength > 0 {
            let randoms: [UInt8] = (0..<16).map { _ in UInt8.random(in: 0...255) }
            randoms.forEach { random in
                if remainingLength == 0 { return }
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remainingLength -= 1
                }
            }
        }
        return result
    }

    public static func sha256(_ input: String) -> String {
        let hashed = SHA256.hash(data: Data(input.utf8))
        return hashed.map { String(format: "%02x", $0) }.joined()
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter NonceGeneratorTests`
Expected: PASS — 3 tests run, all green.

- [ ] **Step 5: Implement `SignInWithAppleButtonView`**

```swift
// ios/Athlix/Features/Auth/SignInWithAppleButtonView.swift
import SwiftUI
import AuthenticationServices
import AthlixCore

struct SignInWithAppleButtonView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var currentNonce: String?

    var body: some View {
        SignInWithAppleButton(.signIn) { request in
            let nonce = NonceGenerator.randomNonce()
            currentNonce = nonce
            request.requestedScopes = [.email]
            request.nonce = NonceGenerator.sha256(nonce)
        } onCompletion: { result in
            switch result {
            case .success(let authorization):
                guard
                    let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                    let tokenData = credential.identityToken,
                    let idToken = String(data: tokenData, encoding: .utf8),
                    let nonce = currentNonce
                else { return }

                Task {
                    await authManager.signInWithApple(idToken: idToken, nonce: nonce)
                }
            case .failure(let error):
                print("Sign in with Apple failed: \(error)")
            }
        }
        .signInWithAppleButtonStyle(.white)
        .frame(height: 44)
    }
}
```

- [ ] **Step 6: Build the app target (this resolves Task 8 and Task 10's deferred build checks too)**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 7: Manual verification**

Run in Simulator (Sign in with Apple requires a real device or a Simulator signed into a test Apple ID via Settings → Sign in). Confirm: tapping the Apple button opens the system Apple ID sheet, and on success the app transitions to `MainTabView`.

- [ ] **Step 8: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Auth/NonceGenerator.swift ios/AthlixCore/Tests/AthlixCoreTests/NonceGeneratorTests.swift ios/Athlix/Features/Auth/SignInWithAppleButtonView.swift
git commit -m "Add Sign in with Apple button with tested nonce generation"
```

---

### Task 12: Milestone verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full `AthlixCore` test suite**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test`
Expected: PASS — all tests green (`PlaceholderTests`, `WeightUnitTests`, `ProfileTests`, `AuthManagerTests`, `NonceGeneratorTests`).

- [ ] **Step 2: Run a full app build**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 3: Manual end-to-end verification in Simulator**

Confirm the full flow: app launches → `SignInView` shown → sign up a new test account → app transitions to `MainTabView` showing 4 tabs + Log → tap each tab and confirm its placeholder screen shows → tap the Log tab and confirm `PlaceholderLogView` presents full-screen → dismiss it → go to `SignInView` again by force-quitting and relaunching with a stored session, confirming `restoreSession()` skips straight to `MainTabView`.

- [ ] **Step 4: Final commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add -A
git status
```

If anything is unstaged from manual Xcode project file changes (e.g. scheme shared settings), commit it:

```bash
git commit -m "Finalize Swift foundation milestone: auth + navigation shell"
```
