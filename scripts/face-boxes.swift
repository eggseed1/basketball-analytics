// Face rectangles for player photo fallbacks (macOS Vision, offline).
// Usage: swift scripts/face-boxes.swift a.jpg b.jpg …
// Prints one JSON line per file: {"file","width","height","faces":[{x,y,w,h,confidence}]}
// Coordinates are fractions of the image with the origin at the top left.
import AppKit
import Foundation
import Vision

for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path)
    var faces: [[String: Double]] = []
    var width = 0
    var height = 0
    if let image = NSImage(contentsOf: url),
       let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) {
        width = cg.width
        height = cg.height
        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: cg, options: [:])
        try? handler.perform([request])
        for face in request.results ?? [] {
            let box = face.boundingBox
            faces.append([
                "x": Double(box.minX),
                "y": Double(1 - box.maxY),
                "w": Double(box.width),
                "h": Double(box.height),
                "confidence": Double(face.confidence),
            ])
        }
    }
    let row: [String: Any] = ["file": path, "width": width, "height": height, "faces": faces]
    if let data = try? JSONSerialization.data(withJSONObject: row),
       let line = String(data: data, encoding: .utf8) {
        print(line)
    }
}
