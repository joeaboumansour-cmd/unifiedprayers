/**
 * Generates the VAPID key pair that signs every push this app sends.
 *
 *   npm run vapid
 *
 * Run it once, ever. The public key is baked into the browser bundle and every
 * subscription is bound to it: regenerating the pair invalidates every device
 * that has already subscribed, and they will not resubscribe on their own until
 * the push service gives up on the old key. Keep the output somewhere safe.
 *
 * Nothing is written to disk — the keys are printed for you to paste into
 * .env.local and into the Vercel project's environment variables.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Add these to .env.local, and to Vercel -> Settings -> Environment Variables.

  NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
  VAPID_PRIVATE_KEY=${privateKey}
  VAPID_SUBJECT=mailto:you@example.com

The public key ships in the browser bundle and is meant to. The private key
must never leave the server: anyone holding it can send a notification to every
device that has subscribed to this app.

VAPID_SUBJECT has to be a real mailto: or https: address — push services use it
to reach whoever is sending, and Apple refuses a subscription without it.

You will also want a secret for the cron endpoint, which is what stops anyone
who finds the URL from firing off notifications:

  CRON_SECRET=${crypto.randomUUID()}
`);
