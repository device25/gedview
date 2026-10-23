// GEDZIP (FamilySearch GEDCOM 7.0 chapter 4): a zip archive with the dataset
// as gedcom.ged and the media files next to it.

import {unzipSync, type UnzipFileInfo} from 'fflate';
import {loadError} from './errors';

/** Upper bound for the unpacked size of an archive (zip bombs). */
export const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;

export interface UnpackedGedzip {
  /** Bytes of the dataset. */
  gedcom: Uint8Array;
  /** Name of the dataset entry inside the archive. */
  gedcomName: string;
  /** Every other file by its zip path ("/" separators). */
  files: Map<string, Uint8Array>;
}

/** Zip names that are not flagged as UTF-8 are read as Latin-1 by fflate;
 *  many tools write UTF-8 bytes without the flag. Undo that when the bytes
 *  form valid UTF-8. */
function fixName(name: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) {
    return name.replace(/\\/g, '/');
  }
  const bytes = Uint8Array.from(name, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', {fatal: true})
      .decode(bytes)
      .replace(/\\/g, '/');
  } catch {
    return name.replace(/\\/g, '/');
  }
}

const isIgnored = (name: string) =>
  name.endsWith('/') ||
  name.startsWith('__MACOSX/') ||
  name.endsWith('.DS_Store');

/** The dataset entry: gedcom.ged at the root, else the only *.ged (a single
 *  one at the root wins over those in folders). */
function pickDataset(names: string[]): string | undefined {
  const exact = names.find((n) => n === 'gedcom.ged');
  if (exact) return exact;
  const rootCi = names.find((n) => n.toLowerCase() === 'gedcom.ged');
  if (rootCi) return rootCi;
  const geds = names.filter((n) => n.toLowerCase().endsWith('.ged'));
  if (geds.length === 1) return geds[0];
  const atRoot = geds.filter((n) => !n.includes('/'));
  return atRoot.length === 1 ? atRoot[0] : undefined;
}

/** Unpacks a GEDZIP. Throws LoadError NO_GEDCOM_IN_ZIP, TOO_LARGE or
 *  NOT_GEDCOM (damaged archive). */
export function unpackGedzip(data: Uint8Array): UnpackedGedzip {
  // First pass reads only the directory of the archive.
  const listing: Array<{raw: string; size: number}> = [];
  try {
    unzipSync(data, {
      filter(file: UnzipFileInfo) {
        listing.push({raw: file.name, size: file.originalSize});
        return false;
      },
    });
  } catch (cause) {
    throw loadError('NOT_GEDCOM', 'The archive is damaged', cause);
  }
  const wanted = listing.filter((e) => !isIgnored(fixName(e.raw)));
  const total = wanted.reduce((sum, e) => sum + e.size, 0);
  if (total > MAX_UNPACKED_BYTES) {
    throw loadError('TOO_LARGE', 'The archive is too large when unpacked');
  }
  const names = wanted.map((e) => fixName(e.raw));
  const datasetName = pickDataset(names);
  if (datasetName === undefined) {
    throw loadError('NO_GEDCOM_IN_ZIP', 'The archive has no gedcom.ged');
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (file) => !isIgnored(fixName(file.name)),
    });
  } catch (cause) {
    throw loadError('NOT_GEDCOM', 'The archive is damaged', cause);
  }
  const files = new Map<string, Uint8Array>();
  let gedcom: Uint8Array | undefined;
  for (const [raw, bytes] of Object.entries(entries)) {
    const name = fixName(raw);
    if (name === datasetName) gedcom = bytes;
    else files.set(name, bytes);
  }
  if (!gedcom)
    throw loadError('NO_GEDCOM_IN_ZIP', 'The archive has no gedcom.ged');
  return {gedcom, gedcomName: datasetName, files};
}

/** True when the bytes start like a zip archive. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05)
  );
}
