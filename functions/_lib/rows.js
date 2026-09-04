export const reqPrefix = (wk, token) => `week/${wk}/req/${token}/`;
export const reqKey = (wk, token, sessionId) => reqPrefix(wk, token) + sessionId;

export async function putRequest(kv, { wk, token, fullName, teamId, sessionId, direction }) {
  const row = { token, fullName, teamId, sessionId, direction, ts: Date.now(), v: 1 };
  await kv.put(reqKey(wk, token, sessionId), JSON.stringify(row));
}

export async function deleteRequest(kv, wk, token, sessionId) {
  await kv.delete(reqKey(wk, token, sessionId));
}

async function listRows(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const k of page.keys) {
      const v = await kv.get(k.name);
      if (v) { try { out.push(JSON.parse(v)); } catch { /* skip corrupt */ } }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

export function listRequestsForToken(kv, wk, token) {
  return listRows(kv, reqPrefix(wk, token));
}

export async function countRequestsForToken(kv, wk, token) {
  let count = 0, cursor;
  do {
    const page = await kv.list({ prefix: reqPrefix(wk, token), cursor });
    count += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}

export async function deleteAllForToken(kv, wk, token) {
  let n = 0, cursor;
  do {
    const page = await kv.list({ prefix: reqPrefix(wk, token), cursor });
    for (const k of page.keys) { await kv.delete(k.name); n++; }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return n;
}

export function listAllRequestsForWeek(kv, wk) {
  return listRows(kv, `week/${wk}/req/`);
}
