import AppKit
import CoreGraphics
import Foundation

public struct CapturePreviewSnapshot: Sendable, Equatable {
    public let dataURL: String
    public let width: Int
    public let height: Int

    public init(dataURL: String, width: Int, height: Int) {
        self.dataURL = dataURL
        self.width = width
        self.height = height
    }
}

public enum CapturePreviewSnapshotError: Error, LocalizedError, Equatable {
    case invalidSourceIdentifier(String)
    case unsupportedSourceType(String)
    case imageUnavailable(String)
    case encodingFailed

    public var errorDescription: String? {
        switch self {
        case let .invalidSourceIdentifier(sourceId):
            return "Invalid source identifier: \(sourceId)"
        case let .unsupportedSourceType(sourceType):
            return "Unsupported source type for snapshot: \(sourceType)"
        case let .imageUnavailable(message):
            return message
        case .encodingFailed:
            return "Unable to encode capture preview snapshot."
        }
    }
}

public enum CapturePreviewSnapshotter {
    public static func snapshot(
        source: CaptureSourceSummary,
        targetWidth: Int,
        targetHeight: Int,
        compression: Double = 0.62
    ) throws -> CapturePreviewSnapshot {
        let image = try rawSnapshot(for: source)
        let resized = resize(
            image: image,
            targetWidth: max(1, targetWidth),
            targetHeight: max(1, targetHeight)
        )

        let bitmap = NSBitmapImageRep(cgImage: resized)
        guard
            let jpegData = bitmap.representation(
                using: .jpeg,
                properties: [.compressionFactor: compression]
            )
        else {
            throw CapturePreviewSnapshotError.encodingFailed
        }

        return CapturePreviewSnapshot(
            dataURL: "data:image/jpeg;base64,\(jpegData.base64EncodedString())",
            width: resized.width,
            height: resized.height
        )
    }

    private static func rawSnapshot(for source: CaptureSourceSummary) throws -> CGImage {
        switch source.sourceType {
        case "monitor":
            guard let displayId = UInt32(source.id) else {
                throw CapturePreviewSnapshotError.invalidSourceIdentifier(source.id)
            }

            guard let image = CGDisplayCreateImage(CGDirectDisplayID(displayId)) else {
                throw CapturePreviewSnapshotError.imageUnavailable(
                    "Unable to capture monitor snapshot for \(source.displayName)."
                )
            }

            return image
        case "window":
            guard let windowId = UInt32(source.id) else {
                throw CapturePreviewSnapshotError.invalidSourceIdentifier(source.id)
            }

            let options: CGWindowListOption = [.optionIncludingWindow]
            let imageOptions: CGWindowImageOption = [.bestResolution, .boundsIgnoreFraming]

            guard
                let image = CGWindowListCreateImage(
                    .null,
                    options,
                    CGWindowID(windowId),
                    imageOptions
                )
            else {
                throw CapturePreviewSnapshotError.imageUnavailable(
                    "Unable to capture window snapshot for \(source.displayName)."
                )
            }

            return image
        default:
            throw CapturePreviewSnapshotError.unsupportedSourceType(source.sourceType)
        }
    }

    private static func resize(
        image: CGImage,
        targetWidth: Int,
        targetHeight: Int
    ) -> CGImage {
        guard
            let colorSpace = image.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB),
            let context = CGContext(
                data: nil,
                width: targetWidth,
                height: targetHeight,
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
        else {
            return image
        }

        context.interpolationQuality = .medium
        context.draw(image, in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
        return context.makeImage() ?? image
    }
}
