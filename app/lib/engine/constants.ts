// Every ASSUMED number in the engine lives in this file, so it can be tuned in one place.
// "ASSUMED" = a starting guess from docs/ENGINE_SPEC.md, not measured on real ad results.
// Nothing here is a prediction of sales. These numbers shape a simulation only.

import type { FrictionTag, MoodName } from "./types";

// ---------- Random seeds ----------
// A person's traits are a property of the person, so they use one fixed seed (ASSUMED choice).
// Moods and exits use the seed of the run, so A, B and re-runs match.
export const TRAIT_SEED = 20251022;
// Seed used when finding the hook constant (base_0) on the reference panel.
export const CALIBRATION_SEED = 7;

// ---------- Trait rules (rules-only; the AI-score blend comes later) ----------
// Each noise value is the spread (standard deviation) of seeded bell-curve noise. ASSUMED.
export const PRICE_SENS_BASE = 0.95; // ASSUMED: price sensitivity of income level 1
export const PRICE_SENS_PER_INCOME_LEVEL = 0.17; // ASSUMED: drop per extra income level
export const PRICE_SENS_NOISE = 0.08; // ASSUMED
export const IMPULSIVITY_BASE = 0.85; // ASSUMED: impulsivity at age 18
export const IMPULSIVITY_PER_YEAR = 0.0125; // ASSUMED: drop per year of age after 18
export const IMPULSIVITY_NOISE = 0.1; // ASSUMED
export const ATTENTION_BASE = 0.8; // ASSUMED
export const ATTENTION_IMPULSIVITY_WEIGHT = 0.55; // ASSUMED
export const ATTENTION_NOISE = 0.08; // ASSUMED
export const SKEPTICISM_MID = 0.5; // ASSUMED: nothing in the data predicts it, so a middle value
export const SKEPTICISM_NOISE = 0.15; // ASSUMED
export const NOVELTY_MID = 0.5; // ASSUMED
export const NOVELTY_IMPULSIVITY_WEIGHT = 0.2; // ASSUMED
export const NOVELTY_NOISE = 0.12; // ASSUMED
export const SOCIAL_MID = 0.5; // ASSUMED
export const SOCIAL_NOISE = 0.15; // ASSUMED

// click_gain = clip(1 + 0.35 x novelty + 0.25 x social + 0.20 x impulsivity - 0.45 x skepticism, 0.2, 1.8)
export const CLICK_GAIN = {
  base: 1, // ASSUMED
  novelty: 0.35, // ASSUMED
  social: 0.25, // ASSUMED
  impulsivity: 0.2, // ASSUMED
  skepticism: -0.45, // ASSUMED
  min: 0.2, // ASSUMED
  max: 1.8, // ASSUMED
};

// ---------- Moods ----------
// Odds come from the earlier engine; effects are ASSUMED. Odds must add up to 1.
export const MOOD_ODDS: Record<MoodName, number> = {
  baseline: 0.4,
  scroll_fatigue: 0.13,
  bad_day: 0.1,
  tight_month: 0.1,
  good_mood: 0.08,
  recent_raise: 0.07,
  in_a_hurry: 0.07,
  just_browsing: 0.05,
};
// Patience multiplier: below 1 means they leave sooner. ASSUMED.
export const MOOD_PATIENCE: Record<MoodName, number> = {
  baseline: 1.0,
  scroll_fatigue: 0.65,
  bad_day: 0.8,
  good_mood: 1.15,
  recent_raise: 1.0,
  tight_month: 1.0,
  in_a_hurry: 0.7,
  just_browsing: 1.1,
};
// Added to price sensitivity. ASSUMED.
export const MOOD_PRICE_DELTA: Record<MoodName, number> = {
  baseline: 0,
  scroll_fatigue: 0,
  bad_day: 0,
  tight_month: 0.2,
  good_mood: 0,
  recent_raise: -0.2,
  in_a_hurry: 0,
  just_browsing: 0,
};
// Added to skepticism. ASSUMED.
export const MOOD_SKEPTICISM_DELTA: Record<MoodName, number> = {
  baseline: 0,
  scroll_fatigue: 0,
  bad_day: 0.1,
  tight_month: 0,
  good_mood: 0,
  recent_raise: 0,
  in_a_hurry: 0,
  just_browsing: 0,
};

// ---------- Attention ----------
// a_k = clip(KEEP x a_(k-1) + GAIN x salience_k x (1 - SKEPTIC_DAMP x skepticism)). From the earlier engine.
export const ATTENTION_KEEP = 0.55;
export const ATTENTION_GAIN = 0.55;
export const ATTENTION_SKEPTIC_DAMP = 0.25;
// skipHabit h = clip(0.5 x (1 - attention_baseline) + 0.5 x impulsivity). ASSUMED.
export const SKIP_HABIT_ATTENTION_WEIGHT = 0.5;
export const SKIP_HABIT_IMPULSIVITY_WEIGHT = 0.5;

// ---------- Friction ----------
// Which trait each friction tag leans on. ASSUMED.
// "invAttention" means (1 - attention_baseline). A number means a fixed trait value.
export type FrictionTrait =
  | "impulsivity"
  | "invAttention"
  | "priceSensitivity"
  | "skepticism"
  | "novelty"
  | number;
export const FRICTION_TRAIT: Record<FrictionTag, FrictionTrait> = {
  slow_open: "impulsivity",
  brand_first: "impulsivity",
  unclear_offer: "invAttention",
  text_heavy: "invAttention",
  too_long: "invAttention",
  price_shock: "priceSensitivity",
  trust_doubt: "skepticism",
  nothing_new: "novelty",
  off_putting_presenter: 0.5,
};

// ---------- Leaving chance ----------
// hazard = base x (HABIT_BASE + HABIT_SPAN x h) x (1 + (1 - a)) x (1 + f) x (1 + IRRELEVANCE x (1 - r)) / patience
export const HAZARD_HABIT_BASE = 0.6; // ASSUMED
export const HAZARD_HABIT_SPAN = 0.8; // ASSUMED
export const HAZARD_IRRELEVANCE = 0.8; // ASSUMED
export const BASE_HAZARD_LATER_CHUNKS = 0.05; // ASSUMED: base for every chunk after the hook chunk
// Starting guess for the hook-chunk base before calibration finds the real value (search range).
export const BASE_0_SEARCH_MIN = 0;
export const BASE_0_SEARCH_MAX = 50;

// ---------- Calibration ----------
// Hook = share still watching at second 3. Rough third-party ranges, NOT India-specific.
export const HOOK_TARGET = { reels: 0.3, feed: 0.23 };
// The reference ad used to find base_0 has one hook chunk with this salience and no friction. ASSUMED.
export const REFERENCE_HOOK_SALIENCE = 0.6;
// Size of the reference panel (drawn from the whole bank) used to calibrate. ASSUMED.
export const REFERENCE_PANEL_SIZE = 2000;

// ---------- Relevance ----------
// Used once interest tags exist (M2). Until then everyone gets RELEVANCE_UNKNOWN.
export const RELEVANCE_UNKNOWN = 0.5; // ASSUMED
export const RELEVANCE_BY_INTEREST_RANK = [1.0, 0.75, 0.6]; // ASSUMED: 1st, 2nd, 3rd interest
export const RELEVANCE_NO_MATCH = 0.25; // ASSUMED

// ---------- Funnel ----------
export const TAP_MIN_WATCHED_SHARE = 0.8; // ASSUMED: must watch this share of the ad to be able to tap
export const TAP_BASE_RATE = 0.1; // ASSUMED
export const TAP_MAX = 0.6; // ASSUMED
// tap probability = clip(TAP_BASE_RATE x click_gain x (TAP_RELEVANCE_FLOOR + r), 0, TAP_MAX)
export const TAP_RELEVANCE_FLOOR = 0.5; // ASSUMED
export const CHUNK_SECONDS = 3;

// ---------- Reasons ----------
export const NOT_RELEVANT_BELOW = 0.35; // ASSUMED: with no friction tags, leavers with r below this are "not_relevant"
export const AGREEMENT_STRONG = 0.4; // ASSUMED: share of a window's leavers
export const AGREEMENT_MEDIUM = 0.2; // ASSUMED

// ---------- Panel ----------
export const PANEL_MIN = 200;
export const PANEL_DEFAULT = 400;
export const PANEL_MAX = 1000;
