import { getBank } from "../../../lib/bankData.ts";
import { selectPanel } from "../../../lib/engine/panel.ts";
import type { AudienceFilter } from "../../../lib/engine/panel.ts";
import * as C from "../../../lib/engine/constants.ts";
import { ageBandsForRange, sexForGenders } from "../../../lib/audienceInput.ts";

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
    const result = selectPanel(getBank(), filter, { size: 999999, seed: 1, excludeLowMeta: true });
    return Response.json({ matched: result.matched });
  } catch {
    return Response.json({ matched: 0 }, { status: 500 });
  }
}
