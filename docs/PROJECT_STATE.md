# Project state: pre-launch ad rehearsal (working name AdRehearsal)

Updated 21 Oct 2026, evening. Memory is off, so this file is the source of truth. Paste it at the start of any fresh chat.

## What it is
A brand uploads a Meta ad (video, carousel or image) and picks an audience. A panel of synthetic Indian people reacts to it. The report shows where people lose interest and why, with every reason tied to a second or frame. It explains likely problems. It does NOT predict sales or pick winners. Everything simulated or assumed is labelled.

## Locked decisions
- Build fresh in a new GitHub repo, deploy on Vercel (Next.js). Reuse the brother's engine ideas and small pieces, and credit them in the README ("built on my brother's engine; here is what I adapted").
- AI jobs and models:
  - Watching the ad: Gemini (video + audio). Only option that takes video. Files API, one frame per second.
  - Live world context (global, India, state, festivals): Gemini with Google Search, cached daily, local festival calendar as fallback. Lean, later layer.
  - Labelling people and writing each reason: Claude Haiku 5.5 ($0.10 / $0.50 per million tokens). Newer and stronger than Llama 3.3, same price range.
  - Not used: DeepInfra, Groq, Perplexity, OpenAI.
- Keys: one Anthropic key, one Gemini key. NEVER paste keys into a chat or commit them to GitHub. They live in a local file and in Vercel environment settings.
- Panel size: minimum 200, default 400 (about +/-5 points of random noise), 1,000 for splitting by segment (at least 100 per segment). If a filter matches fewer people, use all of them and say so.

## Repo and workflow
- Repo created 22 Oct 2026: https://github.com/prat-noncoder/adrehearsal (public, personal account, started with a README). One repo only: docs/, data/, scripts/, engine/, app/.
- Workflow decided: Claude Code (desktop Code tab, Local) builds and makes one commit per step. The chat decides, writes prompts, reviews and fixes errors. CLAUDE.md in the repo root carries the rules. Each step ends with three plain lines (what changed, why, how to check) so the user can explain it in the pitch.
- Goes into the repo: README, docs, the 19,486-person bank (about 5 MB, later a labelled version of about 10 to 15 MB), the 25 shopper types, the classifier script, then app, engine and tests. Stays out: NVIDIA raw parquet files (223 MB each; GitHub blocks files over 100 MiB), all keys, the database dump, the 1,110 legacy personas until re-labelled, other people's real ad results without permission.
- Unknown: whether the user's Mac is already signed in to GitHub for pushing. Claude Code checks this in step 0.

## Built so far (files)
- bank_v1_20k.csv: 19,486 people sampled from NVIDIA Nemotron-Personas-India (two of eleven English files), balanced so urban and educated audiences have enough people. Has income level 1-5 (formula: education, occupation group, urban, metro, seeded noise; cut-offs match the India income weights from the brother's engine), draft city tier (8 X-class metro cities), and a population weight so results can be rebalanced to India's real mix. 2011 census base, so urban share is probably understated.
- archetype_traits.csv: the 25 shopper types with 8 numbers each (skepticism, price sensitivity, novelty seeking, trust threshold, brand loyalty, social influence, impulsivity, attention baseline), read from the brother's archetypes.py. Mapped to 8 report groups.
- persona_bank_legacy.json: 1,110 Indian personas from the old dump with 4 character cards each. Their old shopper types were random, so they must be re-labelled with the new method.
- persona_classifier.py: AI picks one of 25 types, a runner-up, confidence, "likely on Instagram/Facebook", and up to 3 interest tags (22 fixed categories). Includes the gold test (sample, run, compare). Tested without API calls. Rules in the prompt: no religion, caste or name inference; low confidence when unsure.
- label_priority_ids.csv: order for labelling (metro and city, educated, 18-44 first).
- PROMPT_FOR_CLAUDE_CODE.txt: steps for the 300-person test (Sonnet vs Haiku, plus a repeat of each). On hold until the Anthropic key exists.
- Income meaning (from the old cards): 1 under Rs15k, 2 Rs15-35k, 3 Rs35-75k, 4 Rs75k-1.5L, 5 Rs1.5L+ per month (NCCS E to A, approximate, formula-assigned).

## Engine design (not built yet)
- Ad reading (Gemini): timeline of events with time, kind (hook, body, cta), visual, on-screen or spoken text, audio, plus friction tags from a fixed list, an eye-catching score, a product category (same 22 categories as interests), and duration. Describe only what a viewer perceives, never forecast performance.
- Funnel: Hook (still watching at second 3), Hold (still watching to the midpoint and end), Tap (would tap to learn more, using the type's click gain).
- Each person: fixed numbers from their shopper type, an income band, interest tags, plus a mood drawn per run. Mood odds (the brother's): baseline 40%, scroll fatigue 13%, bad day 10%, tight month 10%, good mood 8%, recent raise 7%, in a hurry 7%, just browsing 5%. Each mood becomes numbers (patience, price sensitivity) that the maths uses. Draws are seeded, so A and B see the same states and re-runs repeat. Mood odds and effects are assumptions.
- Attention per 3-second chunk (adapted from the brother's cognition.py): attention = clip(0.55 x previous attention + 0.55 x eye-catching score x (1 - 0.25 x skepticism)). Eye-catching starting values: hook 1.0, call to action 1.0, benefit 0.9, product reveal 0.85, price 0.7, logo 0.5, music 0.3.
- Relevance: overlap between the person's interest tags and the ad's category, plain maths.
- Leaving: chance of leaving a chunk rises with the person's skip habit, low attention, friction that matters to their type, low relevance and fatigue, and falls with strong eye-catching moments. Coefficients are tuned so the panel's average hook lands in a target band (third-party guide: about 30% on Reels, 23% in feed, not India-specific). The AI does NOT decide exits. It only writes one reason per exit, tied to the friction tag at that moment.
- Fatigue has two meanings. Scroll fatigue (mood, hook-time patience) is in. Repeat-exposure wear-out is dropped; the old formula exp(-lambda x (views - 1)) was one fixed curve.
- Tests: same ad as A and B must not produce a winner; shuffle traits across people and results must change; label the same person twice and answers must match; story layer on versus off.

## Known weaknesses (say them openly)
- Accuracy against real viewers is unproven. Old back-tests were near chance at ranking ads (median AUC 0.50 on 42 results with 100+ ads).
- The old team's own ablation found occupation, education and marital conditioning hurt their ranking signal. Default conditioning stays minimal: age, income, state, city type, shopper type, mood, interests.
- Assumptions: income formula, city tier, mood effects, exit coefficients, "likely on Meta" label.

## What is left, in order
A. No keys needed: exit-engine prototype with fake ad timelines (check curves, shuffle test, A/A noise); ad-reading output spec; report layout; repo structure.
B. Needs the Anthropic key: run the 300-person test, label all 19,486 people with interest tags, label and merge the 1,110 legacy personas, freeze the bank.
C. Needs the Gemini key: ad reading for video and images; live context snapshot.
D. App: Next.js. Videos upload straight to Vercel Blob (function requests are capped at 4.5 MB; Hobby functions at 300 s). Persona calls run in parallel batches. Report page. Deploy.
E. Test with ads nobody has seen. Label every simulated part on the page.
F. Submissions. Sources disagree on times, so plan for the EARLIEST and check the portal for each. MVP scope doc: portal says 21 Oct 11:59 PM (Mesa guide says 7:30 PM, ForgeX PDF says 8 PM). GitHub, prototype and proof of progress: 22 Oct 12:30 PM (guide) or 1 PM (PDF). Vercel link: 22 Oct 7:30 PM. Loom, 6-8 slide deck and LinkedIn post: 23 Oct 12:30 PM (guide) or 1 PM (PDF). Pitches from 2 PM on 23 Oct. Problem statement was submitted 21 Oct 10:44 AM.

## MVP scope document requirements (from the Mesa "Problem to Proof" guide)
A Google Doc set to "anyone with the link can view", with 8 headers: 1 Problem (who, 2-3 real quotes with links); 2 Current State (today's workflow as numbered steps plus tools used); 3 Opportunity (frequency, time per task, people affected, every number linked); 4 Solution (future workflow, which steps disappear); 5 AI Thinking (which steps are AI or human, and why AI and not a rule or script); 6 Architecture (Input, AI/model, Logic, Action/tools, Output); 7 Impact (time saved per user per week, show the math); 8 Limitations (3 failure cases, what a human checks, what is built next). Then the MVP cut: IN (the one core journey, max 3 features), OUT, LATER, Magic moment, Tech stack, and Sources.
Rule: no claim without a link or a quote; mark anything unsupported "GAP - needs research"; a made-up number is never acceptable.
Evidence comes from Apify scrapes run in the same chat: Reddit (trudax/reddit-scraper-lite), Google (apify/google-search-scraper), G2 reviews (automation-lab/g2-scraper).
Our stack for this doc: Gemini (reads the ad), Claude Haiku (labels people, writes reasons), Vercel, GitHub. No n8n.
One-line problem: Marketing heads and founders at Indian consumer brands spend days making and launching each Meta ad because they can't tell if it will work, or why it failed, until the budget is already gone.
Subreddit: r/FacebookAds. Tools on G2: Motion and AdCreative.ai.

## Rules for working together
- Plain language, one step at a time, do not rush, do not agree for the sake of it, verify claims, never invent facts or links.
- Ask before creating anything in the user's Drive. Hold prompts and files until asked.
- The user handles permissions with the brother. Keep ethics talk out of it; just credit the reuse.
