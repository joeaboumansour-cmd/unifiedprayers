/* End-to-end auth check against the local Supabase stack.
   Temporary; deleted after the run. */
import { createClient } from "@supabase/supabase-js";

const API = "http://127.0.0.1:54321";
const MAIL = "http://127.0.0.1:54324";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const pass = (m) => console.log("  PASS  " + m);
const fail = (m) => { console.log("  FAIL  " + m); process.exitCode = 1; };
const ok = (cond, m) => (cond ? pass(m) : fail(m));

function fresh() {
  const mem = new Map();
  return createClient(API, ANON, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      // supabase-js needs somewhere to keep the PKCE verifier; node has no
      // localStorage, so give each client its own, the way a tab has its own.
      storage: {
        getItem: (k) => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => void mem.set(k, v),
        removeItem: (k) => void mem.delete(k),
      },
    },
  });
}

/** Newest message for an address, from the local mail catcher. */
async function latestMail(to) {
  const list = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json();
  const msgs = list.messages || [];
  if (!msgs.length) return null;
  const id = msgs[0].ID;
  const full = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json();
  return (full.Text || "") + "\n" + (full.HTML || "");
}

const linkFrom = (body, kind) => {
  const re = new RegExp(`http://[^\\s"'<>]*${kind}[^\\s"'<>]*`, "g");
  const all = body.match(re) || [];
  return all[0]?.replace(/&amp;/g, "&") ?? null;
};

const EMAIL = `joe${Date.now()}@example.com`;
const USERNAME = `joe_${Date.now().toString().slice(-6)}`;
const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "a different long passphrase";

console.log("\n=== 1. username availability, before anyone holds it ===");
{
  const s = fresh();
  const { data, error } = await s.rpc("username_available", { u: USERNAME });
  ok(!error && data === true, `${USERNAME} is available`);
  const { data: bad } = await s.rpc("username_available", { u: "admin" });
  ok(bad === false, "reserved name 'admin' reported unavailable");
}

console.log("\n=== 2. sign up ===");
let userId = null;
{
  const s = fresh();
  const { data, error } = await s.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
    options: { data: { username: USERNAME, display_name: "Joe A", phone: "+9613123456" } },
  });
  ok(!error, `signUp accepted${error ? " -- " + error.message : ""}`);
  userId = data?.user?.id ?? null;
  ok(Boolean(userId), "an auth user was created");
  ok(!data?.session, "no session yet: email confirmation is required");
}

console.log("\n=== 3. the username is now taken, and a second signup is refused ===");
{
  const s = fresh();
  const { data } = await s.rpc("username_available", { u: USERNAME });
  ok(data === false, "availability now reports taken");

  const { error } = await s.auth.signUp({
    email: `other${Date.now()}@example.com`,
    password: PASSWORD,
    options: { data: { username: USERNAME.toUpperCase(), display_name: "", phone: "" } },
  });
  ok(Boolean(error), `duplicate username (different case) refused -- ${error?.message ?? "NO ERROR"}`);
}

console.log("\n=== 4. cannot sign in before confirming ===");
{
  const s = fresh();
  const { error } = await s.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  ok(Boolean(error), `refused before confirmation -- ${error?.message}`);
}

console.log("\n=== 5. confirm via the emailed link ===");
{
  const body = await latestMail(EMAIL);
  ok(Boolean(body), "a confirmation email arrived");
  const link = body && linkFrom(body, "confirm");
  ok(Boolean(link), "the email contains a confirmation link");
  if (link) {
    const res = await fetch(link, { redirect: "manual" });
    ok(res.status >= 200 && res.status < 400, `confirmation link accepted (${res.status})`);
  }
}

console.log("\n=== 6. sign in ===");
let session = null;
{
  const s = fresh();
  const { data, error } = await s.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  ok(!error, `signed in${error ? " -- " + error.message : ""}`);
  session = data?.session ?? null;
  ok(Boolean(session), "a session was issued");
}

console.log("\n=== 7. enumeration: wrong password and unknown address look identical ===");
{
  const s = fresh();
  const wrong = await s.auth.signInWithPassword({ email: EMAIL, password: "not the password" });
  const unknown = await s.auth.signInWithPassword({
    email: `nobody${Date.now()}@example.com`, password: "not the password",
  });
  console.log(`     wrong password : ${wrong.error?.status} ${wrong.error?.code} "${wrong.error?.message}"`);
  console.log(`     unknown address: ${unknown.error?.status} ${unknown.error?.code} "${unknown.error?.message}"`);
  ok(
    wrong.error?.message === unknown.error?.message && wrong.error?.status === unknown.error?.status,
    "the two responses are indistinguishable",
  );
}

console.log("\n=== 8. the signed-in user's own rows ===");
{
  const s = createClient(API, ANON);
  await s.auth.setSession(session);

  const { data: prof, error: e1 } = await s.from("profiles").select("*").eq("id", userId).maybeSingle();
  ok(!e1 && prof?.username === USERNAME.toLowerCase(), `profile row exists, username=${prof?.username}`);
  ok(prof?.display_name === "Joe A", "display_name stored");

  const { data: priv } = await s.from("user_private").select("*");
  ok(priv?.length === 1 && priv[0].phone === "+9613123456", "own private row readable, phone stored");

  const { error: e3 } = await s.from("user_prefs").upsert({
    user_id: userId, lang: "en", bead_style: "ring", palette: "sage",
    size: 1, dim: false, haptics: true, audio: false, awake: true,
  });
  ok(!e3, `can write own prefs${e3 ? " -- " + e3.message : ""}`);

  const { error: e4 } = await s.from("user_prefs").upsert({
    user_id: "00000000-0000-0000-0000-000000000000", lang: "en", bead_style: "arc",
    palette: "midnight", size: 1, dim: false, haptics: true, audio: false, awake: true,
  });
  ok(Boolean(e4), `cannot write another account's prefs -- ${e4?.code}`);
}

console.log("\n=== 9. anonymous readers see nothing ===");
{
  const s = fresh();
  const { data: p } = await s.from("profiles").select("*");
  ok((p?.length ?? 0) === 0, "anon reads 0 profiles");
  const { data: pv } = await s.from("user_private").select("*");
  ok((pv?.length ?? 0) === 0, "anon reads 0 private rows");
}

console.log("\n=== 10. password reset, end to end ===");
{
  const s = fresh();
  const { error } = await s.auth.resetPasswordForEmail(EMAIL, {
    redirectTo: "http://localhost:3000/reset-password",
  });
  ok(!error, "reset requested");

  // Unknown address must not error differently.
  const { error: unknownErr } = await s.auth.resetPasswordForEmail(
    `nobody${Date.now()}@example.com`, { redirectTo: "http://localhost:3000/reset-password" },
  );
  ok(!unknownErr, "reset for an unknown address also reports success");

  await new Promise((r) => setTimeout(r, 1200));
  const body = await latestMail(EMAIL);
  const link = body && linkFrom(body, "recover");
  ok(Boolean(link), "a recovery link arrived");

  if (link) {
    const res = await fetch(link, { redirect: "manual" });
    const loc = res.headers.get("location") || "";
    ok(loc.includes("code=") || loc.includes("access_token"), "recovery link yields a session grant");

    const code = new URL(loc).searchParams.get("code");
    ok(Boolean(code), "the grant is a PKCE code, as the app's client expects");
    if (code) {
      // Same client that asked for the reset: it holds the PKCE verifier.
      const { error: exErr } = await s.auth.exchangeCodeForSession(code);
      ok(!exErr, `recovery code exchanged${exErr ? " -- " + exErr.message : ""}`);

      const { error: upErr } = await s.auth.updateUser({ password: NEW_PASSWORD });
      ok(!upErr, `password updated${upErr ? " -- " + upErr.message : ""}`);

      const s3 = fresh();
      const { error: oldErr } = await s3.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      ok(Boolean(oldErr), "the old password no longer works");

      const s4 = fresh();
      const { data: d4, error: newErr } = await s4.auth.signInWithPassword({
        email: EMAIL, password: NEW_PASSWORD,
      });
      ok(!newErr && Boolean(d4?.session), "the new password works");
    }
  }
}

console.log("\n=== 11. short passwords are refused by the project policy ===");
{
  const s = fresh();
  const { error } = await s.auth.signUp({
    email: `short${Date.now()}@example.com`,
    password: "short",
    options: { data: { username: `s_${Date.now().toString().slice(-6)}`, display_name: "", phone: "" } },
  });
  ok(Boolean(error), `10-char minimum enforced server-side -- ${error?.message}`);
}

console.log(process.exitCode ? "\nSOME CHECKS FAILED\n" : "\nALL CHECKS PASSED\n");
