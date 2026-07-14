// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "AthlixCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
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
