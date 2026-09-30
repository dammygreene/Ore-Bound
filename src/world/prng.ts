const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function hashString(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function hashCoords(seed: string, generationVersion: number, ...coords: number[]): number {
  let hash = hashString(`${seed}:v${generationVersion}`);
  for (const coord of coords) {
    let value = coord | 0;
    value = Math.imul(value ^ (value >>> 16), 2246822519);
    value = Math.imul(value ^ (value >>> 13), 3266489917);
    value ^= value >>> 16;
    hash ^= value >>> 0;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function random01(seed: string, generationVersion: number, ...coords: number[]): number {
  return hashCoords(seed, generationVersion, ...coords) / 0xffffffff;
}

export function signedNoise(seed: string, generationVersion: number, ...coords: number[]): number {
  return random01(seed, generationVersion, ...coords) * 2 - 1;
}

function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function valueNoise2D(seed: string, generationVersion: number, x: number, y: number, scale: number, salt = 0): number {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = smootherStep(sx - x0);
  const ty = smootherStep(sy - y0);

  const n00 = signedNoise(seed, generationVersion, x0, y0, salt);
  const n10 = signedNoise(seed, generationVersion, x0 + 1, y0, salt);
  const n01 = signedNoise(seed, generationVersion, x0, y0 + 1, salt);
  const n11 = signedNoise(seed, generationVersion, x0 + 1, y0 + 1, salt);

  return lerp(lerp(n00, n10, tx), lerp(n01, n11, tx), ty);
}

export function fractalNoise2D(seed: string, generationVersion: number, x: number, y: number, scale: number, octaves: number, salt = 0): number {
  let total = 0;
  let amplitude = 1;
  let frequencyScale = scale;
  let amplitudeTotal = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2D(seed, generationVersion, x, y, frequencyScale, salt + octave * 101) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= 0.5;
    frequencyScale *= 0.5;
  }

  return total / amplitudeTotal;
}

export function chunkKey(chunkX: number, chunkY: number): string {
  return `${chunkX},${chunkY}`;
}

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseTileKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}
