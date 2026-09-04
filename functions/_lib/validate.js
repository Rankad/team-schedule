export const isSessionId = (s) => typeof s === "string" && /^[A-Za-z0-9_@-]{1,256}$/.test(s);
export const isTeamId = (s) => typeof s === "string" && /^T_\d{1,6}$/.test(s);
export const isDirection = (s) => s === "round" || s === "out" || s === "back";
export const isWeekKey = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isNonEmptyName = (s) => typeof s === "string" && s.trim().length >= 1 && s.trim().length <= 80;
