// Loads the people bank once per server process, and finds hook constants once.

import raw from "../data/bank.json";
import { bankFromRaw } from "./engine/bank.ts";
import type { RawBankPerson } from "./engine/bank.ts";
import { HOOK_TARGET } from "./engine/constants.ts";
import { calibrateOnReference } from "./engine/engine.ts";
import type { Person } from "./engine/types.ts";
import type { Placement } from "./rehearse.ts";

let bank: Person[] | null = null;
let base0ByPlacement: Record<Placement, number | null> = { reels: null, feed: null };

export function getBank(): Person[] {
  if (!bank) bank = bankFromRaw(raw as unknown as RawBankPerson[]);
  return bank;
}

/** The calibrated hook constant for the given placement. Computed once per placement. */
export function getBase0(placement: Placement = "feed"): number {
  if (base0ByPlacement[placement] === null) {
    const target = HOOK_TARGET[placement];
    base0ByPlacement[placement] = calibrateOnReference(getBank(), target);
  }
  return base0ByPlacement[placement]!;
}
