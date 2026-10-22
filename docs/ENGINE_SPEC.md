# Engine spec v1 (no AI, no keys needed)

Purpose: given an ad timeline, an audience filter, a panel size and a seed, decide for every synthetic person when they stop watching, then report the funnel and the counted reasons. Plain maths only. The AI never decides who leaves. Language: TypeScript, in `app/lib/engine/` (so Vercel can build it), with tests (vitest). One module per commit.

Everything marked ASSUMED is a starting guess, labelled as such in the code and later on the page. Tuning against real ad results comes later.

## Inputs
- People: `data/bank_v1_20k.csv` (19,486 people; columns include sex, age, state, zone, tier_draft, income_level, population_weight). Filters: age band, sex, state or region, city type, income level.
- Traits (decided 22 Oct, in two steps). Test 1: asking an AI to pick one of 25 shopper types was unreliable (two AIs agreed 45% to 57% of the time; each repeated itself only about 80%). Test 2: asking for six numbers from 1 to 5 was stable (two different Google models on 296 people correlate 0.60 to 0.80 per trait and are within one point 92% to 100% of the time; each model repeats itself with correlation 0.88 to 0.96). So:
  - If a person has AI trait scores in `data/` (average of two passes of google/gemini-3.8-flash), map each score s to (s - 1) / 4 and blend: trait = clip(0.75 x AI + 0.25 x rule). The rule keeps an objective anchor in income and age. Scores: price_sensitivity, skepticism, novelty_seeking, impulsivity, attention (-> attention_baseline), social_influence.
  - If a person has no AI scores yet, use the rules below alone. Everyone works either way.
  - All blend weights, rules and noise levels are ASSUMED and use a seeded random generator so results repeat. Sex is never used.
  - price_sensitivity = clip(0.95 - 0.17 x (income_level - 1) + noise 0.08).
  - impulsivity = clip(0.85 - 0.0125 x (age - 18) + noise 0.10).
  - attention_baseline = clip(0.80 - 0.55 x impulsivity + noise 0.08).
  - skepticism = clip(0.50 + noise 0.15), novelty_seeking = clip(0.50 + 0.2 x (impulsivity - 0.5) + noise 0.12), social_influence = clip(0.50 + noise 0.15). Nothing in the data predicts these, so they are honest random variety around a middle value, to be tuned later with real ad results.
  - click_gain = clip(1 + 0.35 x novelty_seeking + 0.25 x social_influence + 0.20 x impulsivity - 0.45 x skepticism, 0.2, 1.8).
  - Report label: the closest of the 25 types in `data/archetype_traits.csv` (nearest by the six traits above). It is only a name for the report, repeatable, and never used in the maths.
- AI labels (added later, per person, from `data/`): interest tags (up to 3 of 22 categories, most likely first) and "likely on Instagram or Facebook" (high, medium, low). Until they exist, relevance r = 0.5 and everyone is included. Once they exist: r = 1.0 if the ad's category is the person's first interest, 0.75 if second, 0.6 if third, 0.25 otherwise (ASSUMED). By default people marked "low" are left out of the panel (switchable).
- Ad timeline (JSON), produced later by Gemini; for now a hand-written fake one:
  `{ durationS, kind: "video"|"image", category, chunks: [{ startS, endS, kind: "hook"|"body"|"cta", salience: 0..1, friction: [{ tag, strength: 0..1 }] }] }` with chunks of 3 seconds.
- Friction tags (fixed list): slow_open, unclear_offer, price_shock, trust_doubt, text_heavy, brand_first, off_putting_presenter, nothing_new, too_long.

## Moods (odds are from the earlier engine; effects ASSUMED)
Drawn once per person per run from the seed. baseline 40%, scroll_fatigue 13%, bad_day 10%, tight_month 10%, good_mood 8%, recent_raise 7%, in_a_hurry 7%, just_browsing 5%.
Effects: patience multiplier (baseline 1.0, scroll_fatigue 0.65, bad_day 0.8, good_mood 1.15, recent_raise 1.0, tight_month 1.0, in_a_hurry 0.7, just_browsing 1.1); price_sensitivity delta (recent_raise -0.2, tight_month +0.2, others 0); skepticism delta (bad_day +0.1, others 0).

## Per person and chunk k
- skEff = clip(skepticism + mood skepticism delta); psEff = clip(price_sensitivity + mood price delta).
- Start attention a0 = attention_baseline x patience. Attention update (from the earlier engine): a_k = clip(0.55 x a_(k-1) + 0.55 x salience_k x (1 - 0.25 x skEff), 0, 1).
- skipHabit h = clip(0.5 x (1 - attention_baseline) + 0.5 x impulsivity).
- Friction term f_k = sum over the chunk's tags of strength x trait. Trait per tag (ASSUMED): slow_open and brand_first use impulsivity; unclear_offer, text_heavy and too_long use (1 - attention_baseline); price_shock uses psEff; trust_doubt uses skEff; nothing_new uses novelty_seeking; off_putting_presenter uses 0.5.
- Relevance r in 0..1 as defined above (0.5 until interest tags exist).
- hazard_k = base_k x (0.6 + 0.8 x h) x (1 + (1 - a_k)) x (1 + f_k) x (1 + 0.8 x (1 - r)) / patience.
- pLeave_k = 1 - exp(-hazard_k). Leave if a seeded uniform draw (seed + person index + chunk) is below pLeave_k.
- base_0 (the hook chunk) is CALIBRATED; base for later chunks starts at 0.05 (ASSUMED).

## Funnel
- Hook: share still watching after chunk 0 (second 3). Hold: share still watching at the midpoint, and at the end. Tap: among people who watched at least 80% of the ad, Bernoulli with probability clip(0.10 x click_gain x (0.5 + r), 0, 0.6) (ASSUMED, shown as stated intent, not behaviour).
- Calibration: find base_0 by bisection so the panel's average hook equals a target. Default target 30% for Reels and 23% for feed. These are a third-party guide's rough ranges, not India-specific, and are replaced by the advertiser's own numbers when available. Note the effect: most people leave in the first 3 seconds.

## Reasons (structure only; the AI writes the sentence later)
For each person who left, cause = the tag with the largest strength x trait in the chunk they left at. If the chunk has no tags: "not_relevant" when r < 0.35, else "lost_interest". Report counts per (chunk, cause) with an agreement label: at least 40% of that window's leavers = strong, 20% to 40% = medium, below 20% = weak.

## Tests (must pass)
1. Same seed gives identical results.
2. A/A: the same ad as A and B on the same panel and seed gives identical hook, hold and tap, so any "winner" is impossible.
3. Shuffle: shuffling traits across people removes the link between price_sensitivity and leaving after a price_shock chunk (correlation falls to about 0).
4. Sanity: stronger friction lowers hook; higher salience raises hold; scroll_fatigue lowers hook compared with baseline.
5. Calibration: with target 0.30 the simulated hook lands within 1 point.
6. Panel size: asking for more people than match a filter returns all of them and says so.

## Deliverables
`app/lib/engine/` with a module per concern (moods, attention, exits, panel, funnel, reasons), tests, a fake ad timeline in `app/lib/engine/fixtures/`, and a demo script that prints hook, hold, tap, exits by 3-second window and the top reasons with agreement labels. Each module is its own commit, and each step ends with three plain lines: WHAT CHANGED, WHY, HOW TO CHECK IT.
