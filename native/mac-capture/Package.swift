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
        ),
        .executable(
            name: "MacCaptureSmoke",
            targets: ["MacCaptureSmoke"]
        )
    ],
    targets: [
        .target(
            name: "MacCapture"
        ),
        .executableTarget(
            name: "MacCaptureSmoke",
            dependencies: ["MacCapture"]
        )
    ]
)
