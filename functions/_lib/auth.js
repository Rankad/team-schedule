import { HttpError } from "./http.js";
import { verifyManagerToken } from "./token.js";

export async function requireManager(request, env) {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer (.+)$/.exec(h);
  if (!m || !(await verifyManagerToken(env, m[1]))) {
    throw new HttpError(401, "unauthorized");
  }
}
