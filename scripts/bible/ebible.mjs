/**
 * What the Bible build scripts share: fetching one of eBible.org's verse-per-line
 * editions and reading its verses, without a dependency for either.
 */

import { inflateRawSync } from "node:zlib";

/** One named entry out of a zip, read straight from the central directory. */
export function unzipEntry(buf, name) {
  // The end-of-central-directory record sits in the last 64 KiB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (entry === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`unsupported zip method ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} not in the archive`);
}

/**
 * An eBible edition's verses as verses[BOOK][chapter - 1][verse - 1], from its
 * `<id>_vpl.zip`. The XML inside uses the standard SIL/UBS book codes, which
 * are also what orthocal and this app's verse lists use.
 */
export async function fetchEdition(id) {
  const url = `https://ebible.org/Scriptures/${id}_vpl.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  const xml = unzipEntry(zip, `${id}_vpl.xml`).toString("utf8");

  const verses = {};
  let total = 0;
  for (const m of xml.matchAll(/<v b="([0-9A-Z]{3})" c="(\d+)" v="(\d+)">([^<]*)<\/v>/g)) {
    const [, b, c, v, text] = m;
    const chapters = (verses[b] ??= []);
    const chapter = (chapters[Number(c) - 1] ??= []);
    chapter[Number(v) - 1] = text.trim();
    total++;
  }
  return { url, verses, total };
}
