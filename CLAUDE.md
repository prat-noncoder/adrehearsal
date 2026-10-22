# AdRehearsal: rules for Claude Code

Read this at the start of every session. Details are in docs/PROJECT_STATE.md.

## What this project is
A brand uploads a Meta ad (video of up to about 60 seconds, or an image) and picks an audience. A panel of synthetic Indian people reacts to it. The report shows where people lose interest and why, with every reason tied to a second or frame. It explains likely problems. It does NOT predict sales, pick winners or claim accuracy. Every simulated or assumed part is labelled on the page.
Repo: https://github.com/prat-noncoder/adrehearsal (public). Built for a 3-day hackathon, solo.

## The person you are working with
Not a coder. Use plain language. Explain every technical word once. Never assume they know git, npm or the terminal.

## How to work (these rules matter more than speed)
1. One task per prompt. Do not add features that were not asked for.
2. Plan first. For anything bigger than a small edit, show a short plan and wait for my OK.
3. One git commit per finished step, with a clear message in plain English. Push after each step. The commit history is part of how this project is judged.
4. After every step, finish with exactly three plain lines: WHAT CHANGED, WHY, HOW TO CHECK IT.
5. Ask before installing anything or deleting anything.
6. NEVER open, print, copy, move, edit or commit api_key.txt, any .env file or any key. Keys live only in local files and in Vercel environment settings. Create a .gitignore early that excludes them, node_modules and the raw NVIDIA parquet files.
7. Never invent facts, numbers, links or results. If something is unknown, say so. If a number is an assumption, label it "assumed" in the code and on the page.
8. Keep files small. GitHub blocks files over 100 MiB. Do not commit the NVIDIA parquet files or the database dump.
9. If something fails, show me the exact error message and say what you think it means. Do not silently work around it.

## Design essentials
- People: data/bank_v1_20k.csv has 19,486 synthetic Indian people sampled from NVIDIA Nemotron-Personas-India (census-based). Columns include income_level (1 to 5, formula-assigned), a draft city tier and a population_weight. data/archetype_traits.csv has 25 shopper types with 8 numbers each; they are used only to give each person a report label (the nearest type), not in the maths.
- Panel size: minimum 200, default 400, up to 1,000. If a filter matches fewer people, use all of them and say so.
- AI access: one Google-only OpenRouter key. Every call goes to https://openrouter.ai/api/v1/chat/completions with Google models only (ids start with "google/"). Every request body must include "provider": {"only": ["google-vertex","google-ai-studio"], "allow_fallbacks": false}. Use reasoning effort low. Read the key from the OPENROUTER_API_KEY environment variable. Never use a non-Google model. Check a model id exists with GET https://openrouter.ai/api/v1/models before using it. If a call returns 402 (out of credits), stop and tell me.
- AI jobs: Gemini (google/gemini-3.8-flash) watches the ad and writes a timeline (time, kind: hook/body/cta, visual, text, audio, friction tags, eye-catching score, product category). For video, send a base64 data URL with the video_url content type and let Vertex serve it (AI Studio only accepts YouTube links). Gemini also labels each person with interest tags and "likely on Instagram or Facebook" only (shopper types are NOT chosen by AI: a test showed two AIs agreed only 45% of the time), and writes one short reason per person who left. Person traits come from rules on income and age plus seeded randomness, as written in docs/ENGINE_SPEC.md. Plain maths decides who leaves and when. The AI never decides exits.
- Funnel: Hook (still watching at second 3), Hold (still watching to the midpoint and end), Tap (would tap to learn more, using the type's click gain).
- Mood is drawn per person per run with a fixed seed, so A and B and re-runs match. Odds (assumed): baseline 40%, scroll fatigue 13%, bad day 10%, tight month 10%, good mood 8%, recent raise 7%, in a hurry 7%, just browsing 5%. Each mood becomes numbers (patience, price sensitivity) that the maths uses.
- Attention per 3-second chunk: attention = clip(0.55 x previous attention + 0.55 x eye-catching score x (1 - 0.25 x skepticism)). Eye-catching starting values: hook 1.0, call to action 1.0, benefit 0.9, product reveal 0.85, price 0.7, logo 0.5, music 0.3.
- Leaving chance per chunk rises with skip habit, low attention, friction that matters to the person's type, low relevance and fatigue. Coefficients are tuned so the panel's average hook lands in a target band. Placeholder benchmark: about 30% on Reels and 23% in feed (third-party, not India-specific).
- Tests to write: the same ad run as A and B must not produce a winner; shuffling people's traits must change results; labelling the same person twice must give the same answer.

## Tech
Next.js on Vercel. Videos upload straight to Vercel Blob (keep MP4s to about 15 MB at first; test the real limit early) (a normal function request is capped at 4.5 MB; Hobby functions at 300 seconds). Persona calls run in parallel batches. Keys go in environment variables.

## Repo layout
docs/ (PROJECT_STATE.md, ENGINE_SPEC.md, BUILD_SPEC.md) | data/ (bank, archetype traits) | scripts/ (persona classifier, labelling, bank builder) | app/ (the Next.js website; Vercel root directory; the engine lives in app/lib/engine) | README.md. Read docs/BUILD_SPEC.md for the milestones M1 to M4.

## Licence note
The README must carry one line: persona data is derived from NVIDIA Nemotron-Personas-India (CC BY 4.0).
