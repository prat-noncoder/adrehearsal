// Attention per 3-second chunk, and the skip habit.

import * as C from "./constants";
import { clip } from "./rng";
import type { Traits } from "./types";

/** Attention going into the first chunk: attention baseline times patience. */
export function startAttention(traits: Traits, patience: number): number {
  return traits.attentionBaseline * patience;
}

/** a_k = clip(0.55 x previous + 0.55 x salience x (1 - 0.25 x skepticism), 0, 1) */
export function nextAttention(previous: number, salience: number, skepticism: number): number {
  return clip(
    C.ATTENTION_KEEP * previous +
      C.ATTENTION_GAIN * salience * (1 - C.ATTENTION_SKEPTIC_DAMP * skepticism),
  );
}

/** How quick the person is to scroll on: low attention and high impulsivity raise it. */
export function skipHabit(traits: Traits): number {
  return clip(
    C.SKIP_HABIT_ATTENTION_WEIGHT * (1 - traits.attentionBaseline) +
      C.SKIP_HABIT_IMPULSIVITY_WEIGHT * traits.impulsivity,
  );
}
