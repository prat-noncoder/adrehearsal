// Loads the people bank once per server process, and finds the hook constant once.

import raw from "../data/bank.json";
import { bankFromRaw } from "./engine/bank.ts";
import type { RawBankPerson } from "./engine/bank.ts";
import { HOOK_TARGET } from "./engine/constants.ts";
import { calibrateOnReference } from "./engine/engine.ts";
import type { Person } from "./engine/types.ts";

let bank: Person[] | null = null;
let base0: number | null = null;

export function getBank(): Person[] {
  if (!bank) bank = bankFromRaw(raw as unknown as RawBankPerson[]);
  return bank;
}

/** The calibrated hook constant (Reels target). Same every time, so it is computed once. */
export function getBase0(): number {
  if (base0 === null) base0 = calibrateOnReference(getBank(), HOOK_TARGET.reels);
  return base0;
}
