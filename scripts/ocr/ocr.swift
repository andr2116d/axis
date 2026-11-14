// OCR local de PDF escaneados con Apple Vision (sin servicios externos).
// Uso: ocr <archivo.pdf> [maxPaginas=30]  → texto por la salida estándar, páginas separadas por \f
import Foundation
import PDFKit
import Vision

let args = CommandLine.arguments
guard args.count >= 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else { FileHandle.standardError.write("no se pudo abrir\n".data(using: .utf8)!); exit(1) }
let maxPag = args.count >= 3 ? Int(args[2]) ?? 30 : 30
for i in 0..<min(doc.pageCount, maxPag) {
  guard let pag = doc.page(at: i) else { continue }
  let caja = pag.bounds(for: .mediaBox)
  let escala: CGFloat = min(3.0, 2600 / max(caja.width, caja.height))
  let ancho = Int(caja.width * escala), alto = Int(caja.height * escala)
  guard let ctx = CGContext(data: nil, width: ancho, height: alto, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: ancho, height: alto))
  ctx.scaleBy(x: escala, y: escala)
  pag.draw(with: .mediaBox, to: ctx)
  guard let img = ctx.makeImage() else { continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.recognitionLanguages = ["es-ES", "en-US"]
  req.usesLanguageCorrection = true
  try? VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
  // Ordena por renglón (y descendente) y luego x
  let obs = (req.results ?? []).sorted { a, b in abs(a.boundingBox.midY - b.boundingBox.midY) > 0.008 ? a.boundingBox.midY > b.boundingBox.midY : a.boundingBox.minX < b.boundingBox.minX }
  var lineas: [String] = []; var actualY: CGFloat = -1; var actual = ""
  for o in obs {
    guard let t = o.topCandidates(1).first?.string else { continue }
    if actualY < 0 || abs(o.boundingBox.midY - actualY) > 0.008 { if !actual.isEmpty { lineas.append(actual) }; actual = t; actualY = o.boundingBox.midY }
    else { actual += "  " + t }
  }
  if !actual.isEmpty { lineas.append(actual) }
  print(lineas.joined(separator: "\n"))
  print("\u{0C}")
}
