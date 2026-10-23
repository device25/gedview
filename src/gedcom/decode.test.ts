import {describe, expect, it} from 'vitest';
import {decodeGedcomBytes} from './decode';

const text = '0 HEAD\n1 NOTE Привет, мир! ë\n0 TRLR\n';
const utf8 = (s: string) => new TextEncoder().encode(s);
const utf16 = (s: string, bigEndian: boolean, bom: boolean) => {
  const units = [...((bom ? '﻿' : '') + s)].flatMap((c) => {
    const code = c.charCodeAt(0);
    return bigEndian ? [code >> 8, code & 0xff] : [code & 0xff, code >> 8];
  });
  return new Uint8Array(units);
};

describe('decodeGedcomBytes', () => {
  it('reads UTF-8 without BOM', () => {
    expect(decodeGedcomBytes(utf8(text))).toEqual({
      text,
      encoding: 'utf-8',
      fallback: false,
    });
  });

  it('strips a UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(text)]);
    expect(decodeGedcomBytes(bytes)).toEqual({
      text,
      encoding: 'utf-8',
      fallback: false,
    });
  });

  it('reads UTF-16 LE and BE with BOM', () => {
    expect(decodeGedcomBytes(utf16(text, false, true))).toEqual({
      text,
      encoding: 'utf-16le',
      fallback: false,
    });
    expect(decodeGedcomBytes(utf16(text, true, true))).toEqual({
      text,
      encoding: 'utf-16be',
      fallback: false,
    });
  });

  it('recognises UTF-16 without BOM from the first characters', () => {
    expect(decodeGedcomBytes(utf16(text, false, false)).text).toBe(text);
    expect(decodeGedcomBytes(utf16(text, true, false)).text).toBe(text);
  });

  it('falls back to windows-1252 for bytes that are not UTF-8', () => {
    const bytes = new Uint8Array([
      ...utf8('0 HEAD\n1 NOTE caf'),
      0xe9,
      ...utf8('\n0 TRLR'),
    ]);
    const r = decodeGedcomBytes(bytes);
    expect(r.encoding).toBe('windows-1252');
    expect(r.fallback).toBe(true);
    expect(r.text).toContain('café');
  });

  it('copes with empty input', () => {
    expect(decodeGedcomBytes(new Uint8Array()).text).toBe('');
  });
});
