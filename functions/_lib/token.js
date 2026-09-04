const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s) => b64url(new TextEncoder().encode(s));
const fromB64url = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

export function mintPlayerToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

export async function mintManagerToken(env, ttlMs = 6 * 3600e3) {
  const exp = Date.now() + ttlMs;
  const payload = b64urlStr(JSON.stringify({ exp }));
  const key = await hmacKey(env.MANAGER_PASSPHRASE);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return { token: `${payload}.${b64url(sig)}`, exp };
}

export async function verifyManagerToken(env, token) {
  if (typeof token !== "string" || token.indexOf(".") === -1) return false;
  const [payload, sig] = token.split(".");
  let exp;
  try { exp = JSON.parse(new TextDecoder().decode(fromB64url(payload))).exp; }
  catch { return false; }
  if (!(typeof exp === "number" && exp > Date.now())) return false;
  const key = await hmacKey(env.MANAGER_PASSPHRASE);
  try {
    return await crypto.subtle.verify(
      "HMAC", key, fromB64url(sig), new TextEncoder().encode(payload)
    );
  } catch { return false; }
}
