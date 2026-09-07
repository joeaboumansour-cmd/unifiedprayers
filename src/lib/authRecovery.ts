/**
 * A one-tab marker saying "the person holding this tab just proved they own
 * the mailbox".
 *
 * Verifying a recovery link signs you in for real, so by the time
 * /reset-password renders there is nothing left in the session to distinguish
 * "arrived from a reset email" from "was already signed in on this phone".
 * Without that distinction /reset-password would be a way to change the
 * password of any unattended signed-in device without knowing the old one --
 * exactly the hole changePassword() in useAuth refuses to leave open.
 *
 * sessionStorage rather than localStorage: the marker should die with the tab,
 * not linger for the next person to open the app.
 */

const KEY = "up:pw-recovery";

/** Long enough to choose a password, short enough to be useless if forgotten. */
const WINDOW_MS = 15 * 60 * 1000;

/* Every access is guarded: Safari in private mode throws on sessionStorage
   rather than returning null, and a thrown reset page is worse than one that
   simply asks for a fresh link. */

export function markRecovery(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* Storage denied. recoveryIsLive() will say no and the page will ask for a
       new link, which is wrong but safe, and the only failure mode available. */
  }
}

export function recoveryIsLive(): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY));
    return Boolean(at) && Date.now() - at < WINDOW_MS;
  } catch {
    return false;
  }
}

export function clearRecovery(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Nothing was stored, so nothing needs removing. */
  }
}
