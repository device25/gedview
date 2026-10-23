// Finding the URL of a media file, and deciding which URLs are safe to put
// into the page.

import {guessMime} from './mime';
import type {MediaMap} from '../gedcom/types';

const SAFE_DATA_IMAGE =
  /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif|x-icon|vnd\.microsoft\.icon)[;,]/i;

/** Returns the URL when it may be used for an <img src> or a link: only
 *  http, https, blob and raster data:image URLs pass. Anything else
 *  (javascript:, file:, data:text/html, data:image/svg+xml, relative
 *  paths, ...) gives undefined. */
export function safeMediaUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const trimmed = url.trim();
  // Control characters are ignored inside schemes by browsers ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  if (trimmed === '' || /[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return undefined;
    }
  }
  if (/^blob:/i.test(trimmed)) return trimmed;
  if (SAFE_DATA_IMAGE.test(trimmed)) return trimmed;
  return undefined;
}

/** True for http(s) URLs and other absolute URLs (anything with a scheme). */
function hasScheme(path: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(path);
}

/** Percent-decodes a FILE reference; malformed escapes are left as they
 *  are. 5.5.1 backslashes become "/". */
export function decodeFilePath(path: string): string {
  const slashed = path.replace(/\\/g, '/');
  try {
    return decodeURIComponent(slashed);
  } catch {
    return slashed;
  }
}

const key = (s: string) => s.normalize('NFC').toLowerCase();
const baseName = (s: string) => s.slice(s.lastIndexOf('/') + 1);

/** Finds the entry of a MediaMap for a FILE reference. Tries, in order: the
 *  decoded path as written, case-insensitive (and Unicode-normalised)
 *  match, then the file name alone when only one entry has that name. */
export function lookupMedia(media: MediaMap, path: string): string | undefined {
  if (media.size === 0) return undefined;
  const decoded = decodeFilePath(path).replace(/^\.\//, '');
  const exact = media.get(decoded) ?? media.get(path);
  if (exact !== undefined) return exact;
  const wanted = key(decoded);
  const wantedName = baseName(wanted);
  const sameName = new Set<string>();
  for (const [k, v] of media) {
    const kk = key(k);
    if (kk === wanted) return v;
    if (baseName(kk) === wantedName) sameName.add(v);
  }
  // Only a file name that identifies a single file is trusted.
  return sameName.size === 1 ? [...sameName][0] : undefined;
}

/** URL to show for a FILE reference: a remote http(s) URL as written, a
 *  bundled file via the MediaMap, never anything unsafe. */
export function mediaUrl(media: MediaMap, path: string): string | undefined {
  if (hasScheme(path)) return safeMediaUrl(path);
  return safeMediaUrl(lookupMedia(media, path));
}

/** True when the file is an image, by its media type, else by extension. */
export function isImageFile(file: {path: string; mime?: string}): boolean {
  return (file.mime ?? guessMime(file.path))?.startsWith('image/') ?? false;
}
