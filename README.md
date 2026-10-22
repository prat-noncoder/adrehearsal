# AdRehearsal

A brand uploads a Meta ad (a video of up to about 60 seconds, or an image) and picks an audience.
A panel of synthetic Indian people reacts to it, and the report shows where people lose interest and why.
Every reason is tied to a second or a frame of the ad, and every simulated or assumed part is labelled.

## What is built and what is not yet

Built so far:
- `data/bank_v1_20k.csv`: 19,486 synthetic Indian people.
- `data/archetype_traits.csv`: 25 shopper types with 8 numbers each.
- `scripts/persona_classifier.py`: the script that labels people.
- `docs/PROJECT_STATE.md`: the project notes.

Not built yet:
- The exit maths and its tests (`engine/`).
- The website, ad upload and report (`app/`).
- The AI steps: Gemini reading the ad, Claude Haiku labelling people and writing reasons.

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
