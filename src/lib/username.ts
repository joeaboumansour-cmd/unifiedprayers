/**
 * Username and phone rules for the signup form.
 *
 * These mirror `username_is_valid()` in supabase/migrations/0002_profiles.sql.
 * The copy here exists to tell someone what is wrong while they type; the
 * database is what actually enforces it. If you change one, change both --
 * and if they ever disagree, the database wins and the form is the bug.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

const SHAPE = /^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$/;
const DOUBLE_UNDERSCORE = /__/;

/** Names that imply the app is speaking, or that collide with a route. */
const RESERVED = new Set([
  "admin", "administrator", "root", "support", "help", "system", "staff",
  "official", "moderator", "mod", "api", "auth", "login", "signup",
  "signin", "logout", "settings", "account", "profile", "password",
  "reset", "about", "me", "you", "null", "undefined", "anonymous",
  "unifiedprayers", "prayers", "rosary",
]);

export type Check = { ok: true } | { ok: false; reason: string };

/** Lowercase and trim, the form the database stores. */
export const normaliseUsername = (raw: string): string =>
  raw.trim().toLowerCase();

/**
 * Reasons are written to be shown to the person typing. They describe the rule
 * that was broken, never whether anyone already holds the name -- that answer
 * comes from usernameAvailable(), after the shape is known to be valid.
 */
export function checkUsername(raw: string, lang: "ar" | "en"): Check {
  const u = normaliseUsername(raw);
  const ar = lang === "ar";

  if (u.length === 0) {
    return { ok: false, reason: ar ? "اختر اسم مستخدم." : "Choose a username." };
  }
  if (u.length < USERNAME_MIN) {
    return {
      ok: false,
      reason: ar
        ? `على الأقل ${USERNAME_MIN} أحرف.`
        : `At least ${USERNAME_MIN} characters.`,
    };
  }
  if (u.length > USERNAME_MAX) {
    return {
      ok: false,
      reason: ar
        ? `${USERNAME_MAX} حرفًا على الأكثر.`
        : `At most ${USERNAME_MAX} characters.`,
    };
  }
  if (DOUBLE_UNDERSCORE.test(u)) {
    return {
      ok: false,
      reason: ar
        ? "لا يمكن استخدام شرطتين سفليتين متتاليتين."
        : "No two underscores in a row.",
    };
  }
  if (!SHAPE.test(u)) {
    return {
      ok: false,
      reason: ar
        ? "أحرف إنجليزية وأرقام وشرطة سفلية فقط، ويبدأ وينتهي بحرف أو رقم."
        : "Letters, numbers and underscores only, starting and ending with a letter or number.",
    };
  }
  if (RESERVED.has(u)) {
    return { ok: false, reason: ar ? "هذا الاسم محجوز." : "That name is reserved." };
  }
  return { ok: true };
}

/* --------------------------------- phone --------------------------------- */

/**
 * Strips spaces, dashes and brackets, and turns a leading 00 into +. Anything
 * else is left alone so the check below can reject it and say why.
 */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s()\-.]/g, "");
  return trimmed.startsWith("00") ? "+" + trimmed.slice(2) : trimmed;
}

const E164 = /^\+[1-9][0-9]{7,14}$/;

/** Optional everywhere: an empty value is valid and stored as null. */
export function checkPhone(raw: string, lang: "ar" | "en"): Check {
  const p = normalisePhone(raw);
  if (p === "") return { ok: true };
  if (!E164.test(p)) {
    return {
      ok: false,
      reason:
        lang === "ar"
          ? "أدخل الرقم بصيغة دولية، مثل ‎+9613123456‎."
          : "Use the international format, e.g. +9613123456.",
    };
  }
  return { ok: true };
}

/* -------------------------------- password ------------------------------- */

/**
 * The floor, not the advice. Supabase enforces its own minimum and (when the
 * project has it switched on) rejects passwords found in breach corpora, which
 * is worth far more than any composition rule -- so the only hard rule here is
 * length, and the rest of the guidance is a strength hint the form shows
 * without blocking on it.
 */
export const PASSWORD_MIN = 10;

export function checkPassword(pw: string, lang: "ar" | "en"): Check {
  const ar = lang === "ar";
  if (pw.length < PASSWORD_MIN) {
    return {
      ok: false,
      reason: ar
        ? `كلمة السر ${PASSWORD_MIN} أحرف على الأقل.`
        : `Passwords are at least ${PASSWORD_MIN} characters.`,
    };
  }
  if (pw.length > 72) {
    // bcrypt truncates past 72 bytes; better to refuse than to silently ignore
    // the tail of someone's passphrase.
    return {
      ok: false,
      reason: ar ? "كلمة السر طويلة جدًا." : "That password is too long.",
    };
  }
  return { ok: true };
}

/** 0-3, for the strength bar. Deliberately crude: length is what matters. */
export function passwordStrength(pw: string): number {
  if (pw.length < PASSWORD_MIN) return 0;
  let score = 1;
  if (pw.length >= 14) score++;
  if (pw.length >= 20 || /[^a-zA-Z0-9]/.test(pw)) score++;
  return Math.min(score, 3);
}
