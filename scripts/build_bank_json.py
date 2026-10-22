"""Build app/data/bank.json from data/bank_v2.csv and incoming/labels_strong.jsonl.

What it does, in plain words:
  1. Reads the 32,434 people.
  2. Reads the AI trait scores (1 to 5) for the first ~4,900 people.
  3. Removes a leftover gender effect from those scores: for each trait it fits a straight-line
     model on income level, age, education group, zone, city type, occupation group and a female flag,
     then subtracts (female coefficient x female flag), and keeps the score between 1 and 5.
  4. Prints the model coefficients before and after, so the change can be checked.
  5. Writes a compact JSON file. It holds only scores, interest tags and a social-media-use label,
     never the profile text from the labels file.

Run from the repo root:  python3 scripts/build_bank_json.py
"""
import csv
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANK_CSV = os.path.join(ROOT, "data", "bank_v2.csv")
LABELS = os.path.join(ROOT, "incoming", "labels_strong.jsonl")
OUT = os.path.join(ROOT, "app", "data", "bank.json")

TRAITS = ["price_sensitivity", "skepticism", "novelty_seeking", "impulsivity", "attention", "social_influence"]
SHORT = {"price_sensitivity": "ps", "skepticism": "sk", "novelty_seeking": "nv",
         "impulsivity": "im", "attention": "at", "social_influence": "si"}


def load_bank():
    with open(BANK_CSV, newline="") as f:
        return list(csv.DictReader(f))


def load_labels():
    labels = {}
    with open(LABELS) as f:
        for line in f:
            d = json.loads(line)
            if d.get("task") == "traits" and d.get("ok") and d.get("traits"):
                labels[d["uuid"]] = d
    return labels


def design_matrix(rows):
    """Columns: intercept, income_level, age, then dummy columns for each category, then female."""
    cats = {"edu_group": [], "zone": [], "tier_draft": [], "occ_group": []}
    for c in cats:
        cats[c] = sorted({r[c] for r in rows})[1:]  # drop the first value as the baseline
    names = ["intercept", "income_level", "age"]
    names += [f"{c}={v}" for c in cats for v in cats[c]]
    names += ["female"]
    X = np.zeros((len(rows), len(names)))
    for i, r in enumerate(rows):
        X[i, 0] = 1
        X[i, 1] = float(r["income_level"])
        X[i, 2] = float(r["age"])
        j = 3
        for c in cats:
            for v in cats[c]:
                X[i, j] = 1.0 if r[c] == v else 0.0
                j += 1
        X[i, j] = 1.0 if r["sex"] == "Female" else 0.0
    return X, names


def fit(X, y):
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return beta


def print_coefficients(title, names, betas):
    print(f"\n{title}")
    print(f"{'term':38s}" + "".join(f"{SHORT[t]:>8s}" for t in TRAITS))
    for k, n in enumerate(names):
        print(f"{n:38s}" + "".join(f"{betas[t][k]:8.3f}" for t in TRAITS))


def main():
    people = load_bank()
    labels = load_labels()
    print(f"People in bank: {len(people)}. People with AI trait scores: {len(labels)}.")

    labelled = [r for r in people if r["uuid"] in labels]
    print(f"Labelled people found in the bank: {len(labelled)}.")
    X, names = design_matrix(labelled)
    female_col = names.index("female")
    female = X[:, female_col]

    raw = {t: np.array([float(labels[r["uuid"]]["traits"][t]) for r in labelled]) for t in TRAITS}
    before = {t: fit(X, raw[t]) for t in TRAITS}
    print_coefficients("COEFFICIENTS BEFORE removing the female effect", names, before)

    adjusted = {t: np.clip(raw[t] - before[t][female_col] * female, 1.0, 5.0) for t in TRAITS}
    after = {t: fit(X, adjusted[t]) for t in TRAITS}
    print_coefficients("COEFFICIENTS AFTER removing the female effect (refit on adjusted scores)", names, after)

    print("\nFemale coefficient, before -> after:")
    for t in TRAITS:
        print(f"  {t:20s} {before[t][female_col]:+.3f} -> {after[t][female_col]:+.3f}")

    ai_by_uuid = {}
    for k, r in enumerate(labelled):
        ai_by_uuid[r["uuid"]] = {SHORT[t]: round(float(adjusted[t][k]), 2) for t in TRAITS}

    out = []
    for r in people:
        p = {
            "id": r["uuid"],
            "sex": r["sex"],
            "age": int(r["age"]),
            "ageband": r["ageband"],
            "state": r["state"],
            "zone": r["zone"],
            "tier": r["tier_draft"],
            "incomeLevel": int(r["income_level"]),
            "weight": round(float(r["population_weight"]), 5),
        }
        lab = labels.get(r["uuid"])
        if lab:
            p["ai"] = ai_by_uuid[r["uuid"]]
            p["interests"] = list(lab.get("interests") or [])
            if lab.get("meta_likelihood") in ("high", "medium", "low"):
                p["meta"] = lab["meta_likelihood"]
        out.append(p)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    size_mb = os.path.getsize(OUT) / 1e6
    print(f"\nWrote {OUT}: {len(out)} people, {size_mb:.1f} MB (target under 12 MB).")
    if size_mb > 12:
        sys.exit("File is bigger than the 12 MB target.")


if __name__ == "__main__":
    main()
