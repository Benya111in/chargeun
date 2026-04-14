// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MacCapture",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "MacCapture",
            targets: ["MacCapture"]
        )
    ],
    targets: [
        .target(
            name: "MacCapture"
        ),
        .testTarget(
            name: "MacCaptureTests",
            dependencies: ["MacCapture"]
        )
    ]
)
