export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

const CORS_METHODS = "GET,PUT,POST,DELETE,OPTIONS";
const CORS_HEADERS = "authorization,content-type";

export function withCors(resp, env) {
  const h = new Headers(resp.headers);
  h.set("access-control-allow-origin", env.SITE_ORIGIN || "");
  h.set("access-control-allow-methods", CORS_METHODS);
  h.set("access-control-allow-headers", CORS_HEADERS);
  h.set("vary", "origin");
  return new Response(resp.body, { status: resp.status, headers: h });
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}

export function preflight(env) {
  return withCors(new Response(null, { status: 204 }), env);
}

export async function readJson(request) {
  const len = Number(request.headers.get("content-length") || "0");
  if (len > 1024) throw new HttpError(400, "bad_body");
  let text;
  try { text = await request.text(); } catch { throw new HttpError(400, "bad_body"); }
  if (text.length > 1024) throw new HttpError(400, "bad_body");
  let obj;
  try { obj = JSON.parse(text); } catch { throw new HttpError(400, "bad_body"); }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new HttpError(400, "bad_body");
  return obj;
}

export function errToResponse(err, env) {
  const status = err instanceof HttpError ? err.status : 500;
  const code = err instanceof HttpError ? err.code : "internal";
  return withCors(json({ error: code }, { status }), env);
}
