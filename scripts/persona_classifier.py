#!/usr/bin/env python3
"""Persona shopper-type classifier and gold test.

What it does
------------
Reads each persona's written profile and asks a Claude model to pick the closest
of 25 shopper types (the types from the old engine's archetypes.py). It also
returns a runner-up, a confidence score and a "likely on Instagram/Facebook"
label. The gold test runs two models on the same 300 people and compares them.

Folder layout (put these files together in ONE folder)
  persona_classifier.py
  bank_v1_20k.csv
  archetype_traits.csv
  en_IN-00000-of-00011.parquet
  en_IN-00006-of-00011.parquet

Commands
  python3 persona_classifier.py sample --n 300
  python3 persona_classifier.py run --model claude-sonnet-5-5 --out sonnet.jsonl
  python3 persona_classifier.py run --model claude-haiku-5-5  --out haiku.jsonl
  python3 persona_classifier.py run --model claude-sonnet-5-5 --out sonnet_repeat.jsonl --limit 60
  python3 persona_classifier.py compare sonnet.jsonl haiku.jsonl --repeat sonnet_repeat.jsonl

Setup (once)
  pip3 install anthropic pandas pyarrow
  Put your key in a file named api_key.txt (or .env) in the same folder: just the key on one line
  (or type: export ANTHROPIC_API_KEY="your key" in Terminal). NEVER paste a key into a chat.

Add --dry-run to `run` to print the first prompt and exit without calling the API.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import glob
import json
import os
import re
import sys
import time

import pandas as pd

# Official per-million-token prices (USD), from Anthropic's pricing page.
PRICES = {
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
}

DESCRIPTIONS = {
    "skeptic": "Distrusts marketing claims; needs strong proof before acting.",
    "bargain_hunter": "Decisions revolve around price and perceived deal value.",
    "early_adopter": "Loves the new and unproven; first to try, low resistance.",
    "brand_loyalist": "Sticks to familiar brands; resistant to switching.",
    "pragmatist": "Weighs costs and benefits soberly; middle-of-the-road.",
    "impulse_buyer": "Acts on emotion in the moment; low deliberation.",
    "luxury_seeker": "Pays for quality and status; price is rarely the barrier.",
    "value_maximizer": "Researches to extract maximum utility per rupee.",
    "trend_follower": "Buys what is popular; strongly swayed by social proof.",
    "cautious_planner": "Deliberate and risk-aware; slow, considered decisions.",
    "mainstream_majority": "Average on every axis; the modal consumer.",
    "deal_skeptic": "Price-driven but distrusts 'too good to be true' offers.",
    "quality_connoisseur": "Discerning about craftsmanship; rejects gimmicks.",
    "convenience_seeker": "Values ease and time-saving above almost everything.",
    "risk_averse": "Avoids uncertainty; prefers the safe, proven option.",
    "social_proof_driven": "Looks to reviews, ratings and peers to decide.",
    "minimalist": "Buys little and deliberately; resistant to persuasion.",
    "eco_conscious": "Weighs sustainability and values alongside the product.",
    "enthusiast": "Deeply engaged with the category; receptive and curious.",
    "skeptic_straightforward": "Wants straight talk; dislikes fluffy marketing; relies on facts.",
    "instagram_scroller": "Highly visual, short attention span, trend-driven, impulse buyer.",
    "news_reader": "Information-dense consumer; values context and reputation.",
    "aspirational_striver": "Upwardly-mobile; stretches a tight budget for brands that signal status.",
    "family_decider": "Buys for the household; decisions gated on family/elder consensus.",
    "bharat_value_first": "Vernacular, mobile-first, ultra value-conscious; trusts word-of-mouth over ads.",
}

CATEGORIES = [
    "fashion_apparel", "beauty_personal_care", "food_grocery", "restaurants_delivery",
    "home_kitchen", "appliances_electronics", "mobiles_gadgets", "vehicles_mobility",
    "travel_hotels", "finance_insurance", "education_careers", "health_fitness",
    "real_estate", "entertainment_gaming", "parenting_kids", "jewellery_gold",
    "weddings_events", "sports_outdoors", "pets", "services_b2b", "telecom_utilities",
    "farming_agri",
]

TEXT_FIELDS = [
    ("persona", 450),
    ("professional_persona", 350),
    ("hobbies_and_interests", 300),
    ("skills_and_expertise", 250),
    ("career_goals_and_ambitions", 200),
    ("linguistic_background", 200),
]

SYSTEM = (
    "You classify synthetic Indian consumers by how they would react to advertising. "
    "You are given one person's profile and a fixed list of shopper types. Choose the type "
    "that best describes how this person weighs price, proof, novelty, brands and social "
    "proof when they see an ad.\n\n"
    "Rules:\n"
    "- Base your choice on work, money, education, age, place, habits and stated interests.\n"
    "- Do NOT infer anything from religion, caste, community, region of origin or name.\n"
    "- If the profile gives little signal, choose 'mainstream_majority' or 'pragmatist' and "
    "give a LOW confidence. Never force a distinctive type without evidence.\n"
    "- 'meta_likelihood' is how likely this person is to use Instagram or Facebook regularly: "
    "high, medium or low. Judge from age, education, work, urban or rural setting and any "
    "mention of phones, apps or social media.\n"
    "- 'interests' are the up to 3 product categories this person is most likely to care about "
    "and buy, most likely first, chosen ONLY from the category ids given. Base them on work, "
    "life stage, income, place and stated hobbies. Use fewer than 3 if the profile gives little signal.\n"
    "- Reply with ONE JSON object only, no other text:\n"
    '{"archetype": "<id>", "runner_up": "<id>", "confidence": <1-5>, '
    '"meta_likelihood": "high|medium|low", "interests": ["<id>", "<id>", "<id>"], '
    '"reason": "<max 25 words>"}'
)


def load_env(folder: str) -> None:
    """Read the API key from .env or api_key.txt in the folder, if present (never printed).
    Accepted formats: a line like ANTHROPIC_API_KEY=sk-ant-...  OR just the key on its own line."""
    for name in (".env", "api_key.txt"):
        p = os.path.join(folder, name)
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8", errors="ignore"):
            line = line.strip().strip('"').strip("'")
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            elif line.startswith("sk-ant-"):
                os.environ.setdefault("ANTHROPIC_API_KEY", line)


def here(*parts: str) -> str:
    return os.path.join(args_dir(), *parts)


_DIR = "."


def args_dir() -> str:
    return _DIR


def load_types(path: str) -> pd.DataFrame:
    return pd.read_csv(path)


def type_list_text() -> str:
    return "\n".join(f"- {k}: {v}" for k, v in DESCRIPTIONS.items())


def read_text_fields(ids: list[str], parquet_glob: str) -> dict[str, dict]:
    """Read only the row groups that contain the wanted people (fast and low-memory)."""
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq

    want = set(ids)
    cols = ["uuid"] + [f for f, _ in TEXT_FIELDS]
    out: dict[str, dict] = {}
    files = sorted(glob.glob(parquet_glob))
    if not files:
        sys.exit(f"No parquet files found with pattern {parquet_glob}")
    for f in files:
        pf = pq.ParquetFile(f)
        for g in range(pf.metadata.num_row_groups):
            guids = pf.read_row_group(g, columns=["uuid"]).column("uuid")
            mask = pc.is_in(guids, value_set=pa.array(list(want)))
            if not pc.any(mask).as_py():
                continue
            tbl = pf.read_row_group(g, columns=cols).filter(mask)
            for row in tbl.to_pylist():
                out[row["uuid"]] = row
        if len(out) == len(want):
            break
    return out


def build_prompt(row: pd.Series, text: dict) -> str:
    facts = [
        f"Age: {int(row['age'])}",
        f"Sex: {row['sex']}",
        f"Place: {row['district']}, {row['state']} ({row['zone']}; city type: {row['tier_draft']})",
        f"Education: {row['education_level']}",
        f"Occupation: {row['occupation']}",
        f"Marital status: {row['marital_status']}",
        f"Languages: {row['first_language']}",
        f"Income band: {row['income_band']}",
    ]
    parts = ["PROFILE", *facts, "", "WRITTEN DESCRIPTION"]
    for field, limit in TEXT_FIELDS:
        val = (text.get(field) or "").strip()
        if val:
            parts.append(f"[{field}] {val[:limit]}")
    parts += ["", "SHOPPER TYPES (use the id before the colon)", type_list_text()]
    parts += ["", "INTEREST CATEGORIES (use these ids only)", ", ".join(CATEGORIES)]
    return "\n".join(parts)


def parse_json(raw: str) -> dict | None:
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def call_model(client, model: str, prompt: str):
    kwargs = dict(model=model, max_tokens=300, system=SYSTEM,
                  messages=[{"role": "user", "content": prompt}])
    for attempt in range(4):
        try:
            try:
                return client.messages.create(temperature=0, **kwargs)
            except Exception as e:  # some models may not accept temperature
                if "temperature" in str(e).lower():
                    return client.messages.create(**kwargs)
                raise
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    return None


def cmd_sample(a) -> None:
    bank = pd.read_csv(here("bank_v1_20k.csv"))
    seed = a.seed
    # even spread over city type and age band so the gold test sees variety
    per = max(1, round(a.n / bank.groupby(["tier_draft", "ageband"]).ngroups))
    ids = (bank.groupby(["tier_draft", "ageband"], group_keys=False)
           .apply(lambda g: g.sample(min(len(g), per), random_state=seed)))
    ids = ids.sample(min(a.n, len(ids)), random_state=seed)
    ids[["uuid"]].to_csv(here("gold_sample_ids.csv"), index=False)
    print(f"Saved gold_sample_ids.csv with {len(ids)} people.")


def cmd_run(a) -> None:
    bank = pd.read_csv(here("bank_v1_20k.csv")).set_index("uuid")
    ids = pd.read_csv(here(a.ids))["uuid"].tolist()
    if a.limit:
        ids = ids[: a.limit]
    done = set()
    out_path = here(a.out)
    if os.path.exists(out_path):
        with open(out_path) as f:
            done = {json.loads(l)["uuid"] for l in f if l.strip()}
    todo = [i for i in ids if i not in done]
    texts = read_text_fields(todo, here(a.parquet))
    if a.dry_run:
        first = todo[0]
        row = bank.loc[first].copy()
        print(SYSTEM, "\n\n--- USER PROMPT ---\n")
        print(build_prompt(row, texts.get(first, {})))
        return
    import anthropic

    client = anthropic.Anthropic()
    price_in, price_out = PRICES.get(a.model, (0, 0))
    tot_in = tot_out = 0

    def work(uid: str) -> dict:
        row = bank.loc[uid]
        prompt = build_prompt(row, texts.get(uid, {}))
        resp = call_model(client, a.model, prompt)
        raw = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        parsed = parse_json(raw) or {}
        ok = parsed.get("archetype") in DESCRIPTIONS
        rec = {"uuid": uid, "model": a.model, "ok": ok, "raw": raw,
               "archetype": parsed.get("archetype"), "runner_up": parsed.get("runner_up"),
               "confidence": parsed.get("confidence"),
               "meta_likelihood": parsed.get("meta_likelihood"), "reason": parsed.get("reason"),
               "interests": [c for c in (parsed.get("interests") or []) if c in CATEGORIES][:3],
               "in_tokens": resp.usage.input_tokens, "out_tokens": resp.usage.output_tokens}
        return rec

    with open(out_path, "a") as f, cf.ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(work, u): u for u in todo}
        for n, fut in enumerate(cf.as_completed(futs), 1):
            try:
                rec = fut.result()
            except Exception as e:
                print("failed:", futs[fut], e)
                continue
            tot_in += rec["in_tokens"]
            tot_out += rec["out_tokens"]
            f.write(json.dumps(rec) + "\n")
            f.flush()
            if n % 25 == 0:
                print(f"{n}/{len(todo)} done")
    cost = tot_in / 1e6 * price_in + tot_out / 1e6 * price_out
    print(f"Finished {len(todo)} people with {a.model}. Tokens in/out: {tot_in}/{tot_out}. "
          f"Approx cost: ${cost:.3f} (about Rs {cost * 88:.0f}).")


def load_jsonl(path: str) -> pd.DataFrame:
    with open(path) as f:
        rows = [json.loads(l) for l in f if l.strip()]
    return pd.DataFrame(rows).set_index("uuid")


def cmd_compare(a) -> None:
    traits = load_types(here("archetype_traits.csv")).set_index("id")
    grp = traits["report_group"].to_dict()
    A, B = load_jsonl(here(a.a)), load_jsonl(here(a.b))
    both = A.index.intersection(B.index)
    A, B = A.loc[both], B.loc[both]
    ok = A["ok"] & B["ok"]
    print(f"People compared: {len(both)} (both answers valid for {int(ok.sum())})")
    A, B = A[ok], B[ok]
    exact = (A["archetype"] == B["archetype"]).mean()
    group = (A["archetype"].map(grp) == B["archetype"].map(grp)).mean()
    print(f"Same exact type: {exact:.0%}")
    print(f"Same report group (8 labels): {group:.0%}")
    for name, df in (("A", A), ("B", B)):
        top = df["archetype"].value_counts(normalize=True)
        print(f"Model {name}: most common type = {top.index[0]} ({top.iloc[0]:.0%}); "
              f"distinct types used = {df['archetype'].nunique()} of 25; "
              f"mean confidence = {pd.to_numeric(df['confidence'], errors='coerce').mean():.2f}")
        print(f"   meta_likelihood: {df['meta_likelihood'].value_counts(normalize=True).round(2).to_dict()}")
    if "interests" in A.columns and "interests" in B.columns:
        def jac(a, b):
            a, b = set(a or []), set(b or [])
            return len(a & b) / len(a | b) if (a | b) else 1.0
        j = pd.Series([jac(a, b) for a, b in zip(A["interests"], B["interests"])]).mean()
        top1 = pd.Series([(a or [None])[0] == (b or [None])[0] for a, b in zip(A["interests"], B["interests"])]).mean()
        print(f"Interest tags: same top-1 category for {top1:.0%}; average overlap of the 3 tags = {j:.0%}")
        allc = pd.Series([c for xs in A["interests"] for c in (xs or [])]).value_counts(normalize=True)
        print(f"   Model A top categories: {allc.head(5).round(2).to_dict()}")
    print("\nSample disagreements (A vs B):")
    dis = A[A["archetype"] != B["archetype"]].head(10)
    for uid in dis.index:
        print(f"  {uid[:8]}  A={A.loc[uid,'archetype']}  B={B.loc[uid,'archetype']}  | A said: {A.loc[uid,'reason']}")
    if a.repeat:
        R = load_jsonl(here(a.repeat))
        idx = A.index.intersection(R.index)
        same = (A.loc[idx, "archetype"] == R.loc[idx, "archetype"]).mean()
        print(f"\nStability: Model A run twice gives the same type for {same:.0%} of {len(idx)} people.")
    print("\nRule we agreed: use the cheaper model only if exact agreement >= 85% and group agreement >= 90%,"
          " and no single type takes more than ~25% of people.")


def main() -> None:
    global _DIR
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dir", default=".", help="folder holding the data files")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sample"); s.add_argument("--n", type=int, default=300); s.add_argument("--seed", type=int, default=7)
    r = sub.add_parser("run")
    r.add_argument("--model", required=True); r.add_argument("--out", required=True)
    r.add_argument("--ids", default="gold_sample_ids.csv"); r.add_argument("--limit", type=int, default=0)
    r.add_argument("--workers", type=int, default=6); r.add_argument("--parquet", default="en_IN-*.parquet")
    r.add_argument("--dry-run", action="store_true")
    c = sub.add_parser("compare"); c.add_argument("a"); c.add_argument("b"); c.add_argument("--repeat")
    a = p.parse_args()
    _DIR = a.dir
    load_env(_DIR)
    {"sample": cmd_sample, "run": cmd_run, "compare": cmd_compare}[a.cmd](a)


if __name__ == "__main__":
    main()
