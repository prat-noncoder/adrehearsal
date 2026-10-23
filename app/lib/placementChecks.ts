// Plain length checks against Meta placement limits. These are approximate limits, so they are labelled as such on the page.

export const HEADLINE_LIMIT = 40;
export const PRIMARY_TEXT_LIMIT = 125;

export function copyWarnings(headline: string, primaryText: string): string[] {
  const out: string[] = [];
  const h = headline.trim().length;
  const p = primaryText.trim().length;
  if (h > HEADLINE_LIMIT) {
    out.push(`Your headline is ${h} characters. Meta tends to cut headlines off after about ${HEADLINE_LIMIT}, so the end may not show.`);
  }
  if (p > PRIMARY_TEXT_LIMIT) {
    out.push(`Your primary text is ${p} characters. Only about the first ${PRIMARY_TEXT_LIMIT} show before the "more" fold, so the rest may be hidden.`);
  }
  return out;
}
