/**
 * Generates the SiteBooks app icon set as flat vector-style PNGs.
 *
 * Deterministic and dependency-free: shapes are rasterised with 3x supersampling
 * and encoded with zlib, so the icons can be regenerated at any time.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve(import.meta.dirname, '..', 'assets')
const SIZE = 1024
const SS = 3 // supersampling factor
const NAVY = [15, 23, 42] // #0F172A
const AMBER = [245, 158, 11] // #F59E0B
const WHITE = [248, 250, 252] // #F8FAFC

// ─── PNG encoding ───────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(rgba, width, height) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // no filter
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── Drawing ────────────────────────────────────────────────

function canvas(size) {
  return { data: Buffer.alloc(size * size * 4), size }
}

function setPixel(c, x, y, [r, g, b], a = 255) {
  const i = (y * c.size + x) * 4
  c.data[i] = r
  c.data[i + 1] = g
  c.data[i + 2] = b
  c.data[i + 3] = a
}

function fillRect(c, x0, y0, x1, y1, color, radius = 0) {
  for (let y = Math.max(0, y0); y < Math.min(c.size, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(c.size, x1); x++) {
      if (radius > 0 && !insideRounded(x, y, x0, y0, x1, y1, radius)) continue
      setPixel(c, x, y, color)
    }
  }
}

function insideRounded(px, py, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(px, x1 - r))
  const cy = Math.max(y0 + r, Math.min(py, y1 - r))
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

function fillTriangle(c, ax, ay, bx, by, cx, cy, color) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
  const maxX = Math.min(c.size - 1, Math.ceil(Math.max(ax, bx, cx)))
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)))
  const maxY = Math.min(c.size - 1, Math.ceil(Math.max(ay, by, cy)))

  const sign = (px, py, x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2)
  const d1 = sign(ax, ay, bx, by, cx, cy)
  const d2 = sign(bx, by, cx, cy, ax, ay)
  const d3 = sign(cx, cy, ax, ay, bx, by)

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = sign(x, y, ax, ay, bx, by)
      const b = sign(x, y, bx, by, cx, cy)
      const d = sign(x, y, cx, cy, ax, ay)
      const hasNeg = a < 0 || b < 0 || d < 0
      const hasPos = a > 0 || b > 0 || d > 0
      if (!(hasNeg && hasPos)) setPixel(c, x, y, color)
    }
  }
}

/** Box-downsamples by SS, averaging colour and alpha. */
function downsample(src, size, factor) {
  const out = canvas(size)
  const area = factor * factor
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * src.size + (x * factor + sx)) * 4
          const alpha = src.data[i + 3]
          r += src.data[i] * alpha
          g += src.data[i + 1] * alpha
          b += src.data[i + 2] * alpha
          a += alpha
        }
      }
      const o = (y * size + x) * 4
      if (a === 0) {
        out.data[o] = 0
        out.data[o + 1] = 0
        out.data[o + 2] = 0
        out.data[o + 3] = 0
      } else {
        out.data[o] = Math.round(r / a)
        out.data[o + 1] = Math.round(g / a)
        out.data[o + 2] = Math.round(b / a)
        out.data[o + 3] = Math.round(a / area)
      }
    }
  }
  return out
}

/**
 * The mark: an amber roof over a white ledger card with navy entries.
 * `scale` shrinks the mark inside the canvas so adaptive icons stay in the
 * safe zone after Android's mask is applied.
 */
function drawMark(c, scale = 1) {
  // Coordinates are authored in a 1024 box, then multiplied by the supersample
  // factor so the mark fills the high-resolution canvas.
  const s = (v) => Math.round((512 + (v - 512) * scale) * SS)

  // Roof
  fillTriangle(c, s(512), s(232), s(214), s(506), s(810), s(506), AMBER)
  // Ledger card
  fillRect(c, s(296), s(506), s(728), s(800), WHITE, Math.round(30 * scale * SS))
  // Entries
  const line = (y, x1, x2) => fillRect(c, s(x1), s(y), s(x2), s(y + 26), NAVY, Math.round(13 * scale * SS))
  line(566, 360, 664)
  line(636, 360, 664)
  line(706, 360, 560)
}

function build({ transparent = false, scale = 1 } = {}) {
  const big = canvas(SIZE * SS)
  if (!transparent) fillRect(big, 0, 0, big.size, big.size, NAVY)
  drawMark(big, scale)
  return downsample(big, SIZE, SS)
}

function save(name, image) {
  const path = resolve(OUT, name)
  writeFileSync(path, encodePng(image.data, image.size, image.size))
  console.log('wrote', name)
}

// ─── Outputs ────────────────────────────────────────────────

save('icon.png', build({ scale: 0.86 }))

// Android adaptive: mark on transparent, kept inside the 66% safe zone.
save('android-icon-foreground.png', build({ transparent: true, scale: 1.08 }))

// Solid background layer for the adaptive icon.
const bg = canvas(SIZE)
fillRect(bg, 0, 0, SIZE, SIZE, NAVY)
save('android-icon-background.png', bg)

// Splash mark on transparent.
save('splash-icon.png', build({ transparent: true, scale: 0.8 }))

// Web favicon, downscaled from the full icon.
const icon = build({ scale: 0.86 })
const fav = canvas(48)
const block = SIZE / 48
for (let y = 0; y < 48; y++) {
  for (let x = 0; x < 48; x++) {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let sy = 0; sy < block; sy++) {
      for (let sx = 0; sx < block; sx++) {
        const i = (Math.floor(y * block + sy) * SIZE + Math.floor(x * block + sx)) * 4
        r += icon.data[i]
        g += icon.data[i + 1]
        b += icon.data[i + 2]
        n++
      }
    }
    setPixel(fav, x, y, [Math.round(r / n), Math.round(g / n), Math.round(b / n)])
  }
}
save('favicon.png', fav)

console.log('done')
