import {describe, expect, it} from 'vitest';
import {
  decodeFilePath,
  isImageFile,
  lookupMedia,
  mediaUrl,
  safeMediaUrl,
} from './mediaUrl';
import {guessMime, mimeFromForm} from './mime';

describe('safeMediaUrl', () => {
  it('lets http, https, blob and raster data:image through', () => {
    for (const url of [
      'https://example.com/a.jpg',
      'http://example.com/a.jpg?x=1#y',
      'HTTPS://EXAMPLE.COM/A',
      'blob:https://app.example/1234-5678',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/jpeg;base64,/9j/4AAQ',
      'data:IMAGE/GIF;base64,R0lGOD',
    ]) {
      expect(safeMediaUrl(url), url).toBe(url);
    }
    expect(safeMediaUrl('  https://example.com/a  ')).toBe(
      'https://example.com/a',
    );
  });

  it('refuses everything else', () => {
    for (const url of [
      undefined,
      '',
      '   ',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'data:application/pdf;base64,AA==',
      'data:image/png', // no payload separator
      'file:///etc/passwd',
      'ftp://example.com/a.jpg',
      '//example.com/a.jpg',
      '/etc/passwd',
      'media/a.jpg',
      '../a.jpg',
      'http://',
      'https://exa mple.com',
      'about:blank',
      'chrome://settings',
    ]) {
      expect(safeMediaUrl(url), String(url)).toBeUndefined();
    }
  });
});

describe('FILE references', () => {
  it('decodes percent escapes and backslashes', () => {
    expect(decodeFilePath('media/CharlotteBront%C3%AB.jpg')).toBe(
      'media/CharlotteBrontë.jpg',
    );
    expect(decodeFilePath('media\\sub\\a%20b.jpg')).toBe('media/sub/a b.jpg');
    expect(decodeFilePath('bad%zz%')).toBe('bad%zz%');
    expect(decodeFilePath('plain.jpg')).toBe('plain.jpg');
  });

  const media = new Map([
    ['media/CharlotteBrontë.jpg', 'blob:1'],
    ['Photos/Ivan.JPG', 'blob:2'],
    ['a/same.png', 'blob:3'],
    ['b/same.png', 'blob:4'],
  ]);

  it('finds the file by its decoded path first', () => {
    expect(lookupMedia(media, 'media/CharlotteBront%C3%AB.jpg')).toBe('blob:1');
    expect(lookupMedia(media, './media/CharlotteBront%C3%AB.jpg')).toBe(
      'blob:1',
    );
  });

  it('then ignores case and Unicode normalisation', () => {
    expect(lookupMedia(media, 'MEDIA/charlottebrontë.JPG')).toBe('blob:1');
    expect(lookupMedia(media, 'media/CharlotteBronte\u0308.jpg')).toBe(
      'blob:1',
    ); // decomposed ë
    expect(lookupMedia(media, 'photos/ivan.jpg')).toBe('blob:2');
  });

  it('then falls back to the file name alone, if only one file has it', () => {
    expect(lookupMedia(media, 'elsewhere/Ivan.jpg')).toBe('blob:2');
    expect(lookupMedia(media, 'elsewhere/same.png')).toBeUndefined();
    expect(lookupMedia(media, 'a/same.png')).toBe('blob:3');
    expect(lookupMedia(media, 'nothing.jpg')).toBeUndefined();
    expect(lookupMedia(new Map(), 'a.jpg')).toBeUndefined();
  });

  it('does not take two keys of one file for an ambiguity', () => {
    const m = new Map([
      ['media/a.jpg', 'blob:9'],
      ['a.jpg', 'blob:9'],
    ]);
    expect(lookupMedia(m, 'other/a.jpg')).toBe('blob:9');
  });

  it('mediaUrl takes remote URLs as they are, bundled files from the map, never unsafe ones', () => {
    expect(mediaUrl(media, 'https://example.com/a.jpg')).toBe(
      'https://example.com/a.jpg',
    );
    expect(mediaUrl(media, 'media/CharlotteBront%C3%AB.jpg')).toBe('blob:1');
    expect(mediaUrl(media, 'file:///c:/windows/absolute')).toBeUndefined();
    expect(mediaUrl(media, 'javascript:alert(1)')).toBeUndefined();
    expect(mediaUrl(media, 'missing.jpg')).toBeUndefined();
    expect(
      mediaUrl(new Map([['x', 'javascript:alert(1)']]), 'x'),
    ).toBeUndefined();
  });
});

describe('media types', () => {
  it('knows what is an image', () => {
    expect(isImageFile({path: 'a.jpg', mime: 'image/jpeg'})).toBe(true);
    expect(isImageFile({path: 'a.jpg'})).toBe(true);
    expect(isImageFile({path: 'a.mp3', mime: 'audio/mpeg'})).toBe(false);
    expect(isImageFile({path: 'noextension'})).toBe(false);
    expect(isImageFile({path: 'photo.jpg', mime: 'text/plain'})).toBe(false);
  });

  it('guesses a media type from a path', () => {
    expect(guessMime('media/a.JPG')).toBe('image/jpeg');
    expect(guessMime('https://x.org/a.png?size=2#frag')).toBe('image/png');
    expect(guessMime('dir.d/file')).toBeUndefined();
    expect(guessMime('a.unknownext')).toBeUndefined();
  });

  it('reads FORM payloads', () => {
    expect(mimeFromForm('image/png')).toBe('image/png');
    expect(mimeFromForm(' JPG ')).toBe('image/jpeg');
    expect(mimeFromForm('.png')).toBe('image/png');
    expect(mimeFromForm('xyz')).toBeUndefined();
    expect(mimeFromForm(undefined)).toBeUndefined();
  });
});
