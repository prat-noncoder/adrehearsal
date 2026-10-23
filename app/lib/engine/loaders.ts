// Simple loaders for the CSV files, used by the tests and the demo script (Node only).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bankFromRaw } from "./bank.ts";
import type { RawBankPerson } from "./bank.ts";
import type { Archetype } from "./labels.ts";
import type { Person } from "./types.ts";

// Paths are relative to the app/ folder, where tests and the demo are run from.
export const DEFAULT_BANK_PATH = resolve(process.cwd(), "../data/bank_v2.csv");
export const DEFAULT_ARCHETYPES_PATH = resolve(process.cwd(), "../data/archetype_traits.csv");

/** Reads CSV text into rows of cells. Handles quoted cells that contain commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toObjects(path: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(readFileSync(path, "utf8"));
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
}

export function loadBank(path: string = DEFAULT_BANK_PATH): Person[] {
  return toObjects(path).map((r, index) => ({
    index,
    id: r.uuid,
    sex: r.sex,
    age: Number(r.age),
    ageband: r.ageband,
    state: r.state,
    zone: r.zone,
    tier: r.tier_draft,
    incomeLevel: Number(r.income_level),
    weight: Number(r.population_weight),
  }));
}

export const DEFAULT_BANK_JSON_PATH = resolve(process.cwd(), "data/bank.json");

/** The bank the website uses: includes AI scores, interests and the social-media label. */
export function loadBankJson(path: string = DEFAULT_BANK_JSON_PATH): Person[] {
  return bankFromRaw(JSON.parse(readFileSync(path, "utf8")) as RawBankPerson[]);
}

export function loadArchetypes(path: string = DEFAULT_ARCHETYPES_PATH): Archetype[] {
  return toObjects(path).map((r) => ({
    id: r.id,
    name: r.name,
    reportGroup: r.report_group,
    skepticism: Number(r.skepticism),
    priceSensitivity: Number(r.price_sensitivity),
    noveltySeeking: Number(r.novelty_seeking),
    socialInfluence: Number(r.social_influence),
    impulsivity: Number(r.impulsivity),
    attentionBaseline: Number(r.attention_baseline),
  }));
}
