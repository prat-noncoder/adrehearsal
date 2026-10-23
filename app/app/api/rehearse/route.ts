import { AiError } from "../../../lib/ai/openrouter.ts";
import { getBank, getBase0 } from "../../../lib/bankData.ts";
import { parseRequest, rehearse, RequestError } from "../../../lib/rehearse.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

// A normal Vercel function request is capped at 4.5 MB. Stay a little under it.
const MAX_BYTES = 4.4 * 1024 * 1024;

function fail(status: number, kind: string, message: string) {
  return Response.json({ error: { kind, message } }, { status });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return fail(413, "too_large", "This upload is too large. Please use a shorter video or a smaller picture.");
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail(400, "bad_request", "The upload could not be read.");
  }
  if (text.length > MAX_BYTES) {
    return fail(413, "too_large", "This upload is too large. Please use a shorter video or a smaller picture.");
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "bad_request", "The request was not understood.");
  }

  try {
    const req = parseRequest(body);
    const result = await rehearse(req, { bank: getBank(), base0: getBase0() });
    return Response.json(result);
  } catch (e) {
    if (e instanceof RequestError) return fail(400, "bad_request", e.message);
    if (e instanceof AiError) {
      const status = e.kind === "out_of_credits" ? 503 : 502;
      return fail(status, e.kind, e.message);
    }
    return fail(500, "internal", "Something went wrong on our side. Please try again.");
  }
}
