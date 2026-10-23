// Turns the compact bank.json rows (built by scripts/build_bank_json.py) into engine people.

import type { AiScores, Person } from "./types.ts";

export interface RawBankPerson {
  id: string;
  sex: string;
  age: number;
  ageband: string;
  state: string;
  zone: string;
  tier: string;
  incomeLevel: number;
  weight: number;
  ai?: AiScores;
  interests?: string[];
  meta?: "high" | "medium" | "low";
}

/** The row number becomes the person's stable index, which keeps their random draws the same. */
export function bankFromRaw(raw: RawBankPerson[]): Person[] {
  return raw.map((r, index) => ({ ...r, index }));
}
