const OPENS_TTL = 60 * 60 * 24 * 100; // 100 days

export async function bumpPlayersAll(kv) {
  try {
    const cur = Number((await kv.get("stats/players-all")) || "0");
    await kv.put("stats/players-all", String(cur + 1));
  } catch { /* best-effort */ }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function writeOpen(kv) {
  const rand = crypto.randomUUID();
  await kv.put(`stats/opens/${today()}/${rand}`, "1", { expirationTtl: OPENS_TTL });
}

export async function sumOpens(kv, dateStr) {
  let count = 0, cursor;
  do {
    const page = await kv.list({ prefix: `stats/opens/${dateStr}/`, cursor });
    count += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}
