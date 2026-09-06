/**
 * Makes an existing account an admin.
 *
 *   npm run grant:admin -- you@example.com
 *   npm run grant:admin -- you@example.com --revoke
 *
 * This is the only way in, and that is the point. `app_admins` has RLS on with
 * no insert policy at all, so nothing reachable from the browser can create a
 * row in it under any policy mistake — only the secret key, which lives in
 * .env.local and never ships to a client.
 *
 * The account has to exist first: sign up in the app, then run this.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  try {
    for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no such file — the variables may already be in the environment */
  }
}

loadEnv(".env.local");

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();

if (!email) {
  console.error(
    "Usage: npm run grant:admin -- you@example.com [--revoke]\n\n" +
      "The account must already exist — sign up in the app first.",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local.\n" +
      "The secret key is under Dashboard -> Project Settings -> API Keys.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* There is no "get user by email" in the admin API, so the user list is paged
   through. Fine for a project of this size, and this runs by hand. */
async function findUser(wanted) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const user = await findUser(email);

if (!user) {
  console.error(`No account for ${email}. Sign up in the app first.`);
  process.exit(1);
}

if (revoke) {
  const { error } = await supabase
    .from("app_admins")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    console.error(`Could not revoke: ${error.message}`);
    process.exit(1);
  }
  console.log(`Revoked admin from ${email}.`);
  process.exit(0);
}

const { error } = await supabase
  .from("app_admins")
  .upsert({ user_id: user.id, note: email }, { onConflict: "user_id" });

if (error) {
  console.error(`Could not grant: ${error.message}`);
  process.exit(1);
}

console.log(
  `${email} is now an admin.\n` +
    "Sign out and back in on the device, or reload, for the tab to appear.",
);
