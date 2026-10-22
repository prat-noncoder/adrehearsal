# Build spec for Friday 1 PM: the real, working version

Goal: on the live link, a judge uploads an ad they brought (image, or a video up to about 60 seconds), picks an audience, and gets a real report from our own engine. Honest labels everywhere. If something fails, say so plainly and offer the saved run.

Order of work (milestones, each one pushed to GitHub so the live link updates):
- M1: engine + tests (see docs/ENGINE_SPEC.md). Engine lives in `app/lib/engine/` so Vercel can build it.
- M2: ad reading + `/api/rehearse` + report page working locally with a real image.
- M3: deploy, add the key in Vercel, test with 2 or 3 real ads (an image, a short video).
- M4: polish, Download PDF, saved-run fallback, README update.
If a milestone slips, ship the previous one. A working M2 beats an unfinished M4.

## Project layout (Vercel root directory is `app`)
`app/` is a Next.js app (App Router, TypeScript). Keep the old prototype as `app/public/prototype.html`. Engine in `app/lib/engine/`. Data in `app/data/`. Docs and scripts stay at repo root.

## Data
- `app/data/bank.json`: built by `scripts/build_bank_json.py` from `incoming/bank_v2.csv` (32,434 people) plus `incoming/labels_strong.jsonl` (AI trait scores for the first people, in the `traits` task format: traits {price_sensitivity, skepticism, novelty_seeking, impulsivity, attention, social_influence} each 1 to 5, meta_likelihood, interests). Keep it compact (target under 12 MB). Per person: id, sex, age, state, zone, tier, income_level, weight, optional ai traits, interests, meta.
- Remove a leftover gender effect from the AI scores: on labelled people, regress each trait on income_level, age, education group, zone, tier, occupation group and a female flag; subtract the female coefficient times the female flag; clip to 1 to 5. Print the coefficients before and after.
- Never commit keys, parquet files or the raw labels file if it contains profile text.

## Reading the ad (Gemini through OpenRouter, Google only)
Call POST https://openrouter.ai/api/v1/chat/completions with header Authorization: Bearer $OPENROUTER_API_KEY (environment variable, never in code), model `google/gemini-3.8-flash`, temperature 0, `reasoning: {effort: "low", exclude: true}`, `usage: {include: true}`, and `provider: {only: ["google-vertex","google-ai-studio"], allow_fallbacks: false}`. Check the image-input format in https://openrouter.ai/docs before writing the call. Retry 429 and 5xx up to 3 times; on 402 stop and show a clear message.
- Video: the browser extracts up to 12 frames (one per 3 seconds, resized to 640 px wide, JPEG quality 0.7) and sends frames only. Sound is NOT analysed in this version, and the page says so. Stay under the 4.5 MB request limit (reject larger uploads with a plain message).
- Image: one frame. Use a 6-second viewing window in 2 chunks (glance, then read). Say on the page this window is assumed.
- Prompt (system): "You watch an ad the way a viewer scrolling on Instagram would see it. Describe only what is visible. Never forecast performance. Frames are given in order, each with its time in seconds. Return ONE JSON object: {durationS, category (one of: fashion_apparel, beauty_personal_care, food_grocery, restaurants_delivery, home_kitchen, appliances_electronics, mobiles_gadgets, vehicles_mobility, travel_hotels, finance_insurance, education_careers, health_fitness, real_estate, entertainment_gaming, parenting_kids, jewellery_gold, weddings_events, sports_outdoors, pets, services_b2b, telecom_utilities, farming_agri), chunks: [{startS, endS, kind: hook|body|cta, visual, text, salience 0 to 1, friction: [{tag, strength 0 to 1}]}]}. Friction tags: slow_open, unclear_offer, price_shock, trust_doubt, text_heavy, brand_first, off_putting_presenter, nothing_new, too_long. salience is how much the moment grabs a scrolling viewer. Keep visual and text short."
- Validate the JSON; if invalid, retry once with a stricter reminder; then fail clearly.

## Reasons (one AI call, not one per person)
After the engine runs, group leavers by (3-second window, cause tag). For the top 8 groups, make ONE Gemini call. Input: for each group the window, cause, count, share, who they are (age band, city type, income band), and what is on screen then (the timeline's visual and text). Output: JSON list of {id, reason}, each a first-person sentence of at most 22 words in a typical viewer's voice, using only what is on screen. No mention of being an AI. No inference from sex, religion, caste or name. If the call fails, fall back to a plain template sentence per cause and mark it "template, not AI".

## API `/api/rehearse` (Node runtime, maxDuration 60)
Input: { frames[], kind, audience: {ageBands?, sex?, tier?, incomeGroup?}, panelSize: 200|400|1000, seed }. Steps: read ad -> select panel (people with meta "low" are excluded by default; unlabelled people stay in) -> run engine -> reasons -> return { timeline, panel: {requested, used, note}, funnel: {hook, hold, end, tap}, retention: [per second], groups: [{window, cause, count, share, label, reason, reasonSource}], assumptions: [...], costInfo }. Fixed seed so a re-run gives the same result.

## Pages
- `/`: upload (image or video), audience filters, panel size, Run. While running, show plain progress. Never show a raw error: show what failed and the saved-run link.
- Report (same page after Run): headline sentence (computed, not AI), hook / hold / end / tap numbers, retention curve, the dot theatre with the slider (reuse app/public/prototype.html styling and logic), reasons with counts and agreement labels, "Assumed in this run" list (mood odds, scoring blend, income bands, exit settings, sound not analysed, image window), and a footer: "Simulated viewers. This explains likely problems. It does not predict sales."
- "Download PDF" button: window.print() with a clean print stylesheet. "Run again" button.
- `/saved`: a stored real run (generated by our own engine from a real ad) clearly marked "Saved run". Used if the live call fails.
- A/A self-check: a small "Check noise" link runs the same ad as A and B and shows they match.

## Guardrails (from the earlier engine's idea, simplified)
Accept only JPEG, PNG, WebP, MP4 and MOV. Reject blank or near-blank images with a plain message. Cap video at about 60 seconds. No free-text input goes to the AI.

## Environment
`OPENROUTER_API_KEY` set in Vercel (Production). The person types it into Vercel's settings page; Claude Code never sees it. For local testing, read it from a local file that is in .gitignore.

## Tests
Engine tests from docs/ENGINE_SPEC.md must pass. Plus: the API returns the same result for the same input and seed; an oversized upload is rejected politely; a fake failure of the AI call shows the fallback.

## Rules
One commit per step, plain-English WHAT CHANGED / WHY / HOW TO CHECK IT after each step. Ask before installing. Never open or print key files.
