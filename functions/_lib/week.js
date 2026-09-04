// Sunday (YYYY-MM-DD) of the week containing dateStr. Pure string/UTC math so
// the runner's timezone is irrelevant. Mirrors public/app.js sundayOf().
export function weekKeyOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  const sun = new Date(ms - dow * 86400000);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${sun.getUTCFullYear()}-${p2(sun.getUTCMonth() + 1)}-${p2(sun.getUTCDate())}`;
}
