// Exits: the chance of leaving in each chunk, and the seeded draw that decides it.
// Plain maths only. The AI never decides who leaves.

import { nextAttention, skipHabit, startAttention } from "./attention";
import * as C from "./constants";
import { applyMood } from "./moods";
import { STREAM, uniform } from "./rng";
import type { Chunk, Friction, Timeline, Viewer } from "./types";

/** The trait value a friction tag leans on, for one viewer. */
function frictionTraitValue(
  trait: C.FrictionTrait,
  v: Viewer,
  adjusted: ReturnType<typeof applyMood>,
): number {
  if (typeof trait === "number") return trait;
  switch (trait) {
    case "impulsivity":
      return v.traits.impulsivity;
    case "invAttention":
      return 1 - v.traits.attentionBaseline;
    case "priceSensitivity":
      return adjusted.priceSensitivity;
    case "skepticism":
      return adjusted.skepticism;
    case "novelty":
      return v.traits.noveltySeeking;
  }
}

/** For each friction tag in the chunk: strength x the viewer's matching trait. */
export function frictionTerms(
  chunk: Chunk,
  v: Viewer,
): { tag: Friction["tag"]; value: number }[] {
  const adjusted = applyMood(v.traits, v.mood);
  return chunk.friction.map((f) => ({
    tag: f.tag,
    value: f.strength * frictionTraitValue(C.FRICTION_TRAIT[f.tag], v, adjusted),
  }));
}

/** hazard_k = base x (0.6 + 0.8h) x (1 + (1 - a)) x (1 + f) x (1 + 0.8 (1 - r)) / patience */
export function hazard(
  base: number,
  habit: number,
  attention: number,
  frictionSum: number,
  relevance: number,
  patience: number,
): number {
  return (
    (base *
      (C.HAZARD_HABIT_BASE + C.HAZARD_HABIT_SPAN * habit) *
      (1 + (1 - attention)) *
      (1 + frictionSum) *
      (1 + C.HAZARD_IRRELEVANCE * (1 - relevance))) /
    patience
  );
}

export function leaveChance(hazardValue: number): number {
  return 1 - Math.exp(-hazardValue);
}

/**
 * Which chunk the viewer leaves in, or null if they watch to the end.
 * `base0` is the calibrated hook-chunk constant. Later chunks use a fixed base.
 */
export function exitChunk(
  v: Viewer,
  timeline: Timeline,
  base0: number,
  seed: number,
): number | null {
  const adjusted = applyMood(v.traits, v.mood);
  const habit = skipHabit(v.traits);
  let attention = startAttention(v.traits, adjusted.patience);
  for (let k = 0; k < timeline.chunks.length; k++) {
    const chunk = timeline.chunks[k];
    attention = nextAttention(attention, chunk.salience, adjusted.skepticism);
    const f = frictionTerms(chunk, v).reduce((sum, t) => sum + t.value, 0);
    const base = k === 0 ? base0 : C.BASE_HAZARD_LATER_CHUNKS;
    const h = hazard(base, habit, attention, f, v.relevance, adjusted.patience);
    if (uniform(seed, STREAM.exit, v.person.index, k) < leaveChance(h)) return k;
  }
  return null;
}
