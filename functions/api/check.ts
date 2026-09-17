/**
 * POST /api/check — validate one document. Stateless: the body is checked and
 * answered, never logged, never stored, never cached (`Cache-Control: no-store`).
 *
 *   curl -X POST "https://<host>/api/check?kind=playbook" --data-binary @book.playbook
 *   curl -X POST "https://<host>/api/check" -H "content-type: application/json" \
 *        -d '{"kind":"brief","text":"title: t\nsections: []"}'
 *
 * The answer is the same `CheckResult` the page computes in the browser:
 * `{ ok, kind, version?, summary?, problems: [{message, line?, column?}], notes }`.
 * GET lists the kinds; OPTIONS answers CORS so a page anywhere may call it.
 *
 * Deployed by Cloudflare Pages from this folder (`functions/api/check.ts` is
 * the route `/api/check`); `handle` is the whole behaviour, so it is tested
 * without a runtime.
 */
import { KINDS, check } from "../../src/check";

const MAX_BYTES = 1_000_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Kind",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS },
  });

const refuse = (kind: string, message: string, status: number): Response =>
  json({ ok: false, kind, problems: [{ message }], notes: [] }, status);

export async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method === "GET") {
    return json({
      kinds: Object.keys(KINDS),
      post: "the document as the body with ?kind=<kind> (or an X-Kind header), or JSON {kind, text}",
    });
  }
  if (request.method !== "POST") return refuse("", "POST the document; GET lists the kinds", 405);

  const url = new URL(request.url);
  let kind = url.searchParams.get("kind") ?? request.headers.get("x-kind") ?? "";
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return refuse(kind, `the document is larger than ${MAX_BYTES} bytes`, 413);

  let text: string;
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    let body: { kind?: unknown; text?: unknown };
    try { body = (await request.json()) as typeof body; }
    catch { return refuse(kind, "the JSON body could not be read — send {kind, text}", 400); }
    if (typeof body.kind === "string") kind = body.kind;
    text = typeof body.text === "string" ? body.text : "";
  } else {
    text = await request.text();
  }
  if (text.length > MAX_BYTES) return refuse(kind, `the document is larger than ${MAX_BYTES} bytes`, 413);
  if (!kind) return refuse("", "say which kind: ?kind=playbook, an X-Kind header, or {kind, text} as JSON", 400);

  const result = check(kind, text);
  return json(result, result.kind in KINDS ? 200 : 400);
}

/** The Cloudflare Pages Functions entry point for every method on this route. */
export const onRequest = ({ request }: { request: Request }): Promise<Response> => handle(request);
