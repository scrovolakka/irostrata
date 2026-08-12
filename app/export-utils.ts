import { strToU8, zipSync } from "fflate";

const PNG_SIGNATURE = 8;

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number) {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = strToU8(type);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes);
  crcInput.set(data, 4);
  const chunk = new Uint8Array(12 + data.length);
  chunk.set(uint32(data.length));
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  chunk.set(uint32(crc32(crcInput)), 8 + data.length);
  return chunk;
}

export function setPngDpi(bytes: Uint8Array, dpi = 300) {
  if (bytes.length < 33) return bytes;
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  data.set(uint32(pixelsPerMeter));
  data.set(uint32(pixelsPerMeter), 4);
  data[8] = 1;
  const chunk = pngChunk("pHYs", data);
  const result = new Uint8Array(bytes.length + chunk.length);
  const insertAt = PNG_SIGNATURE + 25;
  result.set(bytes.subarray(0, insertAt));
  result.set(chunk, insertAt);
  result.set(bytes.subarray(insertAt), insertAt + chunk.length);
  return result;
}

export function setJpegDpi(bytes: Uint8Array, dpi = 300) {
  const result = new Uint8Array(bytes);
  // Canvas JPEG encoders normally emit a JFIF APP0 segment first. Its density
  // unit and X/Y density fields sit at fixed offsets within that segment.
  if (result.length >= 18 && result[0] === 0xff && result[1] === 0xd8 && result[2] === 0xff && result[3] === 0xe0 && String.fromCharCode(...result.subarray(6, 11)) === "JFIF\0") {
    const density = Math.max(1, Math.min(65535, Math.round(dpi)));
    result[13] = 1;
    result[14] = (density >>> 8) & 255;
    result[15] = density & 255;
    result[16] = (density >>> 8) & 255;
    result[17] = density & 255;
  }
  return result;
}

export function createZip(files: Record<string, Uint8Array>) {
  return zipSync(files, { level: 6 });
}
