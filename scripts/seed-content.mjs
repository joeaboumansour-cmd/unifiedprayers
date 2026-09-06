/**
 * Seeds content_documents from the JSON that ships in the bundle.
 *
 *   node scripts/seed-content.mjs
 *
 * Writes to content_documents are granted to nobody in the migration, so this
 * needs a key that bypasses RLS. Put it in .env.local, which is gitignored, and
 * keep it out of anything that reaches the browser:
 *
 *   SUPABASE_SECRET_KEY=sb_secret_...
 *
 * This project has legacy keys disabled, so that is a secret API key from
 * Dashboard -> Project Settings -> API Keys -> Secret keys.
 * SUPABASE_SERVICE_ROLE_KEY is read as a fallback for projects that kept the
 * legacy JWTs.
 *
 * Run it once after applying the migration. Re-running is safe: each key is
 * upserted, so this restores the bundled text over any edit made since.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env reader — this is the only script that needs one. */
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.\n\n" +
      "Both live in .env.local. The secret key is under\n" +
      "Dashboard -> Project Settings -> API Keys -> Secret keys (sb_secret_...).\n" +
      "It bypasses every RLS policy, so never commit it or ship it to a client.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const documents = [
  { key: "design", file: "src/data/design.json" },
  { key: "prayers", file: "src/data/prayers.json" },
  { key: "teachings", file: "src/data/teachings.json" },
];

let failed = false;

for (const { key: docKey, file } of documents) {
  const doc = JSON.parse(readFileSync(join(root, file), "utf8"));
  const { error } = await supabase
    .from("content_documents")
    .upsert({ key: docKey, doc, version: 1 }, { onConflict: "key" });

  if (error) {
    failed = true;
    console.error(`  ${docKey.padEnd(9)} failed: ${error.message}`);
  } else {
    const bytes = JSON.stringify(doc).length;
    console.log(`  ${docKey.padEnd(9)} seeded from ${file} (${bytes} bytes)`);
  }
}

process.exit(failed ? 1 : 0);
