// generate-icons.mjs — Omni brand PWA icon generator
// Generates /public/icon-192.png and /public/icon-512.png
// Uses only Node.js built-ins (zlib, fs, path) — no external dependencies.
//
// Output: Blue (#2563eb) rounded-rectangle icon with white "O" circle ring.

import { deflateSync }     from 'zlib'
import { writeFileSync }   from 'fs'
import { join, dirname }   from 'path'
import { fileURLToPath }   from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── CRC32 (required for PNG chunk integrity) ──────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ── PNG chunk writer ──────────────────────────────────────────────────────────
function chunk(type, data) {
  const tb    = Buffer.from(type, 'ascii')
  const lenB  = Buffer.allocUnsafe(4); lenB.writeUInt32BE(data.length)
  const crcIn = Buffer.concat([tb, data])
  const crcB  = Buffer.allocUnsafe(4); crcB.writeUInt32BE(crc32(crcIn))
  return Buffer.concat([lenB, tb, data, crcB])
}

// ── Icon pixel renderer ───────────────────────────────────────────────────────
function renderIcon(size) {
  const BR = 37, BG = 99, BB = 235   // #2563eb
  const WR = 255, WG = 255, WB = 255 // white

  const cornerR = size * 0.22         // ~22% rounded corner
  const cx = size / 2, cy = size / 2
  const outerR = size * 0.29          // outer radius of the "O"
  const innerR = size * 0.17          // inner radius of the "O"

  // RGBA pixel buffer
  const rgba = new Uint8Array(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4

      // ── Alpha: rounded rectangle ────────────────────────────────────────
      const dx = Math.min(x, size - 1 - x)
      const dy = Math.min(y, size - 1 - y)
      let alpha = 255
      if (dx < cornerR && dy < cornerR) {
        const d = Math.sqrt((cornerR - dx) ** 2 + (cornerR - dy) ** 2)
        if (d >= cornerR)     alpha = 0
        else if (d > cornerR - 1.5) alpha = Math.round(Math.max(0, (cornerR - d) / 1.5) * 255)
      }

      if (alpha === 0) { rgba[i] = rgba[i+1] = rgba[i+2] = rgba[i+3] = 0; continue }

      // ── Color: blue background or white "O" ring ──────────────────────
      const px = x - cx, py = y - cy
      const r  = Math.sqrt(px * px + py * py)

      const inO = r >= innerR && r <= outerR
      if (inO) {
        rgba[i]   = WR; rgba[i+1] = WG; rgba[i+2] = WB; rgba[i+3] = alpha
      } else {
        rgba[i]   = BR; rgba[i+1] = BG; rgba[i+2] = BB; rgba[i+3] = alpha
      }
    }
  }

  return rgba
}

// ── Build PNG binary ──────────────────────────────────────────────────────────
function buildPng(size) {
  const rgba = renderIcon(size)

  // PNG filter byte 0 (None) + RGBA per row
  const rowLen = 1 + size * 4
  const raw    = Buffer.allocUnsafe(size * rowLen)
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0  // filter: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4
      const dst = y * rowLen + 1 + x * 4
      raw[dst]   = rgba[src]
      raw[dst+1] = rgba[src+1]
      raw[dst+2] = rgba[src+2]
      raw[dst+3] = rgba[src+3]
    }
  }

  const idat = deflateSync(raw, { level: 9 })

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)  // width
  ihdr.writeUInt32BE(size, 4)  // height
  ihdr.writeUInt8(8, 8)        // bit depth
  ihdr.writeUInt8(6, 9)        // color type 6 = RGBA
  ihdr.writeUInt8(0, 10)       // compression: deflate
  ihdr.writeUInt8(0, 11)       // filter: adaptive
  ihdr.writeUInt8(0, 12)       // interlace: none

  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),  // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Generate ──────────────────────────────────────────────────────────────────
const publicDir = join(__dirname, '../public')
const sizes     = [192, 512]

for (const size of sizes) {
  const png  = buildPng(size)
  const dest = join(publicDir, `icon-${size}.png`)
  writeFileSync(dest, png)
  console.log(`Generated ${dest}  (${size}x${size}, ${(png.length / 1024).toFixed(1)} KB)`)
}

console.log('✅ Icons generated successfully')
