// Bytes -> text for GEDCOM files: UTF-8 (with or without BOM), UTF-16 LE/BE
// (with BOM, or recognised by the null bytes of a leading "0 HEAD"), and a
// windows-1252 fallback for legacy ANSI files.

export type GedcomEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export interface DecodedText {
  /** Text without a byte-order mark. */
  text: string;
  encoding: GedcomEncoding;
  /** True when the bytes were not valid UTF-8 and the legacy fallback ran. */
  fallback: boolean;
}

export function decodeGedcomBytes(bytes: Uint8Array): DecodedText {
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
    return {
      text: decode('utf-8', bytes.subarray(3)),
      encoding: 'utf-8',
      fallback: false,
    };
  }
  if (b0 === 0xff && b1 === 0xfe) {
    return {
      text: decode('utf-16le', bytes.subarray(2)),
      encoding: 'utf-16le',
      fallback: false,
    };
  }
  if (b0 === 0xfe && b1 === 0xff) {
    return {
      text: decode('utf-16be', bytes.subarray(2)),
      encoding: 'utf-16be',
      fallback: false,
    };
  }
  // No BOM: "0" followed by a null byte (or the other way round).
  if (b0 === 0x30 && b1 === 0x00) {
    return {
      text: decode('utf-16le', bytes),
      encoding: 'utf-16le',
      fallback: false,
    };
  }
  if (b0 === 0x00 && b1 === 0x30) {
    return {
      text: decode('utf-16be', bytes),
      encoding: 'utf-16be',
      fallback: false,
    };
  }
  try {
    return {
      text: new TextDecoder('utf-8', {fatal: true}).decode(bytes),
      encoding: 'utf-8',
      fallback: false,
    };
  } catch {
    return {
      text: decode('windows-1252', bytes),
      encoding: 'windows-1252',
      fallback: true,
    };
  }
}

function decode(encoding: string, bytes: Uint8Array): string {
  return new TextDecoder(encoding, {ignoreBOM: true}).decode(bytes);
}
