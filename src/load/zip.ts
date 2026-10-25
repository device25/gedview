// GEDZIP (FamilySearch GEDCOM 7.0 chapter 4): a zip archive with the dataset
// as gedcom.ged and the media files next to it.
//
// The archive is not read into memory. Its directory is read from the end
// of the file; then only the dataset is read and unpacked. A media file
// stored without compression (as photos usually are) becomes a slice of the
// archive itself, which the browser reads from disk when it is shown; a
// compressed one is unpacked. So a 1 GB archive opens as fast as a small one.

import {inflateSync} from 'fflate';
import {guessMime} from '../model/mime';
import {loadError} from './errors';

/** Upper bound for what is unpacked into memory (zip bombs). */
export const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;

export interface OpenedGedzip {
  /** Bytes of the dataset. */
  gedcom: Uint8Array;
  /** Name of the dataset entry inside the archive. */
  gedcomName: string;
  /** Media files by path: as written in the archive and, when the dataset
   *  sits in a folder, also relative to that folder. Each is a slice of the
   *  archive or an unpacked copy. */
  files: Map<string, Blob>;
}

interface Entry {
  name: string;
  method: number;
  encrypted: boolean;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const utf8 = new TextDecoder('utf-8', {fatal: true});
const latin1 = new TextDecoder('latin1');

/** Zip names not flagged as UTF-8 are often UTF-8 all the same. */
function decodeName(bytes: Uint8Array, flaggedUtf8: boolean): string {
  let name: string;
  if (flaggedUtf8) name = new TextDecoder().decode(bytes);
  else {
    try {
      name = utf8.decode(bytes);
    } catch {
      name = latin1.decode(bytes);
    }
  }
  return name.replace(/\\/g, '/');
}

/** Directories, the junk of macOS, and hidden folders (.git, .claude…). */
export const isIgnored = (name: string) =>
  name.endsWith('/') ||
  name.startsWith('__MACOSX/') ||
  name.split('/').some((part) => part.startsWith('.'));

/**
 * The dataset: gedcom.ged at the root, else the only .ged, else the only one
 * at the shallowest level that has any (a tree in a folder of the archive,
 * with backups deeper down).
 */
export function pickDataset(names: string[]): string | undefined {
  const geds = names.filter((n) => n.toLowerCase().endsWith('.ged'));
  const root =
    geds.find((n) => n === 'gedcom.ged') ??
    geds.find((n) => n.toLowerCase() === 'gedcom.ged');
  if (root) return root;
  if (geds.length === 1) return geds[0];
  if (geds.length === 0) return undefined;
  const depth = (n: string) => n.split('/').length;
  const top = Math.min(...geds.map(depth));
  const shallowest = geds.filter((n) => depth(n) === top);
  return shallowest.length === 1 ? shallowest[0] : undefined;
}

async function read(blob: Blob, from: number, length: number) {
  return new Uint8Array(await blob.slice(from, from + length).arrayBuffer());
}

/** The archive's directory, read from its end (ZIP64 too). */
async function directory(blob: Blob): Promise<Entry[]> {
  const tailLength = Math.min(blob.size, 22 + 0xffff + 20);
  const tail = await read(blob, blob.size - tailLength, tailLength);
  const view = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end of central directory');
  let count = view.getUint16(eocd + 10, true);
  let size = view.getUint32(eocd + 12, true);
  let offset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || view.getUint32(locator, true) !== 0x07064b50) {
      throw new Error('no zip64 locator');
    }
    const at = Number(view.getBigUint64(locator + 8, true));
    const z = await read(blob, at, 56);
    const zv = new DataView(z.buffer);
    if (zv.getUint32(0, true) !== 0x06064b50) throw new Error('no zip64 end');
    count = Number(zv.getBigUint64(32, true));
    size = Number(zv.getBigUint64(40, true));
    offset = Number(zv.getBigUint64(48, true));
  }
  if (offset + size > blob.size) throw new Error('directory out of range');
  const cd = await read(blob, offset, size);
  const cv = new DataView(cd.buffer);
  const entries: Entry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.length || cv.getUint32(p, true) !== 0x02014b50) {
      throw new Error('bad central directory');
    }
    const flags = cv.getUint16(p + 8, true);
    const nameLength = cv.getUint16(p + 28, true);
    const extraLength = cv.getUint16(p + 30, true);
    const commentLength = cv.getUint16(p + 32, true);
    const entry: Entry = {
      name: decodeName(
        cd.subarray(p + 46, p + 46 + nameLength),
        !!(flags & 0x800),
      ),
      method: cv.getUint16(p + 10, true),
      encrypted: !!(flags & 1),
      compressedSize: cv.getUint32(p + 20, true),
      size: cv.getUint32(p + 24, true),
      localOffset: cv.getUint32(p + 42, true),
    };
    // ZIP64 extra field: the values that did not fit, in this order.
    let e = p + 46 + nameLength;
    const end = e + extraLength;
    while (e + 4 <= end) {
      const id = cv.getUint16(e, true);
      const length = cv.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        const next = () => {
          const v = Number(cv.getBigUint64(q, true));
          q += 8;
          return v;
        };
        if (entry.size === 0xffffffff) entry.size = next();
        if (entry.compressedSize === 0xffffffff) entry.compressedSize = next();
        if (entry.localOffset === 0xffffffff) entry.localOffset = next();
      }
      e += 4 + length;
    }
    entries.push(entry);
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Where an entry's data begins: after its local header. */
async function dataStart(blob: Blob, entry: Entry): Promise<number> {
  const header = await read(blob, entry.localOffset, 30);
  const hv = new DataView(header.buffer);
  if (header.length < 30 || hv.getUint32(0, true) !== 0x04034b50) {
    throw new Error('bad local header');
  }
  return (
    entry.localOffset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true)
  );
}

/** A GEDZIP whose dataset is read; its other files open on request. */
export interface ReadGedzip {
  gedcom: Uint8Array;
  gedcomName: string;
  /** The files `wanted` accepts (by archive path), as in OpenedGedzip. */
  open(wanted: (name: string) => boolean): Promise<Map<string, Blob>>;
}

/** Reads a GEDZIP's directory and its dataset. Throws LoadError
 *  NO_GEDCOM_IN_ZIP, TOO_LARGE or NOT_GEDCOM (damaged archive). */
export async function readGedzip(blob: Blob): Promise<ReadGedzip> {
  let entries: Entry[];
  try {
    entries = await directory(blob);
  } catch (cause) {
    throw loadError('NOT_GEDCOM', 'The archive is damaged', cause);
  }
  const wanted = entries.filter((e) => !isIgnored(e.name) && !e.encrypted);
  const gedcomName = pickDataset(wanted.map((e) => e.name));
  if (gedcomName === undefined) {
    throw loadError('NO_GEDCOM_IN_ZIP', 'The archive has no gedcom.ged');
  }
  const folder = gedcomName.includes('/')
    ? gedcomName.slice(0, gedcomName.lastIndexOf('/') + 1)
    : '';
  const dataset = wanted.find((e) => e.name === gedcomName)!;
  const others = wanted.filter((e) => e !== dataset);
  if (dataset.size > MAX_UNPACKED_BYTES) {
    throw loadError('TOO_LARGE', 'The archive is too large when unpacked');
  }

  const contents = async (entry: Entry): Promise<Blob | Uint8Array> => {
    const start = await dataStart(blob, entry);
    if (entry.method === 0) return blob.slice(start, start + entry.size);
    if (entry.method !== 8) throw new Error(`method ${entry.method}`);
    const packed = await read(blob, start, entry.compressedSize);
    return inflateSync(packed, {out: new Uint8Array(entry.size)});
  };

  let gedcom: Uint8Array;
  try {
    const raw = await contents(dataset);
    gedcom =
      raw instanceof Blob ? new Uint8Array(await raw.arrayBuffer()) : raw;
  } catch (cause) {
    throw loadError('NOT_GEDCOM', 'The archive is damaged', cause);
  }

  const open = async (accept: (name: string) => boolean) => {
    const chosen = others.filter((e) => accept(e.name));
    // Into memory go only compressed files (a zip bomb stops here).
    const unpacked = chosen
      .filter((e) => e.method !== 0)
      .reduce((sum, e) => sum + e.size, 0);
    if (unpacked > MAX_UNPACKED_BYTES) {
      throw loadError('TOO_LARGE', 'The archive is too large when unpacked');
    }
    try {
      const opened = await Promise.all(
        chosen.map(async (entry) => {
          const data = await contents(entry);
          const type = guessMime(entry.name) ?? 'application/octet-stream';
          const file =
            data instanceof Blob
              ? data.slice(0, data.size, type)
              : new Blob([data as BlobPart], {type});
          return [entry.name, file] as const;
        }),
      );
      const files = new Map<string, Blob>(opened);
      if (folder) {
        for (const [name, file] of opened) {
          const inside = name.startsWith(folder)
            ? name.slice(folder.length)
            : undefined;
          if (inside && !files.has(inside)) files.set(inside, file);
        }
      }
      return files;
    } catch (cause) {
      throw loadError('NOT_GEDCOM', 'The archive is damaged', cause);
    }
  };
  return {gedcom, gedcomName, open};
}

/** Opens a GEDZIP with all its files (see readGedzip). */
export async function openGedzip(blob: Blob): Promise<OpenedGedzip> {
  const archive = await readGedzip(blob);
  return {
    gedcom: archive.gedcom,
    gedcomName: archive.gedcomName,
    files: await archive.open(() => true),
  };
}

/** True when the bytes start like a zip archive. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05)
  );
}
