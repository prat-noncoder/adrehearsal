// Shared shapes used across the engine.

export type FrictionTag =
  | "slow_open"
  | "unclear_offer"
  | "price_shock"
  | "trust_doubt"
  | "text_heavy"
  | "brand_first"
  | "off_putting_presenter"
  | "nothing_new"
  | "too_long";

export const FRICTION_TAGS: FrictionTag[] = [
  "slow_open",
  "unclear_offer",
  "price_shock",
  "trust_doubt",
  "text_heavy",
  "brand_first",
  "off_putting_presenter",
  "nothing_new",
  "too_long",
];

export type MoodName =
  | "baseline"
  | "scroll_fatigue"
  | "bad_day"
  | "tight_month"
  | "good_mood"
  | "recent_raise"
  | "in_a_hurry"
  | "just_browsing";

export type Cause = FrictionTag | "not_relevant" | "lost_interest";

/** AI trait scores, 1 to 5, after the leftover gender effect was removed (see scripts/build_bank_json.py). */
export interface AiScores {
  ps: number; // price sensitivity
  sk: number; // skepticism
  nv: number; // novelty seeking
  im: number; // impulsivity
  at: number; // attention
  si: number; // social influence
}

export interface Person {
  /** Row number in the bank. Stable, so the same person always gets the same random draws. */
  index: number;
  id: string;
  sex: string;
  age: number;
  ageband: string;
  state: string;
  zone: string;
  tier: string;
  incomeLevel: number;
  weight: number;
  /** Only some people have AI labels. Everyone works without them. */
  ai?: AiScores;
  /** Up to 3 of the 22 ad categories, most likely first. */
  interests?: string[];
  meta?: "high" | "medium" | "low";
}

/** All traits are on a 0 to 1 scale, except clickGain (0.2 to 1.8). */
export interface Traits {
  priceSensitivity: number;
  skepticism: number;
  noveltySeeking: number;
  impulsivity: number;
  attentionBaseline: number;
  socialInfluence: number;
  clickGain: number;
}

export interface Friction {
  tag: FrictionTag;
  strength: number;
}

export interface Chunk {
  startS: number;
  endS: number;
  kind: "hook" | "body" | "cta";
  salience: number;
  friction: Friction[];
}

export interface Timeline {
  durationS: number;
  kind: "video" | "image";
  category: string;
  chunks: Chunk[];
}

export interface Viewer {
  person: Person;
  traits: Traits;
  mood: MoodName;
  relevance: number;
}
