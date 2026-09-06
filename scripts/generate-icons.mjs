/**
 * Every PWA icon, favicon and iOS launch image, built from one source file.
 *
 *   npm run icons
 *
 * The source is design/logo.jpg — tracked, unlike design-src/, which is the
 * gitignored Claude Design bundle. Replace that file and re-run this, and the
 * whole set follows — which is the point: an icon set assembled by hand drifts,
 * and nobody remembers six months later which of the eighteen splash screens
 * was regenerated and which was not.
 *
 * Two crops come out of the one image:
 *
 *   full   the logo as drawn, wordmark and all. Used wherever the icon is
 *          shown at a size where the wordmark is legible, and for the launch
 *          images, which are the largest the artwork is ever shown.
 *   mark   the dove alone, found by its own outline rather than by numbers
 *          typed in here. Used wherever the frame would betray the wordmark:
 *          a maskable icon, whose corners are cut to a circle, and a favicon,
 *          where the whole logo is sixteen pixels across.
 *
 * The background is read from the source's own corner, so a new logo on a
 * different ground needs no edit here.
 */

import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "design", "logo.jpg");
const ICONS = path.join(root, "public", "icons");
const SPLASH = path.join(ICONS, "splash");

/** [css width, css height, device pixel ratio] — must match AppleSplash.tsx. */
const DEVICES = [
  [320, 568, 2],
  [375, 667, 2],
  [414, 736, 3],
  [375, 812, 3],
  [414, 896, 2],
  [414, 896, 3],
  [390, 844, 3],
  [428, 926, 3],
  [393, 852, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [834, 1112, 2],
  [834, 1194, 2],
  [1024, 1366, 2],
];

/**
 * A maskable icon may be cropped to a circle of 80% of its width, so anything
 * that must survive has to fit the square inscribed in that circle — 0.8/√2,
 * about 57%. 56% leaves a hair of margin for a launcher that rounds differently.
 */
const MASKABLE_MARK = 0.56;
/** How much of a launch image's short side the logo takes. */
const SPLASH_LOGO = 0.62;
/** The badge is a mask: only its alpha survives, so it needs room to breathe. */
const BADGE_MARK = 0.82;

/* ------------------------------------------------------------------ source */

/**
 * The flat colour the artwork sits on, taken from its own top-left pixel.
 * Returned as a plain sharp colour plus the hex separately: sharp rejects a
 * colour object carrying any key it does not recognise.
 */
async function backgroundOf(file) {
  const { data } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = [data[0], data[1], data[2]];
  return {
    color: { r, g, b, alpha: 1 },
    hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
  };
}

/**
 * The bounding box of the bright subject — the dove — squared off around its
 * own centre so the crop can be resized without distorting it.
 *
 * Found by luminance rather than by a hard-coded rectangle: the dove is the
 * only near-white thing in the frame, and a threshold that high leaves the
 * gold rays and the maroon ground behind. A logo swapped for another one with
 * a light subject on a dark ground therefore needs no measuring by hand.
 */
async function markBox(file, pad = 0.1) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      // Rec. 601 luma, which is close enough for "is this the white bird".
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 205) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error("no subject found in the source image");

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const side = Math.max(maxX - minX, maxY - minY) * (1 + pad * 2);
  // Clamped to the frame, so a subject near an edge crops short rather than
  // pulling in whatever sharp would pad with.
  const half = Math.min(side / 2, cx, cy, width - cx, height - cy);

  return {
    left: Math.round(cx - half),
    top: Math.round(cy - half),
    width: Math.round(half * 2),
    height: Math.round(half * 2),
    found: { minX, minY, maxX, maxY },
  };
}

/* ------------------------------------------------------------------ output */

/**
 * The artwork is flat vector shading, which quantises to a palette without any
 * visible banding and comes out about a third of the size. That matters here:
 * eighteen launch images at full colour is fourteen megabytes of an app whose
 * whole point is opening on a bad connection.
 */
const PNG = { palette: true, quality: 92, effort: 10, compressionLevel: 9 };

async function write(file, buffer) {
  await writeFile(file, buffer);
  return `${path.relative(root, file).replace(/\\/g, "/")}  ${(buffer.length / 1024).toFixed(1)} kB`;
}

/** The logo as drawn, square, at one size. */
const full = (source, size) =>
  sharp(source).resize(size, size, { fit: "cover" }).png(PNG).toBuffer();

/** The dove on the flat ground, sized as a fraction of the canvas. */
async function markOn(source, box, size, fraction, bg) {
  const inner = Math.round(size * fraction);
  const mark = await sharp(source)
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(inner, inner, { fit: "contain", background: bg })
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png(PNG)
    .toBuffer();
}

/**
 * The Android notification badge: a silhouette, drawn white on nothing.
 *
 * Android throws away every colour in this image and keeps only the alpha,
 * stamping the result into the status bar in its own tint. Handing it a normal
 * icon — which is what this app did until now — gets a solid white blob,
 * because a photograph is opaque everywhere. So the subject is cut out of the
 * ground by the same luminance that found it above, and everything else is
 * made transparent.
 */
async function badge(source, box, size) {
  const { data, info } = await sharp(source)
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(Math.round(size * BADGE_MARK), Math.round(size * BADGE_MARK), { fit: "contain" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * channels;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // A soft edge rather than a hard cut: the ramp between the dove and the
    // ground becomes partial alpha, which is what keeps the outline from
    // looking chewed at 24 device-independent pixels.
    const alpha = Math.max(0, Math.min(255, Math.round((lum - 150) * (255 / 80))));
    out[p * 4] = 255;
    out[p * 4 + 1] = 255;
    out[p * 4 + 2] = 255;
    out[p * 4 + 3] = alpha;
  }

  const silhouette = await sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: silhouette, gravity: "centre" }])
    // Not palettised: this file is nothing but a soft alpha ramp, and that is
    // the one thing quantising would coarsen.
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** A launch image: the logo centred on the flat ground, at device pixels. */
async function splash(source, w, h, dpr, bg) {
  const width = w * dpr;
  const height = h * dpr;
  const logo = Math.round(Math.min(width, height) * SPLASH_LOGO);

  const art = await sharp(source).resize(logo, logo, { fit: "cover" }).toBuffer();

  return sharp({ create: { width, height, channels: 4, background: bg } })
    .composite([{ input: art, gravity: "centre" }])
    .png(PNG)
    .toBuffer();
}

/**
 * A .ico wrapping PNGs — the format has allowed that since Vista, and it is the
 * only reason this can be assembled without an encoder. Header, then one
 * directory entry per image, then the images themselves.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, buffer } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buffer.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.buffer)]);
}

/* -------------------------------------------------------------------- main */

async function main() {
  await mkdir(SPLASH, { recursive: true });

  const { color: bg, hex: bgHex } = await backgroundOf(SOURCE);
  const box = await markBox(SOURCE);
  const meta = await sharp(SOURCE).metadata();

  console.log(`source     ${path.relative(root, SOURCE)}  ${meta.width}x${meta.height}`);
  console.log(`background ${bgHex}`);
  console.log(`mark       ${box.width}x${box.height} at ${box.left},${box.top}`);
  if (meta.width < 1024) {
    console.log(
      `\n  note: the source is ${meta.width}px wide. The 512px icons and the\n` +
      `  larger launch images are upscaled from it and will look soft. Drop a\n` +
      `  bigger original in as design/logo.jpg and re-run to fix that.\n`,
    );
  }

  const written = [];

  // The logo as drawn, for every size where the wordmark still reads.
  for (const size of [192, 256, 384, 512]) {
    written.push(await write(path.join(ICONS, `icon-${size}.png`), await full(SOURCE, size)));
  }
  written.push(await write(path.join(ICONS, "apple-touch-icon.png"), await full(SOURCE, 180)));

  // Maskable: the dove only, inside the circle a launcher may crop to.
  for (const size of [192, 512]) {
    written.push(
      await write(
        path.join(ICONS, `icon-maskable-${size}.png`),
        await markOn(SOURCE, box, size, MASKABLE_MARK, bg),
      ),
    );
  }

  // Favicons: far too small for the wordmark, so the dove fills the frame.
  const favicons = {};
  for (const size of [16, 32, 48]) {
    favicons[size] = await markOn(SOURCE, box, size, 1, bg);
  }
  written.push(await write(path.join(ICONS, "favicon-16.png"), favicons[16]));
  written.push(await write(path.join(ICONS, "favicon-32.png"), favicons[32]));
  written.push(
    await write(
      path.join(root, "public", "favicon.ico"),
      ico([16, 32, 48].map((size) => ({ size, buffer: favicons[size] }))),
    ),
  );

  written.push(await write(path.join(ICONS, "badge-96.png"), await badge(SOURCE, box, 96)));

  for (const [w, h, dpr] of DEVICES) {
    written.push(
      await write(
        path.join(SPLASH, `splash-${w}x${h}@${dpr}x.png`),
        await splash(SOURCE, w, h, dpr, bg),
      ),
    );
  }

  console.log(`\n${written.length} files\n${written.map((l) => `  ${l}`).join("\n")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
