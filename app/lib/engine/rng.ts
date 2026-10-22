// A small seeded random generator. Same numbers in, same random numbers out, so results repeat.

/** Mixes whole numbers into one 32-bit seed. */
export function hashSeed(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** Mulberry32: a tiny, well-known generator. Returns a function giving numbers in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One repeatable random number in [0, 1) for a given combination of whole numbers. */
export function uniform(...parts: number[]): number {
  return createRng(hashSeed(...parts))();
}

/** One repeatable bell-curve number (mean 0, spread 1) for a given combination of whole numbers. */
export function normal(...parts: number[]): number {
  const rng = createRng(hashSeed(...parts));
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Labels so different jobs never share the same random numbers. */
export const STREAM = {
  trait: 1,
  mood: 2,
  exit: 3,
  tap: 4,
  panel: 5,
  shuffle: 6,
  display: 7, // only used to place a leaver's dot inside their 3-second window; never decides who leaves
} as const;

export function clip(x: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, x));
}
