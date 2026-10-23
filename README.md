# AdRehearsal

A brand uploads a Meta ad (a video of up to about 60 seconds, or an image) and picks an audience.
A panel of synthetic Indian people reacts to it, and the report shows where people lose interest and why.
Every reason is tied to a second or a frame of the ad, and every simulated or assumed part is labelled.

## What works right now (M1–M2)

- **The engine** (`app/lib/engine/`): maths for who leaves and when, calibrated on a reference ad. Exit calculations use skip habit, attention, friction, relevance, and moods. Tests verify determinism and repeatability.
- **Ad reading** (`app/lib/ai/readAd.ts`): Gemini watches the video or image (up to 20 frames, 60 seconds) and writes a timeline of what is on screen—visual, text, and friction tags for each 3-second chunk.
- **Panel selection** (`app/lib/engine/panel.ts`): Draws a panel (200–1,000 people) from the bank, filtered by age, gender, state, city type, and income. Excludes people the AI marks as unlikely to use Instagram or Facebook. Weights by population.
- **Report page** (`app/app/page.tsx` + `app/components/Report.tsx`): Upload form with audience filters (placement: Reels or Feed, state, age, gender, city type, income). Report shows hook/hold/end/tap funnel numbers, retention curve, dot theatre with slider, reasons for drops, panel makeup (age/gender/city/income distribution), and a full list of assumptions.
- **Reasons call** (`app/lib/ai/writeReasons.ts`): Groups leavers by (3-second window, cause tag). For the top 8 groups, one Gemini call writes reasons (up to 22 words each, in a viewer's voice). Falls back to template sentences if the AI call fails.
- **Determinism** (`app/lib/engine/rng.ts`): Fixed seed (default 1), so the same ad and settings give the same result every time.
- **Assumptions** fully labelled on the page: mood odds, trait scoring blend, income bands, exit settings, relevance, panel size, tap intent, sound not analysed, image window (if still image), video start-only (if video over 60s).

What is not yet:
- Item 4: Meet four viewers (viewer-level cards showing one who left early, one who left later, one who watched to the end, one who would tap).
- Item 6: Export as PDF (print stylesheet is ready but not tested on A4 real paper) and CSV (funnel, retention, reasons table).
- Item 7: Saved run fallback page (`/saved`) for when a live run fails, and "Check noise" A/A link to run the same ad twice and verify they match.
- M3: Deploy to Vercel with a real OpenRouter API key; test with real ads.
- M4: Polish: all of item 4–7 above, plus README update.

## How the pieces fit

1. The ad goes to Gemini, which writes a second-by-second timeline of what is on screen.
2. A panel of people is drawn from the bank, and each person gets a shopper type and a mood.
3. Plain maths, not AI, decides who stops watching and when.
4. Claude Haiku writes one short reason for each person who left.
5. The report shows the drop-off points and the reasons, and labels everything that is assumed.

## Important

Nothing here predicts sales, picks winners or claims accuracy. It explains likely problems with an ad.

## Credit

Persona data is derived from NVIDIA Nemotron-Personas-India (CC BY 4.0).
