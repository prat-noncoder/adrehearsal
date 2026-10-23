import { getBank } from "../../../lib/bankData.ts";
import { selectPanel } from "../../../lib/engine/panel.ts";
import type { AudienceFilter } from "../../../lib/engine/panel.ts";
import * as C from "../../../lib/engine/constants.ts";
import { ageBandsForRange, sexForGenders } from "../../../lib/audienceInput.ts";

// Reports the full bank size and how many filter-matches are left out for low Instagram/Facebook use.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incomeKey = body.incomeGroup as "lower" | "middle" | "upper" | undefined;
    const filter: AudienceFilter = {};
    if (typeof body.ageMin === "number" && typeof body.ageMax === "number") {
      const bands = ageBandsForRange(body.ageMin, body.ageMax);
      if (bands.length) filter.ageBands = bands;
    }
    if (Array.isArray(body.genders)) {
      const sex = sexForGenders(body.genders);
      if (sex) filter.sex = sex;
    }
    if (Array.isArray(body.states) && body.states.length) filter.states = body.states;
    if (body.tier?.length) filter.tiers = body.tier;
    if (incomeKey) filter.incomeLevels = C.INCOME_GROUPS[incomeKey];
    const bank = getBank();
    const kept = selectPanel(bank, filter, { size: 999999, seed: 1, excludeLowMeta: true }).matched;
    const all = selectPanel(bank, filter, { size: 999999, seed: 1, excludeLowMeta: false }).matched;
    return Response.json({ total: bank.length, matched: kept, excluded: all - kept });
  } catch {
    return Response.json({ total: 0, matched: 0, excluded: 0 }, { status: 500 });
  }
}
