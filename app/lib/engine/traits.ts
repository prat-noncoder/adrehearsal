// Person traits from simple rules on income and age, plus seeded noise. Sex is never used.
// (The AI-score blend is added later; until a person has AI scores, these rules are used alone.)

import * as C from "./constants";
import { clip, normal, STREAM } from "./rng";
import type { Person, Traits } from "./types";

// One number per trait so each trait gets its own noise.
const TRAIT_ID = {
  priceSensitivity: 1,
  impulsivity: 2,
  attention: 3,
  skepticism: 4,
  novelty: 5,
  social: 6,
} as const;

function noise(person: Person, id: number, spread: number): number {
  return spread * normal(C.TRAIT_SEED, STREAM.trait, person.index, id);
}

export function deriveTraits(person: Person): Traits {
  const priceSensitivity = clip(
    C.PRICE_SENS_BASE -
      C.PRICE_SENS_PER_INCOME_LEVEL * (person.incomeLevel - 1) +
      noise(person, TRAIT_ID.priceSensitivity, C.PRICE_SENS_NOISE),
  );
  const impulsivity = clip(
    C.IMPULSIVITY_BASE -
      C.IMPULSIVITY_PER_YEAR * (person.age - 18) +
      noise(person, TRAIT_ID.impulsivity, C.IMPULSIVITY_NOISE),
  );
  const attentionBaseline = clip(
    C.ATTENTION_BASE -
      C.ATTENTION_IMPULSIVITY_WEIGHT * impulsivity +
      noise(person, TRAIT_ID.attention, C.ATTENTION_NOISE),
  );
  const skepticism = clip(
    C.SKEPTICISM_MID + noise(person, TRAIT_ID.skepticism, C.SKEPTICISM_NOISE),
  );
  const noveltySeeking = clip(
    C.NOVELTY_MID +
      C.NOVELTY_IMPULSIVITY_WEIGHT * (impulsivity - 0.5) +
      noise(person, TRAIT_ID.novelty, C.NOVELTY_NOISE),
  );
  const socialInfluence = clip(
    C.SOCIAL_MID + noise(person, TRAIT_ID.social, C.SOCIAL_NOISE),
  );
  const g = C.CLICK_GAIN;
  const clickGain = clip(
    g.base +
      g.novelty * noveltySeeking +
      g.social * socialInfluence +
      g.impulsivity * impulsivity +
      g.skepticism * skepticism,
    g.min,
    g.max,
  );
  return {
    priceSensitivity,
    skepticism,
    noveltySeeking,
    impulsivity,
    attentionBaseline,
    socialInfluence,
    clickGain,
  };
}
