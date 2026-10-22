// Moods: drawn once per person per run from the seed, then turned into numbers the maths uses.

import * as C from "./constants";
import { clip, STREAM, uniform } from "./rng";
import type { MoodName, Traits } from "./types";

const MOOD_ORDER = Object.keys(C.MOOD_ODDS) as MoodName[];

/** The person's mood for this run. Same seed and person give the same mood. */
export function drawMood(seed: number, personIndex: number): MoodName {
  const u = uniform(seed, STREAM.mood, personIndex);
  let cumulative = 0;
  for (const mood of MOOD_ORDER) {
    cumulative += C.MOOD_ODDS[mood];
    if (u < cumulative) return mood;
  }
  return "baseline"; // only reached through rounding at the very end
}

export interface MoodAdjusted {
  patience: number;
  /** Price sensitivity after the mood's change (psEff in the spec). */
  priceSensitivity: number;
  /** Skepticism after the mood's change (skEff in the spec). */
  skepticism: number;
}

export function applyMood(traits: Traits, mood: MoodName): MoodAdjusted {
  return {
    patience: C.MOOD_PATIENCE[mood],
    priceSensitivity: clip(traits.priceSensitivity + C.MOOD_PRICE_DELTA[mood]),
    skepticism: clip(traits.skepticism + C.MOOD_SKEPTICISM_DELTA[mood]),
  };
}
