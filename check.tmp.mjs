import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
console.log("project:", url);

const svc = createClient(url, key, { auth: { persistSession: false } });

// Which of the new tables exist yet?
for (const t of ["app_admins", "verses", "announcements", "app_settings",
                 "push_subscriptions", "notifications", "content_documents"]) {
  const { error, count } = await svc.from(t).select("*", { count: "exact", head: true });
  console.log(`  ${t.padEnd(20)} ${error ? "MISSING (" + error.code + ")" : "ok, " + count + " rows"}`);
}

// Does the account exist?
const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) { console.log("listUsers failed:", error.message); process.exit(1); }
console.log(`\naccounts: ${data.users.length}`);
for (const u of data.users) {
  console.log(`  ${u.email}  confirmed=${Boolean(u.email_confirmed_at)}  id=${u.id}`);
}
